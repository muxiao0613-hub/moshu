/** 质量改稿采用：原文版本校验→备份→保存→共同写回→新依据复评，页面只负责显示结果。 */
import { getChapter, getCharacters, getProject, getThreads, getWorldSettings, getStoryBible, getFactLedger, saveChapter, saveChapterVersion, saveQualityReport, countWords } from '@/api';
import { synchronizeChapter, characterSyncReportText } from '@/features/chapter/writeback';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { ensureChapterHtml } from '@/shared/lib/contentFormat';
import { toast } from '@/shared/ui/toast';
import { reviewChapterQuality } from './qualityService';
export interface RewriteSource { chapterId: string; sourceHash: string; projectId: string }
export async function adoptQualityRewrite(source: RewriteSource, text: string) {
  const fresh = await getChapter(source.chapterId, source.projectId);
  if (!fresh || source.sourceHash !== await chapterMemoryHash(fresh.content)) throw new Error('正文已更新，请重新生成改稿');
  await saveChapterVersion(fresh.id, source.projectId, fresh.content || '', '质量改稿前备份');
  const html = ensureChapterHtml(text);
  const saved = await saveChapter({ id: fresh.id, projectId: source.projectId, expectedSourceHash: source.sourceHash,
    content: html, wordCount: countWords(html), status: 'revised' });
  const sync = await synchronizeChapter(saved);
  toast.info(characterSyncReportText(sync));
  const [project, characters, worldSettings, threads, storyBible, factLedger] = await Promise.all([
    getProject(source.projectId), getCharacters(source.projectId), getWorldSettings(source.projectId), getThreads(source.projectId), getStoryBible(source.projectId), getFactLedger(source.projectId),
  ]);
  if (!project) throw new Error('正文已保存，但复评读取作品失败，请重新评审');
  const report = await reviewChapterQuality({ project, chapter: saved, characters, worldSettings, threads, storyBible, factLedger });
  await saveQualityReport(report);
  return { chapter: await getChapter(saved.id, source.projectId) || saved, report };
}
