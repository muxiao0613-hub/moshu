/** 按截止章选择固定底色；历史仍留在实体中，经历继续由 characterMemory 按来源筛选。 */
import type { Character } from '@/shared/types';
import { normalizeCharacter } from './normalizeCharacter';
export function profileAtOrder(character: Character, throughOrder?: number): Character {
  character = normalizeCharacter(character);
  if (throughOrder === undefined || !character.profileVersions?.length) return character;
  const versions = character.profileVersions;
  let start = 0;
  for (let i = 0; i < versions.length; i++) if (versions[i].effectiveOrder === 0) start = i;
  const eligible = versions.slice(start).map((version, index) => ({ version, index })).filter(v => v.version.effectiveOrder <= throughOrder)
    .sort((a, b) => a.version.effectiveOrder - b.version.effectiveOrder || a.index - b.index);
  return eligible.length ? normalizeCharacter({ ...character, ...Object.assign({}, ...eligible.map(v => v.version.changes ?? v.version.fields)) }) : { ...character, name: character.name, aliases: [], age: '',
    gender: '', appearance: '', personality: '', background: '', abilities: '', goals: '', relationships: [], arc: '',
    firstAppearance: '', notes: '', voiceSamples: [], profileEvidence: [] };
}
