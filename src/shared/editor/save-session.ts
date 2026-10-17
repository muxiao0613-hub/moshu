import type { JSONContent } from '@tiptap/react';
import type { AppError, Note, NoteDraft, SaveNote, SaveReceipt } from '../../contracts';
import { asAppError } from '../lib/bridge';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict';
export interface SaveState { status: SaveStatus; dirty: boolean; sequence: number; revision: number; error: AppError | null; draftError: AppError | null }
export interface DraftPersistence { write: (snapshot: SaveNote) => Promise<unknown>; clear: (sequence: number) => Promise<unknown> }
type Persist = (input: SaveNote) => Promise<SaveReceipt>;

// A session belongs to one entity; requests use immutable snapshots and are serialized.
export class SaveSession {
  private title: string;
  private body: JSONContent;
  private revision: number;
  private sequence = 0;
  private savedSequence = 0;
  private active: Promise<boolean> | null = null;
  private status: SaveStatus = 'saved';
  private error: AppError | null = null;
  private draftError: AppError | null = null;
  private draftQueue: Promise<unknown> = Promise.resolve();
  composing = false;
  constructor(private readonly note: Note, private readonly persist: Persist, private readonly changed: (state: SaveState) => void, private readonly drafts?: DraftPersistence) {
    this.title = note.title; this.body = structuredClone(note.body); this.revision = note.revision;
  }
  get state(): SaveState {
    return { status: this.status, dirty: this.sequence > this.savedSequence, sequence: this.sequence, revision: this.revision, error: this.error, draftError: this.draftError };
  }
  edit(title: string, body: JSONContent) {
    this.title = title; this.body = structuredClone(body); this.sequence += 1;
    if (this.status !== 'conflict') { this.status = this.active ? 'saving' : 'dirty'; this.error = null; }
    this.changed(this.state);
  }
  async save(createVersion = false): Promise<boolean> {
    if (this.composing) return false;
    if (this.active) {
      if (!await this.active) return false;
      return this.save(createVersion);
    }
    if (!this.state.dirty && !createVersion) return true;
    if (this.status === 'conflict') return false;
    const snapshot = this.snapshot(createVersion);
    this.status = 'saving'; this.error = null; this.changed(this.state);
    const task = (async () => {
      if (this.drafts) await this.draftOperation(() => this.drafts!.write(snapshot));
      return this.persist(snapshot);
    })().then(async receipt => {
      if (receipt.entityId !== snapshot.id || receipt.clientEditSequence !== snapshot.clientEditSequence
        || receipt.savedRevision !== snapshot.baseRevision + 1) throw new Error('Invalid save receipt');
      this.revision = receipt.savedRevision;
      this.savedSequence = receipt.clientEditSequence;
      if (this.drafts) {
        try { await this.draftOperation(() => this.drafts!.clear(receipt.clientEditSequence)); this.draftError = null; }
        catch (error) { this.draftError = asAppError(error); }
      }
      this.status = this.state.dirty ? 'dirty' : 'saved';
      return true;
    }).catch((error: unknown) => {
      this.error = asAppError(error);
      this.status = this.error.code === 'CONFLICT' ? 'conflict' : 'failed';
      return false;
    }).finally(() => {
      this.active = null; this.changed(this.state);
    });
    this.active = task;
    return task;
  }
  private snapshot(createVersion = false): SaveNote {
    return { id: this.note.id, title: this.title, body: structuredClone(this.body), schemaVersion: this.note.schemaVersion,
      baseRevision: this.revision, clientEditSequence: this.sequence, createVersion };
  }
  private draftOperation(work: () => Promise<unknown>): Promise<unknown> {
    const task = this.draftQueue.then(work); this.draftQueue = task.catch(() => {}); return task;
  }
  async checkpoint(): Promise<boolean> {
    if (!this.drafts || !this.state.dirty) return true;
    if (this.composing) return false;
    const snapshot = this.snapshot();
    try {
      await this.draftOperation(() => this.drafts!.write(snapshot));
      if (this.draftError) { this.draftError = null; this.changed(this.state); }
      if (this.state.dirty && this.sequence !== snapshot.clientEditSequence) return this.checkpoint();
      return true;
    } catch (error) { this.draftError = asAppError(error); this.changed(this.state); return false; }
  }
  recover(draft: NoteDraft) {
    if (this.active || draft.noteId !== this.note.id) throw new Error('Invalid draft recovery');
    this.title = draft.title; this.body = structuredClone(draft.body);
    this.sequence = Math.max(this.sequence, draft.clientEditSequence) + 1;
    this.status = 'conflict';
    this.error = { code: 'CONFLICT', message: '恢复稿尚未提交，请对照数据库稿后合并保存。', retryable: false, requestId: crypto.randomUUID() };
    this.changed(this.state);
  }
  rebase(revision: number) {
    if (this.active || this.status !== 'conflict' || !Number.isSafeInteger(revision) || revision < this.revision) throw new Error('Invalid conflict resolution');
    this.revision = revision; this.sequence += 1; this.status = 'dirty'; this.error = null; this.changed(this.state);
  }
  load(note: Note) {
    if (this.active || note.id !== this.note.id || this.state.dirty) throw new Error('Unsaved editor cannot be replaced');
    this.title = note.title; this.body = structuredClone(note.body); this.revision = note.revision;
    this.status = 'saved'; this.error = null; this.changed(this.state);
  }
  async flush(): Promise<boolean> {
    if (this.composing) return false;
    if (this.state.dirty && !await this.checkpoint()) return false;
    do { if (!await this.save()) return false; } while (this.state.dirty);
    return true;
  }
}
