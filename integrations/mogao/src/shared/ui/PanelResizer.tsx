/**
 * 分栏把手：拖它改变相邻面板的宽度，双击恢复默认。
 *
 * 左右两栏共用这一个组件与 `useDragWidth`，所以外观与手感一致；
 * 只在桌面端显示（手机端两个面板都是覆盖抽屉，没有分栏概念）。
 */

import { cn } from '@/shared/lib/utils';
import type { DragWidthHandle } from '@/shared/lib/useDragWidth';

interface PanelResizerProps {
  handle: DragWidthHandle;
  /** 无障碍与 tooltip 文案，如「调整左栏宽度」。 */
  label: string;
  /**
   * 与相邻面板「变成常驻列」的断点一致：大多数左右栏在 md 就常驻，
   * 角色扮演页右栏到 xl 才是常驻列 —— 不对齐会出现「旁边没栏却有个把手」。
   */
  visibleFrom?: 'md' | 'xl';
}

export function PanelResizer({ handle, label, visibleFrom = 'md' }: PanelResizerProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label}：拖动调整，双击恢复默认`}
      onPointerDown={handle.onPointerDown}
      onDoubleClick={handle.reset}
      className={cn(
        'hidden w-1 shrink-0 cursor-col-resize transition-colors',
        visibleFrom === 'xl' ? 'xl:block' : 'md:block',
        handle.dragging
          ? 'bg-ink-500/80'
          : 'bg-zinc-200/70 hover:bg-zinc-400/70 dark:bg-zinc-800/80 dark:hover:bg-zinc-600/70',
      )}
    />
  );
}
