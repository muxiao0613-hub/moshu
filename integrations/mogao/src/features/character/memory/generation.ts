/** 已采用并保存的生成正文 → 按角色同步差异；等待写入完成才继续下一章，失败保留正文并可重试。 */
import { extractChapterMemories } from '@/features/ai/aiService';
import { getProject } from '@/features/project/api';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { serializeSave } from '@/shared/lib/saveQueue';
import { newCharacterChanges, pickSyncCharacters } from '@/shared/lib/characterSync';
import type { Chapter, CharacterSyncPreferences } from '@/shared/types';
import { getCharacters, saveCharacterMemory } from '../api';
import { loadCharacterSyncPreferences } from './preferences';

export interface CharacterSyncReport {
  sourceMessage?: string;
  skipped?: boolean; updatedNames: string[]; pendingNames: string[]; suggestionCount: number;
  errors: Array<{ name: string; message: string }>;
}
export function characterSyncReportText(report: CharacterSyncReport): string {
  const base = report.skipped ? '本次未更新人物档案' : `${report.updatedNames.length ? `已更新 ${report.updatedNames.join('、')} 的正文事实` : '没有新增的角色事实'}；${report.suggestionCount} 项固定设定建议待确认`
    + (report.pendingNames.length ? `；${report.pendingNames.join('、')} 的正文事实待确认` : '');
  return [base, report.sourceMessage, report.errors.length ? `更新失败：${report.errors.map(e => `${e.name}（${e.message}）`).join('、')}` : ''].filter(Boolean).join('；');
}
export function syncGeneratedChapter(chapter: Chapter, preferences = loadCharacterSyncPreferences(chapter.projectId),
  options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}): Promise<CharacterSyncReport> {
  return serializeSave(`character-sync:${chapter.projectId}:${chapter.id}`, () => performSync(chapter, preferences, options));
}
async function performSync(chapter: Chapter, preferences: CharacterSyncPreferences,
  options: { signal?: AbortSignal; onProgress?: (message: string) => void }): Promise<CharacterSyncReport> {
  const report: CharacterSyncReport = { updatedNames: [], pendingNames: [], suggestionCount: 0, errors: [] };
  if (preferences.mode === 'off') return { ...report, skipped: true };
  const [project, characters] = await Promise.all([getProject(chapter.projectId), getCharacters(chapter.projectId)]);
  if (!project) throw new Error('正文已保存，作品读取失败，请重新同步人物档案');
  const hash = await chapterMemoryHash(chapter.content ?? '');
  const involved = pickSyncCharacters(chapter.content, characters, preferences);
  const targets = involved.filter(c => !c.lifeMemories?.some(m => m.chapterId === chapter.id && m.sourceHash === hash && m.status !== 'stale'));
  if (!targets.length) return report;
  options.signal?.throwIfAborted();
  options.onProgress?.(`正在整理本章涉及的 ${targets.length} 位人物`);
  const drafts = await extractChapterMemories({ project, chapter, characters: targets, signal: options.signal });
  for (const draft of drafts) {
    options.signal?.throwIfAborted();
    const character = targets.find(c => c.id === draft.characterId)!;
    const delta = newCharacterChanges(character, chapter.order, draft);
    if (!delta.claims.length && !delta.profileChanges.length) continue;
    try {
      const saved = await saveCharacterMemory(chapter.projectId, character.id, preferences.mode === 'auto' ? 'sync' : 'stage', {
        chapterId: chapter.id, chapterTitle: chapter.title, chapterOrder: chapter.order, sourceHash: hash,
        status: 'pending', claims: delta.claims, profileChanges: delta.profileChanges, generatedAt: new Date().toISOString(),
      });
      const memory = saved.lifeMemories?.find(m => m.chapterId === chapter.id && m.sourceHash === hash);
      if (memory?.status === 'confirmed' && memory.claims.length) report.updatedNames.push(saved.name);
      else if (memory?.status === 'pending' && memory.claims.length) report.pendingNames.push(saved.name);
      report.suggestionCount += memory?.profileChanges?.filter(c => c.status === 'pending').length ?? 0;
    } catch (error) { report.errors.push({ name: character.name, message: error instanceof Error ? error.message : '人物档案保存失败' }); }
  }
  return report;
}
export type { CharacterSyncPreferences };
