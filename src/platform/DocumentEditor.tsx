import {useContext} from 'react';
import {ShortcutContext} from '../shared/editor/shortcuts';
import { useEffect, useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import type { Resource, DocumentSession, OfficeEditor } from '../contracts';
import type { EditorHandle } from './NoteEditor';
import { DocumentEditingSession } from '../shared/editor/document-session';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { DocumentPreview, canReadDocument } from './DocumentPreview';

export function canEditDocument(resource: Resource) { return resource.kind === 'file' && /\.(md|markdown|docx|doc|xlsx|xls|csv|tsv)$/i.test(resource.originalName ?? ''); }
export function DocumentEditor({ resource, session, editorRef, onBack, onSaved, onCopy }: {
  resource: Resource; session: DocumentSession; editorRef: Ref<EditorHandle | null>;
  onBack: () => void; onSaved: () => Promise<void>; onCopy: (id: string) => Promise<void>;
}) {
  const shortcuts=useContext(ShortcutContext);
  const [controller] = useState(() => new DocumentEditingSession(resource, session));
  const [state, setState] = useState(controller.state());
  const [html, setHtml] = useState('');
  const [editors, setEditors] = useState<OfficeEditor[]>([]);
  const [editorId, setEditorId] = useState('system');
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const markdown = session.markdown !== null;
  useEffect(() => controller.subscribe(setState), [controller]);
  useImperativeHandle(editorRef, () => ({ flush: () => controller.flush(), checkpoint: () => controller.checkpoint() }), [controller]);
  useEffect(() => {
    if (!markdown) return;
    const timer = setTimeout(() => { void controller.checkpoint(); }, 2000);
    return () => clearTimeout(timer);
  }, [controller, markdown, state.text]);
  useEffect(() => {
    if (!markdown) return;
    let active = true;
    const timer = setTimeout(() => { void command('preview_markdown', { text: state.text }).then(html => { if (active) setHtml(html); }).catch(error => { if (active) setError(asAppError(error)); }); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [markdown, state.text]);
  useEffect(() => {
    if (markdown) return;
    let active = true;
    void command('list_office_editors', {}).then(items => { if (active) { const available = items.filter(item => item.formats.includes(session.format)); setEditors(available); setEditorId(available.find(item => item.id !== 'system')?.id ?? 'system'); } }).catch(error => { if (active) setError(asAppError(error)); });
    return () => { active = false; };
  }, [markdown, session.format]);
  async function action(work: () => Promise<void>) {
    if (actionBusy || state.busy) return;
    setActionBusy(true); setError(null); setNotice('');
    try { await work(); } catch (error) { setError(asAppError(error)); } finally { setActionBusy(false); }
  }
  const busy = actionBusy || state.busy;
  return <section className="document-workspace" aria-label="文档编辑器">
    <div className="page-heading"><div><p className="eyebrow">文档编辑 · {session.format.toUpperCase()}</p><h1>{state.resource.name}</h1><p className="metadata">资料版本 {state.resource.revision} · 原件与已提交历史保留</p></div><button disabled={busy} onClick={onBack}>返回资料库</button></div>
    <div className="document-toolbar"><span role="status" className="save-indicator">{state.status}</span>
      <button className="primary" disabled={busy} onClick={() => { void action(async () => { if (await controller.save()) { setNotice('已提交到资料库，完整文件已建立版本。'); await onSaved(); } }); }}>{markdown ? '保存文档' : '提交 Office 修改'}</button>
      <button disabled={busy} onClick={() => { void action(async () => { if (markdown && !await controller.checkpoint()) return; const copy = await command('copy_document_edit', { id: session.id }); const preserved = controller.preserveForNavigation(); await onSaved(); if (preserved) await onCopy(copy.id); else setNotice('副本已创建；另存期间的后续输入保留在当前文档，请继续保存。'); }); }}>另存为副本</button>
      <button disabled={busy} onClick={() => setConfirmEnd(!confirmEnd)}>结束编辑会话</button>
    </div>
    <ErrorMessage error={state.error ?? error} />
    {notice && <p className="success-message" role="status">{notice}</p>}
    {confirmEnd && <div className="recovery-panel"><p>结束会移除该会话的未提交草稿或编辑副本。资料库的文件及历史版本仍保留；Office 文档请先保存并关闭。</p><div className="card-actions"><button className="primary" disabled={busy} onClick={() => { void action(async () => { if (!await (markdown ? controller.flush() : controller.save())) return; await command('end_document_edit', { id: session.id, editSequence: controller.state().session.editSequence }); controller.end(); setConfirmEnd(false); await onSaved(); onBack(); }); }}>先保存并结束</button><button disabled={busy} onClick={() => { void action(async () => { if (markdown && !await controller.checkpoint()) return; await command('end_document_edit', { id: session.id, editSequence: controller.state().session.editSequence }); controller.end(); setConfirmEnd(false); await onSaved(); onBack(); }); }}>放弃会话修改并结束</button><button disabled={busy} onClick={() => setConfirmEnd(false)}>继续编辑</button></div></div>}
    {markdown ? <div className="markdown-editor-layout"><label className="markdown-source">Markdown 源文<textarea disabled={actionBusy && confirmEnd} spellCheck={false} aria-label="Markdown 源文" value={state.text} onChange={e => controller.edit(e.target.value)} onCompositionStart={() => controller.composing(true)} onCompositionEnd={() => controller.composing(false)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key.toUpperCase() === shortcuts.save) { e.preventDefault(); void action(async () => { if (await controller.save()) await onSaved(); }); } }} /></label><section className="markdown-rendered"><h2>排版预览</h2><div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} /></section></div> : <>
      <div className="office-edit-panel"><h2>在 Office 中完整编辑</h2><p>使用本机 Word、Excel、WPS 或 LibreOffice 编辑副本，可处理图片、分页排版、合并单元格、图表与公式。编辑器兼容性取决于所选应用。</p><div className="office-launch"><label>编辑器<select aria-label="Office 编辑器" disabled={busy} value={editorId} onChange={e => setEditorId(e.target.value)}>{editors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="primary" disabled={busy || !editors.length} onClick={() => { void action(async () => { await command('open_document_editor', { id: session.id, editorId }); setNotice('已发送打开请求。请在 Office 中保存并关闭，再回到这里提交；未出现窗口时请检查编辑器安装。'); }); }}>打开编辑副本</button></div><ol><li>打开副本，在 Office 中编辑。</li><li>保存并关闭该文档，保持原文件格式。</li><li>返回墨枢，点击“提交 Office 修改”。</li></ol><p className="metadata">需要本机已安装对应应用；“系统默认应用”是否可编辑取决于系统关联。公式重算由 Office 完成；墨枢下方展示已提交文件的内容摘要。</p></div>
      {canReadDocument(state.resource) && <section className="detail-panel"><h2>已提交内容</h2><DocumentPreview key={`${state.resource.id}:${state.resource.revision}`} resource={state.resource} /></section>}
    </>}
  </section>;
}
