/** 每轮只读取最新人物档案；经历、角色知识和逐字证据均由已确认记忆提供，零章节扫描。 */
import { getCharacterContext } from '@/features/character/api';
import { getProject } from '@/features/project/api';
import { getStoryBible } from '@/features/quality/api';
import { characterMemoryText, confirmedMemories, memoryRelevance, selectCharacterMemories, selectMemoryClaims } from '@/shared/lib/characterMemory';
import { profileAtOrder } from '@/shared/lib/profileHistory';
import type { Character, FactLedger, Project, RagChunk, StoryBible } from '@/shared/types';

export interface RoleplayKnowledge {
  project: Project;
  characters: Array<Pick<Character, 'id' | 'name'>>;
  cast: Character[];
  sources: RagChunk[];
  facts: FactLedger[];
  storyBible?: StoryBible;
  memoryContext: Record<string, string>;
  notices: string[];
}
export async function loadRoleplayKnowledge(projectId: string, castIds: string[], question: string, throughOrder?: number): Promise<RoleplayKnowledge> {
  const [project, context] = await Promise.all([getProject(projectId), getCharacterContext(projectId, castIds)]);
  if (!project) throw new Error('作品读取失败，请重试');
  const { characters } = context;
  const cast = context.cast.map(c => profileAtOrder(c, throughOrder));
  if (cast.length !== new Set(castIds).size) throw new Error('上场角色已变更，请重新选择角色');
  const memoryContext = Object.fromEntries(cast.map(c => [c.id, characterMemoryText(c, question, throughOrder)]));
  const sources = new Map<string, RagChunk>();
  const notices: string[] = [];
  for (const character of cast) {
    const known = confirmedMemories(character, throughOrder);
    const outdated = (character.lifeMemories ?? []).some(m => m.status !== 'confirmed' && m.claims.length
      && (throughOrder === undefined || m.chapterOrder <= throughOrder));
    if (!known.length) notices.push(`${character.name}尚无已确认经历，请到人物档案补齐并确认；当前仅依据底色交流。`);
    else if (outdated) notices.push(`${character.name}有经历待确认或待更新，本轮不会使用这些记录。`);
    for (const memory of selectCharacterMemories(character, question, throughOrder)) {
      const quotes = selectMemoryClaims(memory, question, 3).map(c => `【${character.name}】${c.quote}`).join('；');
      const existing = sources.get(memory.chapterId);
      const score = memoryRelevance(memory, question);
      if (existing) {
        existing.excerpt = `${existing.excerpt}\n${quotes}`.slice(0, 1600);
        existing.score = Math.max(existing.score, score);
      }
      else sources.set(memory.chapterId, { chapterId: memory.chapterId, chapterOrder: memory.chapterOrder,
        chapterTitle: memory.chapterTitle, excerpt: quotes.slice(0, 1200), score });
    }
  }
  const storyBible = await getStoryBible(projectId, project);
  // 全书事实账本可能含角色尚不知情的秘密；聊天只使用该角色的 knowledge 条目。
  return { project, characters, cast, sources: [...sources.values()].sort((a, b) => b.score - a.score || b.chapterOrder - a.chapterOrder).slice(0, 8), facts: [], storyBible, memoryContext, notices };
}
