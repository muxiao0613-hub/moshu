import {useConfirmation} from '../shared/ui/Confirmation';
import { useRef, useState } from 'react';
import type { Folder } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { folderLabel } from '../shared/lib/catalog';
import { ErrorMessage } from '../shared/ui/ErrorMessage';

export function Folders({ folders, reload }: { folders: Folder[]; reload: () => Promise<void> }) {
  const {ask,dialog}=useConfirmation();
  const [selected, setSelected] = useState<Folder | null>(null);
  const [name, setName] = useState(''); const [parent, setParent] = useState('');
  const [mode, setMode] = useState<'moveToRoot' | 'trashContents'>('moveToRoot');
  const [busy, setBusy] = useState(false); const running = useRef(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  function choose(folder: Folder | null) { setSelected(folder); setName(folder?.name ?? ''); setParent(folder?.parentId ?? ''); }
  async function action(work: () => Promise<unknown>) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(null);
    try { await work(); await reload(); }
    catch (error) { setError(asAppError(error)); }
    finally { setBusy(false); running.current = false; }
  }
  return <details className="folder-manager"><summary>管理文件夹</summary>
    {dialog}
    <ErrorMessage error={error} />
    <div className="folder-manager-layout"><div className="folder-list"><button disabled={busy} type="button" onClick={() => choose(null)}>＋ 新建文件夹</button>{folders.map(folder => <button key={folder.id} disabled={busy} type="button" className={selected?.id === folder.id ? 'selected' : ''} onClick={() => choose(folder)}>{folderLabel(folder, folders)}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); void action(async () => {
        const saved = selected ? await command('save_folder', { id: selected.id, baseRevision: selected.revision, name, parentId: parent || null }) : await command('create_folder', { name, parentId: parent || null });
        choose(saved);
      }); }}><fieldset disabled={busy} className="form-grid"><label>文件夹名称<input required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>上级文件夹<select value={parent} onChange={e => setParent(e.target.value)}><option value="">根目录</option>{folders.filter(folder => folder.id !== selected?.id).map(folder => <option key={folder.id} value={folder.id}>{folderLabel(folder, folders)}</option>)}</select></label>
        <button className="primary" type="submit">{selected ? '保存文件夹' : '创建文件夹'}</button>
        {selected && <><label>删除时如何处理内容<select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="moveToRoot">所有后代文件夹中的资料移到根目录</option><option value="trashContents">所有后代文件夹及资料移入回收站</option></select></label>
          <button type="button" onClick={() => { void ask(mode === 'moveToRoot' ? '删除这个文件夹及其子文件夹，并将资料移到根目录？' : '将这个文件夹、子文件夹及全部资料移入回收站？').then(confirmed=>{if(confirmed)void action(async () => { await command('delete_folder', { id: selected.id, baseRevision: selected.revision, mode }); choose(null); });}); }}>删除文件夹</button></>}
      </fieldset></form>
    </div>
  </details>;
}
