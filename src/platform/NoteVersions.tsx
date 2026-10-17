import { useEffect, useRef, useState } from 'react';
import type { Note, NoteVersion, NoteVersionSummary } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
export function NoteVersions({ id, disabled, onRestore, onClose }: {id: string; disabled: boolean; onRestore: (versionId: string) => Promise<Note | null>; onClose: () => void}) {
  const [items, setItems] = useState<NoteVersionSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<NoteVersion | null>(null);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    void command('list_note_versions', {id, offset, limit: 20}).then(next => {
      if (generation.current === current) { setItems(next); setError(null); }
    }).catch(error => { if (generation.current === current) setError(asAppError(error)); });
    return () => { generation.current += 1; };
  }, [id, offset]);
  async function view(versionId: string) {
    setBusy(true);
    try { setSelected(await command('get_note_version', {id,versionId})); setError(null); }
    catch (error) { setError(asAppError(error)); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true);
    try { if (await onRestore(selected.summary.id)) onClose(); }
    catch (error) { setError(asAppError(error)); }
    finally { setBusy(false); }
  }
  return <section className="note-history" aria-label="笔记版本">
    <div className="section-heading"><h2>历史版本</h2><button type="button" disabled={busy || disabled} onClick={onClose}>收起</button></div>
    <p className="muted">手动保存保留前后快照；恢复前会保存当前编辑稿，并为被替换的正文建立版本。</p>
    <ErrorMessage error={error} />
    <div className="version-list">{items.map(item => <button type="button" key={item.id} disabled={busy || disabled} onClick={() => { void view(item.id); }}>
      {item.title} · 版本 {item.sourceRevision} · {new Date(item.createdAt).toLocaleString()}
    </button>)}{items.length === 0 && <p>这一页没有版本。</p>}</div>
    <div className="pagination"><button type="button" disabled={!offset || busy || disabled} onClick={() => {setOffset(offset - 20); setSelected(null);}}>上一页</button><span>第 {offset / 20 + 1} 页</span><button type="button" disabled={items.length < 20 || busy || disabled} onClick={() => {setOffset(offset + 20); setSelected(null);}}>下一页</button></div>
    {selected && <div className="version-preview"><strong>{selected.summary.title} · 版本 {selected.summary.sourceRevision}</strong><pre>{selected.plainText}</pre><button type="button" disabled={busy || disabled} onClick={() => { void restore(); }}>恢复此版本</button></div>}
  </section>;
}
