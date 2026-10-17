/** 生成界面的偏好状态；将当前值直接传给生成/采用动作，避免存储失败导致设置落空。 */
import { useEffect, useState } from 'react';
import type { CharacterSyncPreferences } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import { loadCharacterSyncPreferences, saveCharacterSyncPreferences } from './preferences';
export function useCharacterSyncPreferences(projectId: string) {
  const [preferences, setPreferences] = useState(() => loadCharacterSyncPreferences(projectId));
  useEffect(() => { setPreferences(loadCharacterSyncPreferences(projectId)); }, [projectId]);
  const update = (next: CharacterSyncPreferences) => {
    setPreferences(next);
    if (!saveCharacterSyncPreferences(projectId, next)) toast.error('人物同步设置未能保存到本机，本次操作仍使用当前选择');
  };
  return { preferences, update };
}
