import { useEffect, useState } from 'react';
import type { DocumentSession } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';

export function DocumentSessions({ onOpen, onChanged }: { onOpen: (id: string) => Promise<void>; onChanged: () => Promise<void> }) {
  const [sessions, setSessions] = useState<DocumentSession[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void command('list_document_sessions', { offset, limit: 20 }).then(value => { if (active) setSessions(value); }).catch(error => { if (active) setError(asAppError(error)); }); return () => { active = false; }; }, [offset]);
  if (!sessions.length && !error) return null;
  return <section className="recovery-panel" aria-label="文档编辑会话"><h2>继续编辑文档</h2><p className="muted">这些编辑会话保留了草稿或 Office 副本；提交后可结束会话。</p><ErrorMessage error={error} />
    {sessions.map(session => <div className="draft-row" key={session.id}><strong>{session.filename}</strong><span className="metadata">版本 {session.baseRevision}</span><button disabled={busy} onClick={() => { void onOpen(session.resourceId); }}>继续编辑</button><button disabled={busy} onClick={() => {
      setBusy(true); setError(null); void command('copy_document_edit', { id: session.id }).then(async resource => { await onChanged(); await onOpen(resource.id); }).catch(error => setError(asAppError(error))).finally(() => setBusy(false));
    }}>另存副本</button></div>)}
    {(offset > 0 || sessions.length === 20) && <div className="pagination"><button disabled={busy || !offset} onClick={() => setOffset(offset - 20)}>上一页会话</button><span>第 {offset / 20 + 1} 页</span><button disabled={busy || sessions.length < 20} onClick={() => setOffset(offset + 20)}>下一页会话</button></div>}
  </section>;
}
