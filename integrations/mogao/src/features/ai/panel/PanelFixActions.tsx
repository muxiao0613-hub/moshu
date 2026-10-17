/**
 * AI 助手面板 · 全局检查后的修复入口 + 修复确认对话框。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染；修复动作与对话框状态来自 useModuleFix，
 * 本组件只做渲染（按钮可用性看 fixLoading）。
 * 依赖方向：lucide-react + @/shared/ui（Button）、../ModuleFixDialog → ./types。
 */
import { Loader2, Wrench } from 'lucide-react';

import { Button } from '@/shared/ui/button';

import { ModuleFixDialog } from '../ModuleFixDialog';
import type { FixDialogState } from './types';

interface PanelFixActionsProps {
  /** 全局检查完成（有结果且非流式）时显示修复入口 */
  show: boolean;
  fixLoading: string | null;
  fixDialog: FixDialogState | null;
  onFixAll: () => void;
  onFixTimeline: () => void;
  onFixOutlines: () => void;
  onFixThreads: () => void;
  onFixCharacters: () => void;
  onFixWorld: () => void;
  onCloseDialog: () => void;
}

export function PanelFixActions({
  show, fixLoading, fixDialog, onFixAll, onFixTimeline, onFixOutlines, onFixThreads,
  onFixCharacters, onFixWorld, onCloseDialog,
}: PanelFixActionsProps) {
  return (
    <>
      {show && (
        <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-700 shrink-0 space-y-2">
          {/* 一键修复全部 */}
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={onFixAll}
            disabled={!!fixLoading}
          >
            {fixLoading === 'all'
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Wrench className="h-3.5 w-3.5" />
            }
            {fixLoading === 'all' ? '正在分析所有模块…' : '一键修复全部问题'}
          </Button>
          {/* 分模块修复 */}
          <div className="flex flex-wrap gap-1">
            {([
              { key: 'timeline',  label: '时间线', handler: onFixTimeline },
              { key: 'outline',   label: '大纲',   handler: onFixOutlines },
              { key: 'thread',    label: '伏笔',   handler: onFixThreads },
              { key: 'character', label: '人物',   handler: onFixCharacters },
              { key: 'world',     label: '世界观', handler: onFixWorld },
            ] as const).map(({ key, label, handler }) => (
              <Button key={key} size="sm" variant="outline"
                onClick={handler} disabled={!!fixLoading}
                className="h-6 text-xs gap-1 px-2"
              >
                {fixLoading === key ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 修复确认对话框 */}
      {fixDialog && (
        <ModuleFixDialog
          title={fixDialog.title}
          fixes={fixDialog.fixes}
          entities={fixDialog.entities}
          fieldLabels={fixDialog.fieldLabels}
          onApply={fixDialog.onApply}
          onClose={onCloseDialog}
        />
      )}
    </>
  );
}
