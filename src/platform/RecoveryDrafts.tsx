import {useConfirmation} from '../shared/ui/Confirmation';
import { useCallback, useEffect, useState } from 'react';
import type { DraftEntry } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
export function RecoveryDrafts({disabled, onOpen}: {disabled: boolean; onOpen: (id: string, copy: boolean) => Promise<void>}) {
  const {ask,dialog}=useConfirmation();
  const [items, setItems] = useState<DraftEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const load = useCallback(async () => {
    try { setItems(await command('list_note_drafts', {offset,limit:20})); setError(null); }
    catch (error) {setError(asAppError(error));}
  },[offset]);
  useEffect(() => { void load(); }, [load]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {await work(); await load();} catch (error) {setError(asAppError(error));}
    finally {setBusy(false);}
  }
  if (!items.length && !error && !offset) return null;
  return <section className="recovery-panel" aria-label="恢复草稿">
    <div className="section-heading"><h2>未提交的恢复草稿</h2><button type="button" disabled={busy || disabled} onClick={() => {void load();}}>刷新草稿</button></div>
    <p>恢复稿先进入编辑器供对照；另存副本会保留原笔记，副本不继承项目关联。校验失败的草稿保留原文件。</p>
    {dialog}
    <ErrorMessage error={error} />
    {items.map(item => <div className="draft-row" key={item.sessionId}><strong>{item.title || '未命名恢复稿'}</strong>{item.issue && <span>{item.issue}</span>}
      <button type="button" disabled={busy || disabled || !!item.issue} onClick={() => {void act(() => onOpen(item.sessionId,false));}}>对照恢复</button>
      <button type="button" disabled={busy || disabled || !!item.issue} onClick={() => {void act(() => onOpen(item.sessionId,true));}}>另存为新笔记</button>
      <button type="button" disabled={busy || disabled} onClick={() => { void ask('删除这份恢复草稿？数据库中的笔记不会被删除。').then(confirmed=>{if(confirmed)void act(() => command('discard_note_draft',{id:item.sessionId,throughSequence:null}).then(() => {}));}); }}>删除草稿</button>
    </div>)}
    <div className="pagination"><button type="button" disabled={!offset || busy || disabled} onClick={() => setOffset(offset-20)}>上一页</button><span>第 {offset/20+1} 页</span><button type="button" disabled={items.length<20 || busy || disabled} onClick={() => setOffset(offset+20)}>下一页</button></div>
  </section>;
}
