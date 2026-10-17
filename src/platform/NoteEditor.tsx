import {useContext} from 'react';
import {ShortcutContext} from '../shared/editor/shortcuts';
import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Note, NoteDraft } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { SaveSession } from '../shared/editor/save-session';
import type { SaveState } from '../shared/editor/save-session';
import { NoteVersions } from './NoteVersions';
import { ErrorMessage } from '../shared/ui/ErrorMessage';

export interface EditorHandle { flush: () => Promise<boolean>; checkpoint: () => Promise<boolean> }
const labels = { saved: '已保存', dirty: '未保存', saving: '保存中', failed: '保存失败', conflict: '版本冲突' };
export function NoteEditor({ note, recovery, editorRef, onSaved }: { note: Note; recovery?: NoteDraft | null; editorRef: Ref<EditorHandle>; onSaved: () => void }) {
  const shortcuts=useContext(ShortcutContext);
  const [draftSessionId] = useState(() => recovery?.sessionId ?? crypto.randomUUID());
  const [history, setHistory] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const action = useRef(false);
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const recovered = useRef(false);
  const [title, setTitle] = useState(recovery?.title ?? note.title);
  const titleRef = useRef(recovery?.title ?? note.title);
  const [state, setState] = useState<SaveState>({ status: 'saved', dirty: false, revision: note.revision, sequence: 0, error: null, draftError: null });
  const [current, setCurrent] = useState<Note | null>(null);
  const [compareError, setCompareError] = useState<ReturnType<typeof asAppError> | null>(null);
  const onSavedRef = useRef(onSaved); onSavedRef.current = onSaved;
  const [session] = useState(() => new SaveSession(note, input => command('save_note', input), next => {
    setState(next);
    if (next.status === 'saved') onSavedRef.current();
  }, {
    write: snapshot => command('write_note_draft', { draft: { sessionId: draftSessionId, noteId: note.id,
      title: snapshot.title, body: snapshot.body, schemaVersion: snapshot.schemaVersion,
      baseRevision: snapshot.baseRevision, clientEditSequence: snapshot.clientEditSequence } }),
    clear: throughSequence => command('discard_note_draft', {id: draftSessionId, throughSequence}),
  }));
  const editor = useEditor({
    extensions: [StarterKit.configure({ code: false, codeBlock: false, link: { openOnClick: false } })],
    content: recovery?.body ?? note.body,
    editorProps: { attributes: { 'aria-label': '笔记正文', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => session.edit(titleRef.current, editor.getJSON()),
  });
  useImperativeHandle(editorRef, () => ({ flush: () => action.current ? Promise.resolve(false) : session.flush(), checkpoint: () => session.checkpoint() }), [session]);
  useEffect(() => { if (recovery && !recovered.current) { recovered.current = true; session.recover(recovery); } }, [session, recovery]);
  useEffect(() => { editor?.setEditable(!actionBusy, false); }, [editor, actionBusy]);
  useEffect(() => {
    const timer = window.setInterval(() => { void session.checkpoint(); }, 2000);
    return () => window.clearInterval(timer);
  }, [session]);
  useEffect(() => {
    if (actionBusy || !state.dirty || state.status === 'conflict' || state.status === 'failed') return;
    const timeout = window.setTimeout(() => { void session.save(); }, 1000);
    return () => window.clearTimeout(timeout);
  }, [session, state.sequence, state.dirty, state.status, actionBusy]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!action.current && session.state.dirty && !['failed', 'conflict'].includes(session.state.status)) void session.save();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [session]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toUpperCase() === shortcuts.save) {
        event.preventDefault();
        if (!action.current && !session.composing && !event.isComposing) void session.save(true);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [session,shortcuts.save]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (session.state.dirty) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [session]);

  async function compare() {
    try { setCurrent(await command('get_note', { id: note.id })); setCompareError(null); }
    catch (error) { setCompareError(asAppError(error)); }
  }
  async function run(work: () => Promise<void>) {
    if (action.current) return;
    action.current = true; setActionBusy(true); setCompareError(null); setNotice('');
    try { await work(); } catch (error) { setCompareError(asAppError(error)); }
    finally { action.current = false; setActionBusy(false); }
  }
  async function merge() {
    if (!current) return;
    await run(async () => {
      session.rebase(current.revision);
      if (await session.save(true)) { setCurrent(null); setNotice('合并稿已保存，数据库原稿已建立历史版本。'); }
      else setCurrent(null);
    });
  }
  async function restore(versionId: string): Promise<Note | null> {
    let restored: Note | null = null;
    await run(async () => {
      if (!await session.flush()) return;
      const next = await command('restore_note_version', {id: note.id, versionId, baseRevision: session.state.revision});
      session.load(next); setTitle(next.title); titleRef.current = next.title;
      editor?.commands.setContent(next.body, {emitUpdate: false}); restored = next; setNotice('历史版本已恢复，替换前的正文也已保留。');
    });
    return restored;
  }
  function exportNote(format: 'txt' | 'markdown') {
    void run(async () => { if (await session.flush()) { await command('export_note', {id: note.id, baseRevision: session.state.revision, format}); setNotice('笔记副本已导出。'); } });
  }
  function applyLink() {
    if (link === null || !editor) return;
    try {
      if (!link.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
      else {
        const url = new URL(link.trim());
        if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('只支持不含用户名或密码的 HTTP(S) 链接。');
        editor.chain().focus().extendMarkRange('link').setLink({href: url.href}).run();
      }
      setLink(null); setCompareError(null);
    } catch { setCompareError({code: 'VALIDATION', message: '请输入有效的 HTTP(S) 链接；清空可移除链接。', retryable: false, requestId: crypto.randomUUID()}); }
  }
  return <section className="note-editor" aria-label="笔记编辑器"
    onCompositionStart={() => { session.composing = true; }}
    onCompositionEnd={() => { session.composing = false; if (editor) session.edit(titleRef.current, editor.getJSON()); }}>
    <div className="editor-header">
      <span className={`save-indicator ${state.status}`} role="status">{labels[state.status]}{state.dirty && state.status === 'saving' ? ' · 仍有新输入' : ''}</span>
      <span className="muted">版本 {state.revision}</span>
      <button type="button" onClick={() => { void session.save(true); }} disabled={actionBusy || state.status === 'saving' || state.status === 'conflict'}>保存并建立版本</button>
      <button type="button" disabled={actionBusy} onClick={() => setHistory(!history)}>历史版本</button>
      <button type="button" disabled={actionBusy} onClick={() => exportNote('txt')}>导出 TXT</button>
      <button type="button" disabled={actionBusy} onClick={() => exportNote('markdown')}>导出 Markdown</button>
    </div>
    <label className="sr-only" htmlFor="note-title">笔记标题</label>
    <input id="note-title" className="note-title" disabled={actionBusy} value={title} maxLength={200} onChange={event => {
      setTitle(event.target.value); titleRef.current = event.target.value;
      if (editor) session.edit(event.target.value, editor.getJSON());
    }} />
    <fieldset className="editor-toolbar" aria-label="正文格式" disabled={actionBusy}>
      <button type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>粗体</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>标题</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>列表</button>
      <button type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>引用</button>
      <button type="button" onClick={() => setLink(String(editor?.getAttributes('link').href ?? ''))}>链接</button>
      <button type="button" onClick={() => editor?.chain().focus().undo().run()}>撤销</button>
      <button type="button" onClick={() => editor?.chain().focus().redo().run()}>重做</button>
    </fieldset>
    {link !== null && <form className="link-editor" onSubmit={event => {event.preventDefault(); applyLink();}}><label>链接地址<input autoFocus value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" /></label><button type="submit">应用链接</button><button type="button" onClick={() => setLink(null)}>取消</button></form>}
    <ErrorMessage error={compareError} />
    <ErrorMessage error={state.draftError} retry={() => {void session.checkpoint();}} />
    {notice && <p role="status">{notice}</p>}
    <ErrorMessage error={state.error} retry={state.status === 'failed' ? () => { void session.save(); } : undefined} />
    {state.status === 'conflict' && <div className="conflict-panel">
      <p>当前编辑稿保留在下方。查看数据库稿后，将需要的内容合并到编辑器，再提交合并稿；数据库原稿会建立历史版本。</p>
      <button type="button" onClick={() => { void compare(); }}>查看数据库稿</button>
      {current && <div><strong>{current.title} · 数据库版本 {current.revision}</strong><pre>{current.plainText}</pre><button type="button" disabled={actionBusy || session.composing} onClick={() => { void merge(); }}>以数据库版本 {current.revision} 为基准保存合并稿</button></div>}
    </div>}
    {history && <NoteVersions id={note.id} disabled={actionBusy || state.status === 'saving'} onRestore={restore} onClose={() => setHistory(false)} />}
    <EditorContent editor={editor} />
    <p className="editor-footer">停止输入后自动保存 · 未保存修改每两秒保存恢复草稿 · Markdown 保留基本格式，TXT 仅含文字，均不携带标签、收藏和项目关联</p>
  </section>;
}
