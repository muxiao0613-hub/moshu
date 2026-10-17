/**
 * AI 助手面板 · 模式选择器（续写 / 润色 / 章节检查 / AI生成 / 全局检查）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染在头部下方；
 * 清单由 panelModes.buildModeItems 依据可用性生成，本组件只负责渲染与回调。
 * 依赖方向：lucide-react + @/shared/lib/utils（cn）→ ./types；不依赖 hook。
 */
import { ShieldCheck } from 'lucide-react';

import { cn } from '@/shared/lib/utils';

import type { ModeItem, PanelMode } from './types';

interface PanelModeSelectorProps {
  mode: PanelMode;
  items: ModeItem[];
  onSelect: (mode: PanelMode) => void;
}

const BUTTON_BASE = 'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors';
const BUTTON_ACTIVE = 'bg-ink-600 text-white';
const BUTTON_IDLE = 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700';

export function PanelModeSelector({ mode, items, onSelect }: PanelModeSelectorProps) {
  return (
    <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
      <div className="flex flex-wrap gap-1">
        {items.map(m => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className={cn(BUTTON_BASE, mode === m.id ? BUTTON_ACTIVE : BUTTON_IDLE)}
          >
            {m.icon}{m.label}
          </button>
        ))}
        {/* 全局检查始终显示 */}
        {!items.find(m => m.id === 'global') && (
          <button
            onClick={() => onSelect('global')}
            className={cn(BUTTON_BASE, mode === 'global' ? BUTTON_ACTIVE : BUTTON_IDLE)}
          >
            <ShieldCheck className="h-3.5 w-3.5" />全局检查
          </button>
        )}
      </div>
    </div>
  );
}
