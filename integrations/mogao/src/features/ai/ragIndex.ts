/** RAG 索引取数门户：新会话自动加载全文，后续只刷新变更章节；依赖 api 与纯 ragService。 */
import { getChapter, getChapters } from '@/features/chapter/api';
import { indexChapter, indexedChapterIds, indexedChapterStamp, removeChapterFromIndex } from './ragService';

const LOADING = new Map<string, Promise<void>>();

export function ensureProjectIndex(projectId: string): Promise<void> {
  const existing = LOADING.get(projectId);
  if (existing) return existing;
  const task = (async () => {
    const chapters = await getChapters(projectId);
    const ids = new Set(chapters.map(c => c.id));
    for (const id of indexedChapterIds(projectId)) if (!ids.has(id)) removeChapterFromIndex(id);
    const changed = chapters.filter(c => indexedChapterStamp(projectId, c.id) !== new Date(c.updatedAt).toISOString());
    for (let i = 0; i < changed.length; i += 5) {
      await Promise.all(changed.slice(i, i + 5).map(async c => {
        const full = await getChapter(c.id, projectId);
        if (full) await indexChapter(full, projectId);
        else removeChapterFromIndex(c.id);
      }));
    }
  })();
  LOADING.set(projectId, task);
  void task.finally(() => { if (LOADING.get(projectId) === task) LOADING.delete(projectId); }).catch(() => undefined);
  return task;
}
