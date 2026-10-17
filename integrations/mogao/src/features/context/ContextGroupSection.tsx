import type { ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { ContextPlanGroup } from './contextPlan';
import type { ContextPrefs } from './contextPrefs';
import { ContextItemRow, type ContextRowActions } from './ContextItemRow';
import { IconToggle } from './IconToggle';

/**
 * 一个分区（硬约束 / 自动检索）：分区头 + 每个分组的规则说明与整组开关。
 * 条目本身交给 `ContextItemRow`，这里只做分组层的事。
 */
export function ContextGroupSection({
  sectionKey, title, hint, icon, groups, prefs, chapterId, actions,
}: {
  sectionKey: 'hard' | 'auto';
  title: string;
  hint: string;
  icon: ReactNode;
  groups: ContextPlanGroup[];
  prefs: ContextPrefs;
  chapterId?: string;
  actions: ContextRowActions;
}) {
  const list = groups.filter(g => (sectionKey === 'hard' ? g.kind === 'hard' : g.kind === 'auto'));
  if (list.length === 0) return null;

  const tokens = list.reduce((s, g) => s + g.injectedTokens, 0);
  const groupOff = list.every(g => prefs.off.includes(`group:${g.key}`));

  return (
    <section key={sectionKey}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{title}</h3>
        </div>
        <span className="text-[11px] text-zinc-400 tabular-nums">{tokens} tok</span>
      </div>
      <p className="text-[11px] text-zinc-400 mb-2">{hint}</p>
      {groupOff && (
        <p className="mb-2 rounded border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          整组已关闭，本次生成不会注入任何条目。
        </p>
      )}
      <div className="space-y-4">
        {list.map(g => (
          <div key={g.key}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300 truncate">{g.title}</span>
                <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                  {g.injectedCount}/{g.totalCount || 0}
                </span>
              </div>
              <IconToggle
                active={!prefs.off.includes(`group:${g.key}`)}
                onClick={() => actions.onToggleOff(`group:${g.key}`)}
                title={prefs.off.includes(`group:${g.key}`) ? '整组关闭中（点击恢复）' : '整组注入中（点击关闭）'}
                activeClass="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                {prefs.off.includes(`group:${g.key}`) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconToggle>
            </div>
            <p className="text-[11px] leading-4 text-zinc-400 mb-1.5">
              规则：{g.rule}
              {g.limit != null ? `（本组上限 ${g.limit} 条，固定项额外计入）` : ''}
            </p>
            {g.items.length === 0 ? (
              <p className="text-[11px] text-zinc-400">本项目暂无条目。</p>
            ) : (
              <ul className="space-y-2">
                {g.items.map(item => (
                  <ContextItemRow
                    key={item.id}
                    item={item}
                    prefs={prefs}
                    chapterId={chapterId}
                    actions={actions}
                  />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
