/**
 * AI 批量生成 · 进度与结果区（按启用的步骤渲染步骤卡：状态、流式文本、保存按钮）。
 *
 * 位置：./batch 的展示层，被 AIBatchGenerate.tsx 容器渲染在设置区下方；
 * 展开后的数据预览委托给 BatchStepPreview，避免本文件同时承担两种职责。
 * 依赖方向：lucide-react、@/shared/ui（Badge/Button）→ ./steps、./BatchStepPreview、./useBatchGenerate（仅类型）。
 */
import { ChevronDown, ChevronUp, Save } from 'lucide-react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { BatchStepPreview } from './BatchStepPreview';
import { STEPS, statusIcon } from './steps';
import type { useBatchGenerate } from './useBatchGenerate';

type Controller = ReturnType<typeof useBatchGenerate>;

interface BatchStepListProps {
  controller: Controller;
}

export function BatchStepList({ controller }: BatchStepListProps) {
  const {
    steps, enabled, expanded, chapterProgress,
    toggleExpand, toggleSelect, selectAll, deselectAll, handleSaveStep,
  } = controller;

  return (
    <div className="px-6 py-4 space-y-3">
      {STEPS.filter(s => enabled[s.key]).map(step => {
        const state = steps[step.key];
        if (state.status === 'idle') return null;
        const isExpanded = expanded.has(step.key);
        const hasData = state.data && state.data.length > 0;

        return (
          <div key={step.key} className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            {/* Step header */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 select-none"
              onClick={() => hasData && toggleExpand(step.key)}
            >
              <div className="flex items-center gap-3">
                {statusIcon(state.status)}
                <span className="text-ink-500">{step.icon}</span>
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{step.label}</span>
                {state.status === 'running' && step.key === 'chapters' && (
                  <span className="text-xs text-zinc-400">
                    {chapterProgress.current}/{chapterProgress.total}
                  </span>
                )}
                {state.status === 'done' && hasData && (
                  <Badge variant="secondary" className="text-xs">
                    {state.data!.length} 条 · 已选 {state.selected.size}
                  </Badge>
                )}
                {state.status === 'error' && (
                  <span className="text-xs text-red-500">{state.error}</span>
                )}
                {state.saved && <Badge variant="success" className="text-xs">已保存</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {state.status === 'done' && !state.saved && (
                  <Button
                    size="sm"
                    onClick={e => { e.stopPropagation(); handleSaveStep(step.key); }}
                    className="h-7 text-xs gap-1"
                    disabled={state.selected.size === 0}
                  >
                    <Save className="h-3 w-3" />保存选中 ({state.selected.size})
                  </Button>
                )}
                {hasData && (
                  isExpanded
                    ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                    : <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>

            {/* Streaming text (while running) */}
            {state.status === 'running' && state.rawText && (
              <div className="px-4 pb-3 text-xs text-zinc-400 font-mono max-h-24 overflow-auto border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 whitespace-pre-wrap">
                {state.rawText.slice(-800)}
              </div>
            )}

            {/* Expanded data preview */}
            {isExpanded && hasData && state.status === 'done' && (
              <BatchStepPreview
                stepKey={step.key}
                data={state.data!}
                selected={state.selected}
                onToggle={i => toggleSelect(step.key, i)}
                onSelectAll={() => selectAll(step.key, state.data!.length)}
                onDeselectAll={() => deselectAll(step.key)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
