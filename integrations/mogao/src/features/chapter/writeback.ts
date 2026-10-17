/** 所有正文采用入口的统一写回：实际摘要、待确认全书事实、选择性人物经历；失败保留已存正文。 */
import { extractChapterSources } from '@/features/ai/aiService';
import { characterSyncReportText, syncGeneratedChapter, type CharacterSyncReport } from '@/features/character/memory';
import { getProject } from '@/features/project/api';
import { saveFacts } from '@/features/quality/api';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { serializeSave } from '@/shared/lib/saveQueue';
import type { Chapter, CharacterSyncPreferences } from '@/shared/types';
import { getChapter, saveChapter } from './api';

export function synchronizeChapter(chapter: Chapter, preferences?: CharacterSyncPreferences, options: { signal?: AbortSignal } = {}) {
  return serializeSave(`chapter-writeback:${chapter.projectId}:${chapter.id}`, async () => {
    let report: CharacterSyncReport;
    try { report = await syncGeneratedChapter(chapter, preferences, options); }
    catch (e) { report = { updatedNames: [], pendingNames: [], suggestionCount: 0, errors: [{ name: '人物档案', message: e instanceof Error ? e.message : '同步失败，请重试' }] }; }
    try {
      const hash = await chapterMemoryHash(chapter.content);
      const fresh = await getChapter(chapter.id, chapter.projectId);
      if (!fresh || hash !== await chapterMemoryHash(fresh.content)) throw new Error('正文已变更，请针对新正文重新同步');
      if (fresh.continuity?.sourceHash === hash && fresh.continuity.status === 'current') return report;
      const project = await getProject(chapter.projectId);
      if (!project) throw new Error('作品读取失败');
      const derived = await extractChapterSources(project, chapter, options.signal);
      await saveFacts(derived.facts);
      await saveChapter({ id: chapter.id, projectId: chapter.projectId,
        continuity: { sourceHash: hash, text: derived.text, status: 'current', updatedAt: new Date().toISOString() } });
      report.sourceMessage = `实际摘要已更新；${derived.facts.length} 项全书事实待确认`;
    } catch (error) { report.errors.push({ name: '正文依据', message: error instanceof Error ? error.message : '摘要更新失败，请重试' }); }
    return report;
  });
}
export { characterSyncReportText };
