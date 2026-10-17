import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import { removeChapterFromIndex } from '@/features/ai/ragService';
import { indexChapter } from '@/features/ai/ragService';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { serializeSave } from '@/shared/lib/saveQueue';
import { chapterListChanged, emitLibraryChanged, type ChapterListFields } from '@/shared/lib/libraryEvents';
import type { Chapter, ChapterVersion, ChapterBeatCard, QualityReport } from '@/shared/types';

export async function getChapters(projectId: string): Promise<Chapter[]> {
  const res = await apiClient.get(`/projects/${projectId}/chapters`);
  return normalizeList<Chapter>(unwrap(res));
}

export async function getChaptersWithContent(projectId: string): Promise<Chapter[]> {
  const chapters = await getChapters(projectId);
  const results: Chapter[] = [];
  const BATCH = 5;
  for (let i = 0; i < chapters.length; i += BATCH) {
    const batch = chapters.slice(i, i + BATCH);
    const full = await Promise.all(batch.map(c => getChapter(c.id, projectId)));
    results.push(...full.filter((c): c is Chapter => !!c));
  }
  return results;
}

export async function getChapter(id: string, projectId?: string): Promise<Chapter | undefined> {
  if (!projectId) return undefined;
  try {
    const res = await apiClient.get(`/projects/${projectId}/chapters/${id}`);
    const saved = normalize<Chapter>(unwrap(res));
    BODY_BASES.set(saved.id, saved.content ?? '');
    return saved;
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) return undefined;
    throw error;
  }
}

/**
 * 上一次保存后的「列表字段」快照：用来判断这次保存要不要通知列表（章节树 / 章节列表）。
 * 只记 title/status/order，不记 content —— 正文自动保存每 3 秒一次，
 * 每次都广播会让左栏白刷列表（见 `@/shared/lib/libraryEvents`）。
 */
const listFieldsOf = new Map<string, ChapterListFields>();

const BODY_BASES = new Map<string, string>();

export async function saveChapter(chapter: Partial<Chapter> & { projectId: string; baseContent?: string; preserveRemote?: boolean; expectedSourceHash?: string }): Promise<Chapter> {
  if (chapter.id && chapter.content !== undefined && chapter.baseContent === undefined && !chapter.expectedSourceHash) {
    const base = BODY_BASES.get(chapter.id);
    if (base === undefined) throw new Error('请先读取正文后再保存');
    chapter = { ...chapter, expectedSourceHash: await chapterMemoryHash(base) };
  }
  const saved = await serializeSave(`chapter:${chapter.id ?? chapter.projectId}`, async () => chapter.id
    ? normalize<Chapter>(unwrap(await apiClient.patch(`/projects/${chapter.projectId}/chapters/${chapter.id}`, chapter)))
    : normalize<Chapter>(unwrap(await apiClient.post(`/projects/${chapter.projectId}/chapters`, chapter))));
  if (chapter.content !== undefined) BODY_BASES.set(saved.id, saved.content ?? '');
  await indexChapter(saved, saved.projectId);

  const next: ChapterListFields = { title: saved.title, status: saved.status, order: saved.order };
  if (chapterListChanged(listFieldsOf.get(saved.id), next)) emitLibraryChanged();
  listFieldsOf.set(saved.id, next);
  return saved;
}

export async function deleteChapter(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/chapters/${id}`);
  removeChapterFromIndex(id);
  listFieldsOf.delete(id);
  emitLibraryChanged();
}

export async function getChapterVersions(chapterId: string, projectId: string): Promise<ChapterVersion[]> {
  const res = await apiClient.get(`/projects/${projectId}/chapters/${chapterId}/versions`);
  return unwrap<ChapterVersion[]>(res).map(v => ({ ...v, createdAt: new Date(v.createdAt) }));
}

export async function saveChapterVersion(chapterId: string, projectId: string, content: string, note?: string): Promise<ChapterVersion> {
  const res = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/versions`, { content, note });
  const v = unwrap<ChapterVersion>(res);
  return { ...v, createdAt: new Date(v.createdAt) };
}

export async function getChapterVersionContent(chapterId: string, versionId: string, projectId: string): Promise<ChapterVersion> {
  const res = await apiClient.get(`/projects/${projectId}/chapters/${chapterId}/versions/${versionId}`);
  const v = unwrap<ChapterVersion>(res);
  return { ...v, createdAt: new Date(v.createdAt) };
}

export async function getChapterBeatCards(projectId: string): Promise<ChapterBeatCard[]> {
  const chapters = await getChapters(projectId);
  // Chapter.beatCard 是可选字段：先取出来再用类型谓词收窄，避免无类型断言掩盖字段改名
  return chapters.map(c => c.beatCard).filter((card): card is ChapterBeatCard => !!card);
}

export async function getChapterBeatCard(chapterId: string, projectId?: string): Promise<ChapterBeatCard | undefined> {
  if (!projectId) return undefined;
  const chapter = await getChapter(chapterId, projectId);
  return chapter?.beatCard;
}

export async function saveChapterBeatCard(card: ChapterBeatCard & { projectId: string }): Promise<void> {
  if (!card.sourceHash) throw new Error('旧场景卡缺少正文依据，请先重新排场景');
  const chapter = await getChapter(card.chapterId, card.projectId);
  if (!chapter) throw new Error('章节不存在');
  await saveChapter({ id: card.chapterId, projectId: card.projectId, beatCard: { ...card, status: 'current' } });
}

export async function getQualityReports(projectId: string): Promise<QualityReport[]> {
  const chapters = await getChapters(projectId);
  return chapters.map(c => c.qualityReport).filter((r): r is QualityReport => !!r);
}

export async function getQualityReport(chapterId: string, projectId?: string): Promise<QualityReport | undefined> {
  if (!projectId) return undefined;
  const chapter = await getChapter(chapterId, projectId);
  return chapter?.qualityReport;
}

export async function saveQualityReport(report: QualityReport & { projectId: string }): Promise<void> {
  await saveChapter({ id: report.chapterId, projectId: report.projectId, qualityReport: report });
}

export function countWords(html: string): number {
  const text = html.replace(/<[^>]*>/g, '');
  const chineseChars = (text.match(/[一-龥]/g) || []).length;
  const englishWords = (text.replace(/[一-龥]/g, ' ').match(/\b\w+\b/g) || []).length;
  return chineseChars + englishWords;
}
