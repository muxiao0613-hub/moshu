/** 章节记忆增量同步的编排；人物编辑器与定稿回调共用，只按需加载待处理章节。 */
import { extractChapterMemories } from '@/features/ai/aiService';
import { getChapter, getChapters } from '@/features/chapter/api';
import { newCharacterChanges } from '@/shared/lib/characterSync';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import type { Chapter, Character, Project } from '@/shared/types';
import { getCharacters, saveCharacterMemory } from '../api';

export async function stageChapterMemories(project: Project, chapter: Chapter, characters: Character[], signal?: AbortSignal): Promise<Character[]> {
  if (!(chapter.content ?? '').replace(/<[^>]*>/g, '').trim()) throw new Error('请先保存章节正文');
  const sourceHash = await chapterMemoryHash(chapter.content ?? '');
  const targets = characters.filter(c => !c.lifeMemories?.some(m => m.chapterId === chapter.id && m.sourceHash === sourceHash && m.status !== 'stale'));
  if (!targets.length) return characters;
  const appeared = targets.filter(c => [c.name, ...(c.aliases ?? [])].some(name => name && chapter.content.includes(name)));
  const extracted = appeared.length ? await extractChapterMemories({ project, chapter, characters: appeared, signal }) : [];
  const drafts = targets.map(c => extracted.find(d => d.characterId === c.id) ?? { characterId: c.id, claims: [] });
  const saved = new Map<string, Character>();
  for (const draft of drafts) {
    signal?.throwIfAborted();
    const delta = newCharacterChanges(targets.find(c => c.id === draft.characterId)!, chapter.order, draft);
    const character = await saveCharacterMemory(project.id, draft.characterId, 'stage', {
      chapterId: chapter.id, chapterTitle: chapter.title, chapterOrder: chapter.order, sourceHash,
      status: 'pending', claims: delta.claims, profileChanges: delta.profileChanges, generatedAt: new Date().toISOString(),
    });
    saved.set(character.id, character);
  }
  return characters.map(c => saved.get(c.id) ?? c);
}
export async function syncCharacterMemories(project: Project, characterId: string, options: {
  signal?: AbortSignal; onProgress?: (message: string) => void; onUpdated?: (character: Character) => void;
} = {}): Promise<Character> {
  const [characters, chapters] = await Promise.all([getCharacters(project.id), getChapters(project.id)]);
  let character = characters.find(c => c.id === characterId);
  if (!character) throw new Error('请先保存人物档案再补齐经历');
  // 修订、取消定稿和删除都会在服务端使相应记录失效；无需在聊天中扫描章节版本。
  const pending = chapters.filter(ch => (ch.status === 'final' || ch.wordCount > 0) && !character!.lifeMemories?.some(m => m.chapterId === ch.id && m.status !== 'stale'));
  for (let i = 0; i < pending.length; i++) {
    options.signal?.throwIfAborted();
    options.onProgress?.(`正在整理 ${i + 1}/${pending.length}：${pending[i].title}`);
    const chapter = await getChapter(pending[i].id, project.id);
    if (!chapter) throw new Error('章节已删除，请重新整理');
    [character] = await stageChapterMemories(project, chapter, [character], options.signal);
    options.onUpdated?.(character);
  }
  options.onProgress?.(pending.length ? `已整理 ${pending.length} 章，请确认有依据的经历` : '经历已是最新，无需重新提取');
  return character;
}
