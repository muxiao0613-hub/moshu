import { ChevronDown, ChevronRight, CircleSlash, Eye, EyeOff, Pencil, Pin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import type { ContextItem, EditableKind } from './contextPlan';
import { isExcluded, isOff, isPinned } from './contextPrefs';
import type { ContextPrefs } from './contextPrefs';
import { IconToggle } from './IconToggle';

/**
 * 条目行：一条上下文候选的展示与开关。
 *
 * 这里是**纯展示 + 回调**：不取数、不读偏好存储、不关心分组，
 * 所有动作由抽屉通过 `ContextRowActions` 注入，因此可以独立演进与复用。
 *
 * 编辑不在这里做：设定属于「完善台」的职责，这一行只给一条通往那里的链接
 * （`actions.editHref`），写作台的右栏因此只保留「看 + 开关」。
 */

/** 抽屉交给每一行的动作集合。 */
export interface ContextRowActions {
  isExpanded(id: string): boolean;
  onToggleExpand(id: string): void;
  /** 该条对应的实体在完善台里的编辑地址；没有可就地编辑的实体时返回 null */
  editHref(item: ContextItem): string | null;
  onToggleOff(id: string): void;
  onTogglePin(id: string): void;
  onToggleExcluded(id: string): void;
}

/** 实体种类 → 完善台里对应的标签名（只用于链接文案）。 */
const ENTITY_TAB_NAME: Record<EditableKind, string> = {
  character: '人物档案',
  world: '世界观',
  thread: '伏笔回收',
  fact: '事实账本',
};

export function ContextItemRow({
  item, prefs, chapterId, actions,
}: {
  item: ContextItem;
  prefs: ContextPrefs;
  chapterId?: string;
  actions: ContextRowActions;
}) {
  const open = actions.isExpanded(item.id);
  const off = isOff(prefs, item.id);
  const pinned = isPinned(prefs, item.id);
  const excluded = isExcluded(prefs, chapterId, item.id);
  const editHref = item.entity ? actions.editHref(item) : null;

  return (
    <li
      key={item.id}
      className={cn(
        'rounded-lg border px-2.5 py-2 transition-colors',
        item.injected
          ? pinned
            ? 'border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/20'
            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40'
          : 'border-dashed border-zinc-200 dark:border-zinc-800 opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => actions.onToggleExpand(item.id)}
          className="flex items-center gap-1.5 min-w-0 text-left"
        >
          {open ? <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" /> : <ChevronRight className="h-3 w-3 shrink-0 text-zinc-400" />}
          <span className="text-xs font-medium truncate">{item.label}</span>
          {pinned && <Pin className="h-3 w-3 shrink-0 text-indigo-500" />}
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          <span className={cn('text-[11px] tabular-nums mr-1', item.injected ? 'text-zinc-500' : 'text-zinc-400')}>
            {item.injected ? `${item.tokens} tok` : '未注入'}
          </span>
          <IconToggle
            active={!off}
            onClick={() => actions.onToggleOff(item.id)}
            title={off ? '已关闭：本次不注入（点击恢复）' : '本次注入中（点击关闭）'}
            activeClass="text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            {off ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </IconToggle>
          <IconToggle
            active={pinned}
            onClick={() => actions.onTogglePin(item.id)}
            title="固定为硬约束：不受条数上限与 token 预算裁剪"
          >
            <Pin className="h-3.5 w-3.5" />
          </IconToggle>
          {chapterId && (
            <IconToggle
              active={excluded}
              onClick={() => actions.onToggleExcluded(item.id)}
              title="标记为「本章无关」：仅影响本章，切章不互相影响"
              activeClass="text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400"
            >
              <CircleSlash className="h-3.5 w-3.5" />
            </IconToggle>
          )}
        </div>
      </div>

      <p className="mt-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{item.reason}</p>
      {item.clip && (
        <p className="mt-0.5 text-[11px] leading-4 text-amber-600 dark:text-amber-500/90">
          已截断：{item.clip}（完整 {item.fullTokens} tok）
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <div>
            <p className="text-[11px] text-zinc-400 mb-1">
              {item.injected ? '本次写入 prompt 的内容' : '本次未注入；以下是按规则本应写入的内容'}
            </p>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
              {item.text || '（空）'}
            </pre>
          </div>

          {item.clip && item.full !== item.text && (
            <details>
              <summary className="text-[11px] text-zinc-400 cursor-pointer">查看完整原文（未截断）</summary>
              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-2 text-[11px] leading-4 text-zinc-500">
                {item.full}
              </pre>
            </details>
          )}

          {item.entity && editHref && (
            <Link
              to={editHref}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              <Pencil className="h-3 w-3" />
              去完善台改（{ENTITY_TAB_NAME[item.entity.kind]}）
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
