/**
 * AI 助手面板 · 空状态提示（未生成、未流式、无错误时按模式给出引导）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染在结果区之上。
 * 依赖方向：lucide-react + @/shared/contexts（ModuleContext 类型）→ ./types；不依赖 hook。
 */
import { Bot } from 'lucide-react';

import type { ModuleContext } from '@/shared/contexts/EditorContext';

import type { PanelMode } from './types';

interface PanelEmptyStateProps {
  mode: PanelMode;
  moduleCtx: ModuleContext | null;
  activeModule: string | null;
  activeLabel: string | null;
}

export function PanelEmptyState({ mode, moduleCtx, activeModule, activeLabel }: PanelEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-zinc-400 px-4 text-center">
      <div>
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-xs leading-relaxed">
          {mode === 'global'
            ? '点击「全局检查」，AI 将检查所有设定的逻辑一致性'
            : mode === 'generate' && !moduleCtx
              ? '在左侧各模块点击「✨ AI生成」按钮，此处会自动填入上下文'
              : !activeModule
                ? '打开章节或在各模块中点击 AI 按钮即可使用'
                : `当前：${activeLabel}。输入指令开始生成`
          }
        </p>
      </div>
    </div>
  );
}
