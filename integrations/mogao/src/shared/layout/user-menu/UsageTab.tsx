/**
 * 个人设置 · 用量 tab：今日/累计用量、近 7 天明细与清除记录。
 *
 * 在拆分中的位置：纯展示组件。对外门面是 `shared/layout/UserMenu.tsx`，
 * 今日用量由门面订阅 TOKEN_UPDATE_EVENT 后传入，清除记录也由门面执行（要同步清零那两个 state）。
 * 依赖方向：`@/api/tokenTracker`（与顶栏用量徽标同一份本地记录）→（本文件）→ 门面。
 */
import { Trash2 } from 'lucide-react';
import { calculateCost, formatCost, formatTokens, getTotalCost, getTotalTokens, readUsage } from '@/api/tokenTracker';
import { cn } from '@/shared/lib/utils';

interface UsageTabProps {
  model: string;
  todayTokens: number;
  todayCost: number;
  onClear: () => void;
}

export function UsageTab({ model, todayTokens, todayCost, onClear }: UsageTabProps) {
  const allUsage = readUsage();
  const totalEstCost = allUsage.reduce((sum, d) => {
    const tracked = d.costCNY || 0;
    return sum + (tracked > 0 ? tracked : calculateCost(model, d.promptTokens, d.completionTokens));
  }, 0);
  const todayEntry = allUsage.find(d => d.date === new Date().toISOString().slice(0, 10));
  const todayEstCost = todayEntry
    ? ((todayEntry.costCNY || 0) > 0 ? todayEntry.costCNY : calculateCost(model, todayEntry.promptTokens, todayEntry.completionTokens))
    : todayCost;

  return (
    <div className="space-y-4">
      {/* 今日 / 累计 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-ink-50 to-white dark:from-ink-900/20 dark:to-zinc-800 border border-ink-100 dark:border-ink-800/50 p-4 text-center">
          <p className="text-2xl font-bold text-ink-600 dark:text-ink-400">{formatTokens(todayTokens)}</p>
          {todayEstCost > 0 && (
            <p className="text-sm font-medium text-amber-500 mt-0.5">
              {(todayEntry?.costCNY || 0) > 0 ? '' : '~'}{formatCost(todayEstCost)}
            </p>
          )}
          <p className="text-xs text-zinc-400 mt-1">今日用量</p>
        </div>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4 text-center">
          <p className="text-2xl font-bold text-zinc-700 dark:text-zinc-300">{formatTokens(getTotalTokens())}</p>
          {totalEstCost > 0 && (
            <p className="text-sm font-medium text-amber-500 mt-0.5">
              {getTotalCost() > 0 && getTotalCost() >= totalEstCost * 0.99 ? '' : '~'}{formatCost(totalEstCost)}
            </p>
          )}
          <p className="text-xs text-zinc-400 mt-1">累计用量</p>
        </div>
      </div>

      {/* 近 7 天明细 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">近 7 天明细</span>
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3 w-3" />清除记录
          </button>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          {allUsage.length === 0 ? (
            <p className="text-xs text-zinc-400 text-center py-6">暂无记录</p>
          ) : (
            allUsage.slice(0, 7).map((d, i) => {
              const tracked = d.costCNY || 0;
              const est = tracked > 0 ? tracked : calculateCost(model, d.promptTokens, d.completionTokens);
              const isEst = tracked <= 0 && est > 0;
              return (
                <div
                  key={d.date}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 text-xs',
                    i !== 0 && 'border-t border-zinc-100 dark:border-zinc-700/60',
                    i === 0 && 'bg-ink-50/50 dark:bg-ink-900/10'
                  )}
                >
                  <span className="text-zinc-500 w-24 shrink-0">{d.date}</span>
                  <span className="text-zinc-400 hidden sm:block">{d.calls} 次调用</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{formatTokens(d.totalTokens)}</span>
                  {est > 0
                    ? <span className={cn('font-medium w-14 text-right', isEst ? 'text-amber-400' : 'text-amber-500')}>
                        {isEst ? '~' : ''}{formatCost(est)}
                      </span>
                    : <span className="text-zinc-300 w-14 text-right">—</span>
                  }
                </div>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">~ 为按当前模型补估的旧记录</p>
      </div>
    </div>
  );
}
