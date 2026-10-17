/** 正文到人物档案的选择与差异判断；生成与定稿共用纯逻辑，不读取全书。 */
import type { Character, CharacterLifeMemory, CharacterMemoryClaim, CharacterProfileChange, CharacterSyncPreferences } from '@/shared/types';
import { stripHtml } from './contentFormat';

export const PROFILE_CHANGE_LABELS = {
  appearance: '外貌', personality: '性格', goals: '长期目标', background: '背景', abilities: '能力', notes: '习惯与细节',
};
export function defaultCharacterSync(): CharacterSyncPreferences {
  return { mode: 'auto', scope: 'involved', characterIds: [] };
}
export function pickSyncCharacters(content: string, characters: Character[], preferences: CharacterSyncPreferences): Character[] {
  if (preferences.mode === 'off') return [];
  const text = stripHtml(content);
  return characters.filter(c => (preferences.scope !== 'selected' || preferences.characterIds.includes(c.id))
    && [c.name, ...(c.aliases ?? [])].some(name => name?.trim() && text.includes(name.trim())));
}
const normalized = (value: string) => value.replace(/\s+/g, '').trim();
export function newCharacterChanges(character: Character, chapterOrder: number, draft: {
  claims: CharacterMemoryClaim[]; profileChanges?: CharacterProfileChange[];
}): { claims: CharacterMemoryClaim[]; profileChanges: CharacterProfileChange[] } {
  const earlier = (character.lifeMemories ?? []).filter(m => m.status === 'confirmed' && m.chapterOrder < chapterOrder)
    .sort((a, b) => a.chapterOrder - b.chapterOrder);
  const claims = draft.claims.filter(c => {
    if (c.kind === 'experience') return true;
    const comparison = c.kind === 'knowledge' ? earlier
      : [...earlier].reverse().filter(m => m.claims.some(old => old.kind === c.kind)).slice(0, 1);
    return !comparison.some(m => m.claims.some(old => old.kind === c.kind && normalized(old.text) === normalized(c.text)));
  });
  const profileChanges = (draft.profileChanges ?? []).filter(change =>
    !normalized(character[change.field] ?? '').includes(normalized(change.text)));
  return { claims, profileChanges };
}
export function pendingProfileChanges(memory: CharacterLifeMemory): CharacterProfileChange[] {
  return memory.status === 'stale' ? [] : (memory.profileChanges ?? []).filter(change => !change.status || change.status === 'pending');
}
