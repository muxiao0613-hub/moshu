/** 人物经历面板的数据和写入编排；取消同步只中止未完成工作，已写入的候选仍保留。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Character, CharacterLifeMemory, CharacterProfileChange, Project } from '@/shared/types';
import { getCharacter, saveCharacterMemory } from '../api';
import { syncCharacterMemories } from './sync';

export function useCharacterMemory(character: Character, project: Project, onUpdated: (character: Character, changes?: CharacterProfileChange[]) => void) {
  const [current, setCurrent] = useState(character);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const updating = useRef(false);
  const callback = useRef(onUpdated); callback.current = onUpdated;
  const apply = useCallback((next: Character, changes?: CharacterProfileChange[]) => {
    if (!mounted.current) return;
    setCurrent(next); callback.current(next, changes);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    getCharacter(character.id, project.id).then(next => { if (active && next && !updating.current) apply(next); })
      .catch(e => { if (active && mounted.current) setError(e instanceof Error ? e.message : '档案读取失败'); });
    return () => { active = false; mounted.current = false; controller.current?.abort(); };
  }, [character.id, project.id, apply]);
  const run = async (work: () => Promise<void>) => {
    if (updating.current) return;
    updating.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) {
      if (mounted.current) {
        if (controller.current?.signal.aborted) setMessage('已停止，已整理的候选仍保留在档案中');
        else setError(e instanceof Error ? e.message : '经历更新失败，请重试');
      }
    } finally {
      updating.current = false; controller.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const sync = () => void run(async () => {
    controller.current = new AbortController();
    const next = await syncCharacterMemories(project, character.id, {
      signal: controller.current.signal, onUpdated: apply,
      onProgress: value => { if (mounted.current) setMessage(value); },
    });
    apply(next);
  });
  const save = (action: 'confirm' | 'remove' | 'confirmProfile' | 'dismissProfile', memory: CharacterLifeMemory) => void run(async () => {
    apply(await saveCharacterMemory(project.id, character.id, action, memory), action === 'confirmProfile' ? memory.profileChanges : undefined);
    if (mounted.current) setMessage(action === 'confirm' ? '已确认：这份经历会用于角色对话和后续写作' : action === 'confirmProfile' ? '已补充原设定，后续写作会读取' : action === 'dismissProfile' ? '已忽略所选建议' : '已移除这条经历记录');
  });
  return { current, busy, message, error, sync, save, stop: () => controller.current?.abort() };
}
