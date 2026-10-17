/**
 * AI 助手面板 · 头部（标题 + 当前模块徽标）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染在最上方。
 * 依赖方向：lucide-react + @/shared/ui（Badge）；不依赖 hook 与其它展示组件。
 */
import { Bot, Globe } from 'lucide-react';

import { Badge } from '@/shared/ui/badge';

interface PanelHeaderProps {
  activeLabel: string | null;
}

export function PanelHeader({ activeLabel }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
      <Bot className="h-4 w-4 text-ink-500 shrink-0" />
      <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">AI 助手</span>
      {activeLabel && (
        <Badge variant="secondary" className="ml-auto text-xs gap-1">
          <Globe className="h-2.5 w-2.5" />
          {activeLabel}
        </Badge>
      )}
    </div>
  );
}
