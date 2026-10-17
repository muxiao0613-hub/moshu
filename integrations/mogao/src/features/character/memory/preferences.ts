/** 写作时的人物同步偏好。失败返回明确结果，调用方仍可传本次选择。 */
import { defaultCharacterSync } from '@/shared/lib/characterSync';
import type { CharacterSyncPreferences } from '@/shared/types';
const key = (projectId: string) => `mogao_character_sync:${projectId}`;
export function loadCharacterSyncPreferences(projectId: string): CharacterSyncPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(projectId)) ?? 'null');
    if (value && typeof value === 'object') {
      const v = value as CharacterSyncPreferences;
      if (['auto', 'review', 'off'].includes(v.mode) && ['involved', 'selected'].includes(v.scope)
        && Array.isArray(v.characterIds) && v.characterIds.every(id => typeof id === 'string')) return v;
    }
  } catch { /* 本机存储不可用或旧数据无效时使用本次默认值，不影响正文保存。 */ }
  return defaultCharacterSync();
}
export function saveCharacterSyncPreferences(projectId: string, preferences: CharacterSyncPreferences): boolean {
  try { localStorage.setItem(key(projectId), JSON.stringify(preferences)); return true; }
  catch { return false; }
}
