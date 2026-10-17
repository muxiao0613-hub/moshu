/** 旧库允许空 JSON/文本；在人物数据进入页面、截止章档案前补齐可编辑结构。 */
import type { Character } from '@/shared/types';

export function normalizeCharacter(character: Character): Character {
  return { ...character, name: character.name ?? '',
    aliases: character.aliases ?? [], relationships: character.relationships ?? [],
    role: ['protagonist', 'antagonist', 'supporting', 'minor'].includes(character.role) ? character.role : 'minor',
    age: character.age ?? '', gender: character.gender ?? '', appearance: character.appearance ?? '',
    personality: character.personality ?? '', background: character.background ?? '', abilities: character.abilities ?? '',
    goals: character.goals ?? '', arc: character.arc ?? '', firstAppearance: character.firstAppearance ?? '', notes: character.notes ?? '',
    voiceSamples: character.voiceSamples ?? [], profileEvidence: character.profileEvidence ?? [],
    lifeMemories: character.lifeMemories ?? [], stateHistory: character.stateHistory ?? [], profileVersions: character.profileVersions ?? [] };
}
