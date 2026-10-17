/** 跨章关键词检索：全文分块、命中位置节选。仅管理内存索引；加载生命周期由 ragIndex.ts 负责。 */
import type { Chapter, ChapterEmbedding, RagChunk } from '@/shared/types';

const INDEX = new Map<string, ChapterEmbedding[]>();
const CHUNK_SIZE = 700;
const OVERLAP = 120;
const STOPWORDS = new Set(['一个', '没有', '一样', '一直', '起来', '下来', '出来', '回来', '可以', '已经', '非常', '虽然', '因为', '所以', '如果', '只是', '还是', '不是', '不会', '不要', '不能', '一些', '这个', '那个', '这里', '那里', '时候', '现在', '自己', '知道', '感觉', '觉得', '心里']);

function keywords(text: string, limit = 40): string[] {
  const freq = new Map<string, number>();
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const word = text.slice(i, i + len);
      if (!/^[一-龥]{2,}$/.test(word) || STOPWORDS.has(word)) continue;
      freq.set(word, (freq.get(word) ?? 0) + 1);
    }
  }
  // 姓名/物件只出现一次仍有检索价值，不能按词频过滤掉。
  return [...freq].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([word]) => word);
}

export async function indexChapter(chapter: Chapter, projectId: string): Promise<void> {
  const current = INDEX.get(projectId)?.find(e => e.chapterId === chapter.id);
  if (current && chapter.updatedAt && new Date(current.updatedAt) > new Date(chapter.updatedAt)) return;
  const body = (chapter.content ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const header = `${chapter.title} ${chapter.summary ?? ''}`;
  const chunks: ChapterEmbedding[] = [];
  for (let start = 0; start < Math.max(body.length, 1); start += CHUNK_SIZE - OVERLAP) {
    const indexedText = `${header}\n${body.slice(start, start + CHUNK_SIZE)}`;
    chunks.push({ id: `${chapter.id}:${start}`, projectId, chapterId: chapter.id, chapterOrder: chapter.order,
      chapterTitle: chapter.title, indexedText, keywords: keywords(indexedText), updatedAt: chapter.updatedAt ?? new Date() });
  }
  INDEX.set(projectId, [...(INDEX.get(projectId) ?? []).filter(e => e.chapterId !== chapter.id), ...chunks]);
}

export async function buildProjectIndex(projectId: string, chapters: Chapter[], onProgress?: (current: number, total: number) => void): Promise<void> {
  INDEX.set(projectId, []);
  for (let i = 0; i < chapters.length; i++) {
    await indexChapter(chapters[i], projectId);
    onProgress?.(i + 1, chapters.length);
  }
}

export function removeChapterFromIndex(chapterId: string): void {
  for (const [id, list] of INDEX) INDEX.set(id, list.filter(e => e.chapterId !== chapterId));
}

export function clearProjectIndex(projectId: string): void { INDEX.delete(projectId); }
export function indexedChapterCount(projectId: string): number {
  return new Set((INDEX.get(projectId) ?? []).map(e => e.chapterId)).size;
}
export function indexedChapterIds(projectId: string): string[] {
  return [...new Set((INDEX.get(projectId) ?? []).map(e => e.chapterId))];
}
export function indexedChapterStamp(projectId: string, chapterId: string): string | undefined {
  const entry = INDEX.get(projectId)?.find(e => e.chapterId === chapterId);
  return entry ? new Date(entry.updatedAt).toISOString() : undefined;
}

export async function retrieveRelevantChapters(params: {
  projectId: string; queryText: string; excludeChapterIds?: string[]; topK?: number;
  /** 写作时只读取前章；角色对话可以选择截止章，防止带入尚未发生的经历。 */
  beforeOrder?: number;
}): Promise<RagChunk[]> {
  const { projectId, queryText, excludeChapterIds = [], topK = 4, beforeOrder } = params;
  if (topK <= 0) return [];
  const query = keywords(queryText, 80);
  const candidates = (INDEX.get(projectId) ?? [])
    .filter(e => !excludeChapterIds.includes(e.chapterId) && (beforeOrder === undefined || e.chapterOrder < beforeOrder))
    .map(entry => {
      const hits = query.filter(word => entry.indexedText.includes(word));
      const score = hits.reduce((sum, word) => sum + word.length, 0) / Math.max(1, query.length * 4);
      return { entry, hits, score };
    }).filter(e => e.score > 0).sort((a, b) => b.score - a.score);
  const selected: RagChunk[] = [];
  const seen = new Set<string>();
  for (const { entry, hits, score } of candidates) {
    if (seen.has(entry.chapterId)) continue;
    seen.add(entry.chapterId);
    const bestWord = [...hits].sort((a, b) => b.length - a.length)[0];
    const start = Math.max(0, entry.indexedText.indexOf(bestWord) - 90);
    selected.push({ chapterId: entry.chapterId, chapterOrder: entry.chapterOrder, chapterTitle: entry.chapterTitle,
      excerpt: `${start ? '…' : ''}${entry.indexedText.slice(start, start + 450)}${start + 450 < entry.indexedText.length ? '…' : ''}`, score });
    if (selected.length >= topK) break;
  }
  return selected;
}
