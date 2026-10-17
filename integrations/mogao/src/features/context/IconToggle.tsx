import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * 抽屉里成对出现的图标开关（眼睛＝是否注入 / 图钉＝是否固定 / 斜杠＝本章无关）。
 * 单独成文件是因为条目行与分组头都要用，避免组头反过来依赖条目行。
 */
export function IconToggle({
  active, onClick, title, activeClass, children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  activeClass?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      className={cn(
        'p-1 rounded transition-colors',
        active
          ? (activeClass ?? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400')
          : 'text-zinc-300 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800',
      )}
    >
      {children}
    </button>
  );
}
