/**
 * AI 批量生成 · 状态与编排的唯一持有者（容器与展示组件都从这里取数据与动作）。
 *
 * 位置：./batch 的顶层 hook，AIBatchGenerate.tsx 只做外壳渲染，
 * BatchHeader / BatchConfigPanel / BatchStepList 通过 Controller 类型只读消费本 hook 的返回值。
 * 依赖方向：@/api（取数）→ ./steps、./runEntityBatch、./runChapterBatch、./saveStep、./types；
 * 展示组件依赖本文件（类型），本文件不依赖展示组件，避免环。
 */
import { useEffect, useRef, useState } from 'react';

import { getCharacters, getChapters, getProject } from '@/api';
import { useCharacterSyncPreferences } from '@/features/character/memory';
import { toast } from '@/shared/ui/toast';
import type { Chapter, Character, Project } from '@/shared/types';

import { runChapterBatch } from './runChapterBatch';
import { runEntityBatch } from './runEntityBatch';
import { saveStep } from './saveStep';
import { STEPS, makeInitialSteps } from './steps';
import type { AIBatchGenerateProps, StepKey, StepState } from './types';

export function useBatchGenerate({ projectId }: AIBatchGenerateProps) {
  const characterSync = useCharacterSyncPreferences(projectId);
  const [instruction, setInstruction] = useState('');
  const [mode, setMode] = useState<'first' | 'continue'>('first');
  const [charCount, setCharCount] = useState('30');
  const [chaptersPerVolume, setChaptersPerVolume] = useState('80');
  const [chapterWordCount, setChapterWordCount] = useState('4000');
  const [layeredMode, setLayeredMode] = useState(false);
  const [enabled, setEnabled] = useState<Record<StepKey, boolean>>({
    characters: true, world: true, outlines: true,
    threads: true, timeline: false, chapters: false,
  });
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(makeInitialSteps());
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<Set<StepKey>>(new Set());
  const [chapterProgress, setChapterProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);

  const [project, setProject]                       = useState<Project | undefined>(undefined);
  const [existingChapters, setExistingChapters]     = useState<Chapter[]>([]);
  const [existingChars, setExistingChars]           = useState<Character[]>([]);

  useEffect(() => {
    Promise.all([
      getProject(projectId),
      getChapters(projectId),
      getCharacters(projectId),
    ]).then(([proj, chaps, chars]) => {
      setProject(proj);
      setExistingChapters(chaps);
      setExistingChars(chars);
    });
  }, [projectId]);

  const updateStep = (key: StepKey, patch: Partial<StepState>) => {
    setSteps(s => ({ ...s, [key]: { ...s[key], ...patch } }));
  };

  /** 流式增量：同一批多个 chunk 都基于最新 state 追加，避免互相覆盖 */
  const appendRawText = (key: StepKey, chunk: string) => {
    setSteps(s => ({ ...s, [key]: { ...s[key], rawText: s[key].rawText + chunk } }));
  };

  /** 整段替换（章节步骤的进度前缀文本用） */
  const setRawText = (key: StepKey, text: string) => {
    setSteps(s => ({ ...s, [key]: { ...s[key], rawText: text } }));
  };

  const expandStep = (key: StepKey) => {
    setExpanded(s => new Set([...s, key]));
  };

  const toggleExpand = (key: StepKey) => {
    setExpanded(s => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };

  const toggleSelect = (key: StepKey, idx: number) => {
    setSteps(s => {
      const sel = new Set(s[key].selected);
      sel.has(idx) ? sel.delete(idx) : sel.add(idx);
      return { ...s, [key]: { ...s[key], selected: sel } };
    });
  };

  const selectAll = (key: StepKey, count: number) => {
    setSteps(s => ({
      ...s,
      [key]: { ...s[key], selected: new Set(Array.from({ length: count }, (_, i) => i)) },
    }));
  };

  const deselectAll = (key: StepKey) => {
    setSteps(s => ({ ...s, [key]: { ...s[key], selected: new Set() } }));
  };

  const toggleEnabled = (key: StepKey, value: boolean) => {
    setEnabled(v => ({ ...v, [key]: value }));
  };

  // ---- 生成流程 ----

  const handleGenerate = async () => {
    if (!project) return;
    abortRef.current = false;
    setRunning(true);

    // 重置
    const keys = STEPS.filter(s => enabled[s.key]).map(s => s.key);
    keys.forEach(k => updateStep(k, { status: 'idle', rawText: '', data: [], error: undefined }));

    try {
      await runEntityBatch({
        project,
        mode,
        instruction,
        charCount,
        chaptersPerVolume,
        enabled,
        existingChars,
        existingChapters,
        isAborted: () => abortRef.current,
        updateStep,
        appendRawText,
        expandStep,
      });

      // 6. 章节正文（逐章生成）
      if (enabled.chapters && !abortRef.current) {
        await runChapterBatch({
          project,
          projectId,
          existingChapters,
          instruction,
          chapterWordCount,
          layeredMode,
          characterSyncPreferences: characterSync.preferences,
          isAborted: () => abortRef.current,
          updateStep,
          setRawText,
          appendRawText,
          setChapterProgress,
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  // ---- 保存 ----

  const handleSaveStep = async (key: StepKey) => {
    const step = steps[key];
    if (!step.data || step.data.length === 0) return;

    try {
      await saveStep(key, { projectId, data: step.data, selected: step.selected,
        characterSyncPreferences: characterSync.preferences });
      updateStep(key, { saved: true });
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    }
  };

  const handleSaveAll = async () => {
    const keys: StepKey[] = ['characters', 'world', 'outlines', 'threads', 'chapters'];
    for (const key of keys) {
      if (steps[key].status === 'done' && !steps[key].saved) {
        await handleSaveStep(key);
      }
    }
  };

  const anyDone = STEPS.some(s => steps[s.key].status === 'done');
  const allSaved = STEPS.filter(s => steps[s.key].status === 'done').every(s => steps[s.key].saved);

  return {
    // 配置
    instruction, setInstruction,
    mode, setMode,
    charCount, setCharCount,
    chaptersPerVolume, setChaptersPerVolume,
    chapterWordCount, setChapterWordCount,
    layeredMode, setLayeredMode,
    characterSyncPreferences: characterSync.preferences, setCharacterSyncPreferences: characterSync.update,
    existingChars,
    enabled, toggleEnabled,
    // 运行时状态
    project,
    steps,
    running,
    expanded,
    chapterProgress,
    anyDone,
    allSaved,
    // 动作
    handleGenerate,
    handleStop,
    handleSaveStep,
    handleSaveAll,
    toggleExpand,
    toggleSelect,
    selectAll,
    deselectAll,
  };
}
