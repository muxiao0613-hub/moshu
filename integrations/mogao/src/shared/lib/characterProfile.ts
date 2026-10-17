/** 人物档案的写作文本：聊天确认的特点、备注与关系共用一个出口，避免只注入性格。依赖 shared/types。 */
import type { Character } from '@/shared/types';
import { profileAtOrder } from './profileHistory';
import { characterMemoryText } from './characterMemory';

export function profileClip(text: string | undefined, limit = 180): string {
  const value = (text ?? '').trim();
  if (value.length <= limit) return value;
  const head = Math.floor((limit - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-(limit - head - 1))}`;
}

export function characterProfile(c: Character, characters: Array<Pick<Character, 'id' | 'name'>> = [], limit = 180, options: { includeMemory?: boolean; throughOrder?: number; question?: string } = {}): string {
  c = profileAtOrder(c, options.throughOrder);
  const relations = (c.relationships ?? []).map(r => {
    const target = characters.find(other => other.id === r.characterId);
    return target ? `${target.name}：${r.relation}` : r.relation;
  }).filter(Boolean).join('；');
  const fields: Array<[string, string | undefined]> = [
    ['基本信息', [c.age, c.gender].filter(Boolean).join(' · ')], ['外貌', c.appearance],
    ['性格', c.personality], ['目标', c.goals], ['背景', c.background], ['能力', c.abilities],
    ['弧线', c.arc], ['习惯与细节', c.notes], ['关系', relations],
  ];
  return [`【${c.name}】${(c.aliases ?? []).length ? `（别名：${c.aliases.join('、')}）` : ''}`,
    ...fields.filter(([, value]) => value?.trim()).map(([label, value]) => `${label}：${profileClip(value, limit)}`),
    ...((options.includeMemory !== false && c.lifeMemories?.length)
      ? [characterMemoryText(c, options.question, options.throughOrder)] : [])].join('\n');
}
