/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {flushSaveQueue} from './saveQueue';
/** 导出前保存屏障；编辑器注册即时稿保存函数，导出入口等待回执，失败则不导出旧稿。 */
const FLUSHERS = new Map<string, { projectId: string; flush: () => Promise<void> }>();
export function registerDraftFlush(projectId: string, chapterId: string, flush: () => Promise<void>): () => void {
  const key = `${projectId}:${chapterId}`, value = { projectId, flush };
  FLUSHERS.set(key, value);
  return () => { if (FLUSHERS.get(key) === value) FLUSHERS.delete(key); };
}
export async function flushProjectDrafts(projectId: string): Promise<void> {
  for (const value of FLUSHERS.values()) if (value.projectId === projectId) await value.flush();
}

export async function flushAllDrafts(): Promise<void> {
 if(document.querySelector('.ProseMirror') && composing) throw new Error('请完成输入后再离开。');
 for(const value of FLUSHERS.values()) await value.flush();
 await flushSaveQueue();
}
let composing = false;
window.addEventListener('compositionstart',()=>{composing=true;});
window.addEventListener('compositionend',()=>{composing=false;});
