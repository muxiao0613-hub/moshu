import { useState } from 'react';
import type { FileVersion, Resource } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';

export function FileVersions({ resource, onRestored }: { resource: Resource; onRestored: (resource: Resource) => Promise<void> }) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<FileVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  async function load(offset: number) {
    setBusy(true); setError(null);
    try { setVersions(await command('list_file_versions', { id: resource.id, offset, limit: 20 })); setOffset(offset); }
    catch (error) { setError(asAppError(error)); } finally { setBusy(false); }
  }
  return <section className="file-history"><button disabled={busy} aria-expanded={open} onClick={() => { setOpen(!open); setSelected(null); if (!open) void load(0); }}>{open ? '收起文件历史' : '文件历史版本'}</button>
    {open && <div className="note-history"><h3>文件历史版本</h3><ErrorMessage error={error} />{!versions.length && !busy && <p className="muted">首次编辑时保留原件，每次提交保留前后版本。</p>}
      {versions.map(version => <div className="draft-row" key={version.id}><strong>版本 {version.sourceRevision}</strong><span className="metadata">{new Date(version.createdAt).toLocaleString()} · {version.size.toLocaleString()} 字节</span><button disabled={busy} onClick={() => { setBusy(true); void command('export_file_version', { id: resource.id, versionId: version.id }).catch(error => {const value = asAppError(error); if (value.code !== 'CANCELLED') setError(value);}).finally(() => setBusy(false)); }}>导出此版本</button><button disabled={busy} onClick={() => setSelected(version)}>恢复此版本</button></div>)}
      {selected && <div className="conflict-panel"><p>将版本 {selected.sourceRevision} 的完整文件恢复为新版本。当前内容也会留在历史中。请先结束正在使用的编辑会话。</p><div className="card-actions"><button disabled={busy} className="primary" onClick={() => {
        setBusy(true); setError(null); void command('restore_file_version', { id: resource.id, versionId: selected.id, baseRevision: resource.revision }).then(async saved => { await onRestored(saved); setSelected(null); await load(0); }).catch(error => setError(asAppError(error))).finally(() => setBusy(false));
      }}>确认恢复文件</button><button disabled={busy} onClick={() => setSelected(null)}>取消恢复</button></div></div>}
      {(offset > 0 || versions.length === 20) && <div className="pagination"><button disabled={busy || !offset} onClick={() => {void load(offset - 20);}}>上一页版本</button><span>第 {offset / 20 + 1} 页</span><button disabled={busy || versions.length < 20} onClick={() => {void load(offset + 20);}}>下一页版本</button></div>}
    </div>}
  </section>;
}
