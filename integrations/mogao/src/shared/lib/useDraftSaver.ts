/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 编辑器保存编排：队列内读取已确认底稿，合并远端变化；重叠时暂停并保留两份正文。 */
import { useRef, useState } from 'react';
import { conflictRemote, mergeDraft, type DraftConflict } from './draftConflict';
import { serializeSave } from './saveQueue';
type Draft = { id: string; content: string };
export interface DraftSaveOptions { baseContent?: string; expectedSourceHash?: string; preserveRemote?: boolean }
export function useDraftSaver<T extends Draft>(options: {
  save: (draft: T, content: string, patch: Partial<T>, condition: DraftSaveOptions) => Promise<T>;
  backupVersion: (draft: T, content: string) => Promise<void>;
  current: () => { id?: string; content?: string; composing?:boolean };
  applied: (saved: T, content: string) => void;
  failed: (error: unknown, conflict: boolean) => void;
}) {
  const latest = useRef(options); latest.current = options;
  const bases = useRef(new Map<string, string>());
  const pending = useRef<DraftConflict<T> | null>(null);
  const [conflict, setConflict] = useState<DraftConflict<T> | null>(null);
  const setPending = (value: DraftConflict<T> | null) => { pending.current = value; setConflict(value); };
  const loaded = (draft: T) => { bases.current.set(draft.id, draft.content ?? ''); setPending(null); };
  const persist = (draft: T, content: string, patch: Partial<T> = {}, resolution = false, resolutionBase?: string): Promise<T | undefined> => serializeSave(`editor:${draft.id}`, async () => {
    if (pending.current?.remote.id === draft.id && !resolution) return undefined;
    const baseContent = bases.current.get(draft.id) ?? draft.content ?? '';
    try {
      const saved = await latest.current.save(draft, content, patch, { baseContent, preserveRemote: resolution });
      bases.current.set(draft.id, saved.content ?? '');
      if(latest.current.current().composing) {
        await new Promise<void>(resolve=>{
          const finish=()=>{clearTimeout(timer);window.removeEventListener('compositionend',finish);resolve();};
          const timer=window.setTimeout(finish,8000);window.addEventListener('compositionend',finish,{once:true});
        });
      }
      const current = latest.current.current();
      if(current.composing)return saved;
      if (current.id === draft.id) {
        const merged = mergeDraft(resolutionBase ?? content, current.content ?? content, saved.content ?? '');
        if (merged === null) setPending({ remote: saved, local: current.content ?? content });
        else { setPending(null); latest.current.applied(saved, merged); }
      }
      return saved;
    } catch (error) {
      const remote = conflictRemote<T>(error);
      if (remote && latest.current.current().id === draft.id) setPending({ remote, local: latest.current.current().content ?? content });
      latest.current.failed(error, !!remote);
      return undefined;
    }
  });
  const resolve = async (choice: 'local' | 'remote') => {
    const value = pending.current;
    if (!value || latest.current.current().id !== value.remote.id) return;
    const local = latest.current.current().content ?? value.local;
    // 采用远端也先留本机版本；保留本机则由正文保存事务备份远端。
    if (choice === 'remote') {
      try { await latest.current.backupVersion(value.remote, local); }
      catch (error) { latest.current.failed(error, false); return; }
    }
    bases.current.set(value.remote.id, value.remote.content ?? '');
    const content = choice === 'local' ? local : value.remote.content;
    // 不把本机待决稿当成「新输入」重新合并，选择就是作者的替换意图。
    await persist(value.remote, content, {}, true, local);
  };
  return { conflict, persist, resolve, loaded, blocked: () => !!pending.current };
}
