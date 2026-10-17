/** 档案中的经历检索与文本编译；只读持久记忆，不读取章节或调用模型。 */
import type { Character, CharacterLifeMemory } from '@/shared/types';

export const MEMORY_KIND_LABELS = {
  experience: '亲身经历', knowledge: '已知信息', state: '当时状态', relationship: '关系变化',
};
const MAX_CONTEXT_MEMORIES = 10;
export function confirmedMemories(character: Character, throughOrder?: number): CharacterLifeMemory[] {
  return (character.lifeMemories ?? []).filter(m => m.status === 'confirmed' && m.claims.length
    && (throughOrder === undefined || m.chapterOrder <= throughOrder))
    .sort((a, b) => a.chapterOrder - b.chapterOrder);
}
function queryWords(question: string): Set<string> {
  const lower = question.toLowerCase();
  return new Set([...(lower.match(/[a-z0-9]{2,}/g) ?? []),
    ...Array.from(lower.matchAll(/(?=([\u4e00-\u9fff]{2}))/g), m => m[1])]);
}
function textScore(text: string, words: Set<string>): number {
  const lower = text.toLowerCase();
  return [...words].reduce((n, w) => n + Number(lower.includes(w)), 0);
}
export function memoryRelevance(memory: CharacterLifeMemory, question: string): number {
  return textScore(memory.claims.map(c => `${c.text} ${c.quote}`).join(' '), queryWords(question));
}
export function selectMemoryClaims(memory: CharacterLifeMemory, question = '', limit = 4) {
  const words = queryWords(question);
  return memory.claims.map((claim, index) => ({ claim, index, score: textScore(`${claim.text} ${claim.quote}`, words) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit)
    .sort((a, b) => a.index - b.index).map(item => item.claim);
}
export function selectCharacterMemories(character: Character, question = '', throughOrder?: number): CharacterLifeMemory[] {
  const memories = confirmedMemories(character, throughOrder);
  if (memories.length <= MAX_CONTEXT_MEMORIES) return memories;
  // 双字词覆盖中文问题；始终保留开端及近期经历，剩余额度留给当前提问。
  const words = queryWords(question);
  const score = (m: CharacterLifeMemory) => textScore(m.claims.map(c => `${c.text} ${c.quote}`).join(' '), words);
  const chosen = new Map(memories.slice(0, 1).concat(memories.slice(-3)).map(m => [m.chapterId, m]));
  for (const memory of [...memories].sort((a, b) => score(b) - score(a) || b.chapterOrder - a.chapterOrder)) {
    if (chosen.size >= MAX_CONTEXT_MEMORIES) break;
    chosen.set(memory.chapterId, memory);
  }
  return [...chosen.values()].sort((a, b) => a.chapterOrder - b.chapterOrder);
}
export function characterMemoryText(character: Character, question = '', throughOrder?: number): string {
  const all = confirmedMemories(character, throughOrder);
  const selected = selectCharacterMemories(character, question, throughOrder);
  const latestState = [...all].reverse().find(m => m.claims.some(c => c.kind === 'state'));
  const state = latestState?.claims.filter(c => c.kind === 'state').map(c => c.text).join('；');
  const history = selected.map(m => `第${m.chapterOrder}章《${m.chapterTitle.slice(0, 60)}》：` + selectMemoryClaims(m, question)
    .map(c => `${MEMORY_KIND_LABELS[c.kind]}：${c.text.slice(0, 100)}`).join('；').slice(0, 480)).join('\n');
  const excluded = (character.lifeMemories ?? []).filter(m => m.status !== 'confirmed' && m.claims.length
    && (throughOrder === undefined || m.chapterOrder <= throughOrder)).length;
  return `【经历记忆】已确认 ${all.length} 章，选取 ${selected.length} 章；${excluded} 章待确认或待更新。记忆未覆盖的经历不能推定不存在。\n`
    + (state ? `最近记录的状态（第${latestState!.chapterOrder}章，之后的变化未知）：${state.slice(0, 600)}\n` : '')
    + (history || '尚无已确认的小说经历，请先在人物档案补齐经历。');
}
export async function chapterMemoryHash(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
