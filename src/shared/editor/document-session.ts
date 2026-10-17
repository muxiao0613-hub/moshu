import type { DocumentSave, DocumentSession, Resource, AppError } from '../../contracts';
import { command, asAppError } from '../lib/bridge';

export type DocumentState = { session: DocumentSession; resource: Resource; text: string; dirty: boolean; status: string; error: AppError | null; busy: boolean };
export class DocumentEditingSession {
  private value: DocumentState;
  private sequence: number;
  private savedText: string | null;
  private composed = false;
  private ended = false;
  private queue: Promise<boolean> = Promise.resolve(true);
  private listeners = new Set<(state: DocumentState) => void>();
  constructor(resource: Resource, session: DocumentSession) {
    this.sequence = session.editSequence;
    this.savedText = session.changed ? null : session.markdown;
    this.value = { resource, session, text: session.markdown ?? '', dirty: session.changed, status: session.changed ? '已恢复未提交的修改' : '文件已保存', error: null, busy: false };
  }
  state() { return this.value; }
  subscribe(listener: (state: DocumentState) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<DocumentState>) { this.value = { ...this.value, ...patch }; this.listeners.forEach(listener => listener(this.value)); }
  edit(text: string) {
    this.sequence += 1;
    this.update({ text, dirty: text !== this.savedText, status: '尚未提交', error: null });
  }
  composing(value: boolean) { this.composed = value; }
  preserveForNavigation() {
    const copiedText = this.value.session.markdown;
    const dirty = copiedText !== null && this.value.text !== copiedText;
    this.savedText = copiedText;
    this.update({ dirty, status: dirty ? '副本已创建 · 后续输入仍在当前文档' : '修改已另存副本 · 原会话保留' });
    return !dirty;
  }
  end() { this.ended = true; this.composed = false; this.update({ dirty: false }); }
  private enqueue(work: () => Promise<void>) {
    const next = this.queue.then(async () => {
      this.update({ busy: true, error: null });
      try { await work(); return true; }
      catch (error) { const value = asAppError(error); this.update({ error: value, status: value.code === 'CONFLICT' ? '版本冲突 · 修改已保留' : '操作失败 · 修改已保留' }); return false; }
      finally { this.update({ busy: false }); }
    });
    this.queue = next;
    return next;
  }
  async checkpoint() {
    if (this.ended) return true;
    if (this.composed) return false;
    if (this.value.session.markdown === null) return true;
    return this.enqueue(async () => {
      const text = this.value.text; const sequence = this.sequence;
      const saved = await command('write_markdown_draft', { id: this.value.session.id, editSequence: sequence, text });
      if (saved.id !== this.value.session.id || saved.editSequence !== sequence || saved.markdown !== text) throw new Error('恢复草稿回执无效');
      this.update({ session: saved, status: this.value.dirty ? '恢复草稿已保存 · 尚未提交' : '文件已保存' });
    });
  }
  async save() {
    if (this.ended) return true;
    if (this.composed) return false;
    return this.enqueue(async () => {
      const snapshot = { text: this.value.text, sequence: this.sequence, session: this.value.session };
      if (snapshot.session.markdown !== null) {
        const draft = await command('write_markdown_draft', { id: snapshot.session.id, editSequence: snapshot.sequence, text: snapshot.text });
        if (draft.id !== snapshot.session.id || draft.editSequence !== snapshot.sequence || draft.markdown !== snapshot.text) throw new Error('恢复草稿回执无效');
        this.update({ session: draft });
      }
      this.update({ status: '正在提交…' });
      const saved = await command('commit_document_edit', { id: snapshot.session.id, baseRevision: snapshot.session.baseRevision, editSequence: snapshot.sequence });
      this.applyReceipt(saved, snapshot.text, snapshot.sequence);
    });
  }
  private applyReceipt(saved: DocumentSave, text: string, sequence: number) {
    if (saved.receipt.entityId !== this.value.resource.id || saved.receipt.clientEditSequence !== sequence || saved.receipt.savedRevision !== saved.resource.revision || saved.session.id !== this.value.session.id || saved.session.baseRevision !== saved.resource.revision) throw new Error('文件保存回执无效');
    this.savedText = saved.session.markdown === null ? null : text;
    const dirty = saved.session.markdown !== null && this.value.text !== text;
    this.update({ resource: saved.resource, session: saved.session, dirty, status: dirty ? '后续输入尚未提交' : '文件已保存' });
  }
  async flush() {
    if (this.ended) return true;
    if (this.value.session.markdown === null) return true; // Office owns its save operation; the durable session remains available.
    for (let attempts = 0; this.value.dirty && attempts < 5; attempts += 1) { if (!await this.save()) return false; }
    await this.queue;
    return !this.value.dirty && !this.composed;
  }
}
