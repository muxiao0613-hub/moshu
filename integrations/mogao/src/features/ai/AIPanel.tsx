/**
 * AI 助手面板 · 主容器（对外导出 AIPanel，props 与行为不变）。
 *
 * 位置：features/ai 的对外入口（被 shared/layout/ProjectWorkspace 引用）；
 * 结构已拆到 ./panel：取数在 useAIPanelData、生成在 useAIPanelGenerate、修复在 useModuleFix，
 * 头部/模式/指令/上下文/结果/修复/空状态各为独立组件。
 * 依赖方向：只做组合与派生（模式可用性、占位文案、是否可生成）→ ./panel 的 hook 与组件。
 */
import { useEffect, useRef, useState } from 'react';

import { CharacterSyncSettings } from '@/features/character/CharacterSyncSettings';
import { useCharacterSyncPreferences } from '@/features/character/memory';
import { toast } from '@/shared/ui/toast';
import { useEditor } from '@/shared/contexts/EditorContext';

import { PanelContextInfo } from './panel/PanelContextInfo';
import { PanelEmptyState } from './panel/PanelEmptyState';
import { PanelFixActions } from './panel/PanelFixActions';
import { PanelHeader } from './panel/PanelHeader';
import { PanelInstruction } from './panel/PanelInstruction';
import { PanelModeSelector } from './panel/PanelModeSelector';
import { PanelResultView } from './panel/PanelResultView';
import {
  GENERATE_BUTTON_LABELS, MODULE_LABELS, buildModeItems, buildPlaceholder,
} from './panel/panelModes';
import type { AIPanelProps, PanelMode } from './panel/types';
import { useAIPanelData } from './panel/useAIPanelData';
import { useAIPanelGenerate } from './panel/useAIPanelGenerate';
import { useModuleFix } from './panel/useModuleFix';

export function AIPanel({ projectId }: AIPanelProps) {
  const { currentChapter, currentContent, selectedText, insertCallback, moduleCtx } = useEditor();
  const characterSync = useCharacterSyncPreferences(projectId);
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const adoptingRef = useRef(false);
  const [mode, setMode] = useState<PanelMode>('continue');
  const [instruction, setInstruction] = useState('');

  const data = useAIPanelData(projectId);

  const gen = useAIPanelGenerate({
    projectId,
    mode,
    instruction,
    project: data.project,
    characters: data.characters,
    worldSettings: data.worldSettings,
    outlines: data.outlines,
    threads: data.threads,
    chapters: data.chapters,
    timelineEvents: data.timelineEvents,
    storyBible: data.storyBible,
    factLedger: data.factLedger,
    moduleCtx,
    currentChapter,
    currentContent,
    selectedText,
  });

  const fix = useModuleFix({
    projectId,
    project: data.project,
    result: gen.result,
    refreshAll: data.refreshAll,
  });

  // 切换模块时自动选择合适的模式
  useEffect(() => {
    if (!moduleCtx) return;
    if (moduleCtx.type === 'chapter') {
      setMode('continue');
    } else {
      setMode('generate');
    }
    gen.resetOutput();
    setInstruction('');
  }, [moduleCtx?.type, moduleCtx?.entityId]);

  // 当前激活的模块（优先 moduleCtx，其次 chapter）
  const activeModule = moduleCtx?.type || (currentChapter ? 'chapter' : null);
  const activeLabel = activeModule ? MODULE_LABELS[activeModule] : null;

  // 各模式是否可用
  const canChapter = !!currentChapter;
  const canEntity = !!moduleCtx && moduleCtx.type !== 'chapter';

  const availableModes = buildModeItems(canChapter, canEntity).filter(m => m.available);
  const placeholder = buildPlaceholder(mode, { selectedText, moduleCtx });

  const canGenerate = !adopting && !gen.streaming && (
    (mode === 'global') ||
    (mode === 'generate' && canEntity) ||
    (['continue', 'check'].includes(mode) && canChapter) ||
    (mode === 'polish' && canChapter && !!selectedText)
  );

  const handleApplyToModule = () => {
    if (!gen.result || !moduleCtx?.onApplyResult) return;
    try { gen.validateResult(); moduleCtx.onApplyResult(gen.result); }
    catch (e) { toast.error(e instanceof Error ? e.message : '候选已经过时，请重新生成'); }
  };

  useEffect(() => { setAdopted(false); }, [gen.result, currentChapter?.id]);
  const handleInsert = async () => {
    if (!gen.result || !insertCallback || adoptingRef.current || adopted) return;
    try { gen.validateResult(); }
    catch (e) { toast.error(e instanceof Error ? e.message : '候选已经过时，请重新生成'); return; }
    adoptingRef.current = true;
    setAdopting(true); setAdopted(true);
    try {
      await insertCallback(gen.result, { characterSync: characterSync.preferences });
      toast.success(characterSync.preferences.mode === 'off' ? '正文已保存，本次未更新人物档案' : '正文已保存，人物档案处理完成');
    } catch (error) { toast.error(error instanceof Error ? error.message : '正文已插入，档案更新失败，请重试'); }
    finally { adoptingRef.current = false; setAdopting(false); }
  };

  return (
    <aside className="w-full h-full flex flex-col bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <PanelHeader activeLabel={activeLabel} />

      {/* Mode selector */}
      <PanelModeSelector mode={mode} items={availableModes} onSelect={setMode} />

      {canChapter && (mode === 'continue' || mode === 'polish') && <div className="mx-3 mt-2">
        <CharacterSyncSettings characters={data.characters} value={characterSync.preferences}
          onChange={characterSync.update} disabled={gen.streaming || adopting} />
      </div>}
      {adopting && <p role="status" className="mx-3 mt-2 text-xs text-ink-600">正在保存正文并处理人物档案…</p>}

      {/* Instruction input */}
      <PanelInstruction
        mode={mode}
        instruction={instruction}
        onInstructionChange={setInstruction}
        placeholder={placeholder}
        canGenerate={canGenerate}
        streaming={gen.streaming}
        resultLength={gen.result.length}
        buttonLabel={GENERATE_BUTTON_LABELS[mode]}
        selectedText={selectedText}
        moduleCtx={moduleCtx}
        onGenerate={gen.handleGenerate}
        onStop={gen.handleStop}
      />

      {/* Context info (chapter mode only) */}
      {gen.contextInfo && <PanelContextInfo contextInfo={gen.contextInfo} ragChunks={gen.ragChunks} />}

      {/* Error */}
      {gen.error && (
        <div className="mx-3 mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
          {gen.error}
        </div>
      )}

      {/* Result */}
      {(gen.result || gen.streaming) && (
        <PanelResultView
          result={gen.result}
          streaming={gen.streaming}
          applying={adopting}
          mode={mode}
          canInsert={!adopted && (mode === 'continue' || mode === 'polish') && !!insertCallback}
          canApply={mode === 'generate' && !!moduleCtx?.onApplyResult}
          onInsert={handleInsert}
          onApply={handleApplyToModule}
          onRegenerate={gen.handleGenerate}
        />
      )}

      {/* 全局检查完成后：修复入口 + 修复确认对话框 */}
      <PanelFixActions
        show={mode === 'global' && !!gen.result && !gen.streaming}
        fixLoading={fix.fixLoading}
        fixDialog={fix.fixDialog}
        onFixAll={fix.handleFixAll}
        onFixTimeline={fix.handleFixTimeline}
        onFixOutlines={fix.handleFixOutlines}
        onFixThreads={fix.handleFixThreads}
        onFixCharacters={fix.handleFixCharacters}
        onFixWorld={fix.handleFixWorld}
        onCloseDialog={fix.closeFixDialog}
      />

      {/* Empty state */}
      {!gen.result && !gen.streaming && !gen.error && (
        <PanelEmptyState
          mode={mode}
          moduleCtx={moduleCtx}
          activeModule={activeModule}
          activeLabel={activeLabel}
        />
      )}
    </aside>
  );
}
