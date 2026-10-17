import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { getChapters, getThreads, saveThread } from '@/api';
import { workChapterPath } from '@/shared/lib/workRoutes';
import { OVERDUE_CHAPTERS, SUGGEST_PAYOFF_AFTER } from '@/shared/lib/pacingTracker';
import { Badge } from '@/shared/ui/badge';
import { toast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/utils';
import type { Chapter, PlotThread } from '@/shared/types';
import { ThreadBoard } from '@/features/thread/ThreadBoard';
import {
  THREAD_STAGES,
  buildThreadBoard,
  threadStatus,
  type ThreadRow,
  type ThreadStage,
} from '../analysis';

const IMPORTANCE: Record<PlotThread['importance'], { label: string; variant: 'default' | 'warning' | 'outline' }> = {
  critical: { label: '关键', variant: 'default' },
  major: { label: '重要', variant: 'warning' },
  minor: { label: '次要', variant: 'outline' },
};

const STAGE_VARIANT: Record<ThreadStage, 'secondary' | 'warning' | 'success' | 'outline'> = {
  planted: 'secondary',
  reinforced: 'warning',
  resolved: 'success',
  abandoned: 'outline',
};

/** 伏笔在一根横轴上的布点（埋设 / 强化 / 回收）。 */
function PositionTrack({ row, from, to }: { row: ThreadRow; from: number; to: number }) {
  const span = Math.max(1, to - from);
  const pos = (order: number) => `${((order - from) / span) * 100}%`;
  const dot: Record<'plant' | 'reinforce' | 'payoff', string> = {
    plant: 'bg-ink-500',
    reinforce: 'bg-amber-500',
    payoff: 'bg-green-600',
  };
  return (
    <div className="relative h-3 mt-2">
      <div className="absolute inset-x-0 top-1/2 h-px bg-zinc-200 dark:bg-zinc-700" />
      {row.positions.map(p => (
        <span
          key={`${p.kind}-${p.order}`}
          title={`${p.kind === 'plant' ? '埋设' : p.kind === 'reinforce' ? '强化' : '回收'}：第${p.order}章`}
          className={cn('absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full', dot[p.kind])}
          style={{ left: pos(p.order) }}
        />
      ))}
    </div>
  );
}

function StageButton({ row, onChange }: { row: ThreadRow; onChange: (stage: ThreadStage) => void }) {
  return (
    <div className="flex items-center gap-1">
      {(['planted', 'reinforced', 'resolved'] as ThreadStage[]).map(stage => (
        <button
          key={stage}
          onClick={() => onChange(stage)}
          disabled={row.stage === stage}
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] border transition-colors',
            row.stage === stage
              ? 'border-ink-500 text-ink-600 dark:text-ink-300'
              : 'border-zinc-200 text-zinc-400 hover:text-zinc-700 dark:border-zinc-700 dark:hover:text-zinc-200',
          )}
          title={THREAD_STAGES[stage].hint}
        >
          {THREAD_STAGES[stage].label}
        </button>
      ))}
    </div>
  );
}

/**
 * 完善台 · 伏笔回收看板（REFACTOR_PLAN.md §5.2）。
 *
 * 三态机「已埋 → 已强化 → 已回收」+ 按进度提示该回收哪几条 + 横轴布点。
 * 完整增删改仍走原来的 `ThreadBoard`（折叠在底部，不重复实现一套编辑器）。
 */
export function ThreadsView({ projectId }: { projectId: string }) {
  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [hideSettled, setHideSettled] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getThreads(projectId), getChapters(projectId)])
      .then(([t, c]) => { setThreads(t); setChapters(c); })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const board = useMemo(() => buildThreadBoard(threads, chapters), [threads, chapters]);
  const domain = useMemo(() => {
    const orders = chapters.map(c => c.order);
    return { from: orders.length ? Math.min(...orders) : 1, to: orders.length ? Math.max(...orders) : 1 };
  }, [chapters]);

  const changeStage = async (row: ThreadRow, stage: ThreadStage) => {
    const thread = threads.find(t => t.id === row.id);
    if (!thread) return;
    setSaving(row.id);
    try {
      await saveThread({
        ...thread,
        projectId,
        status: threadStatus(stage),
        resolvedAt: stage === 'resolved' ? (thread.resolvedAt || `第${board.maxOrder}章`) : thread.resolvedAt,
      });
      toast.success(`「${thread.title}」→ ${THREAD_STAGES[stage].label}`);
      load();
    } catch {
      toast.error('伏笔状态保存失败');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <p className="p-6 text-sm text-zinc-400">正在读取伏笔…</p>;

  const visibleRows = hideSettled
    ? board.rows.filter(r => r.stage !== 'resolved' && r.stage !== 'abandoned')
    : board.rows;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {board.needsPayoff.length > 0 && board.horizon && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            按当前进度（最新第 {board.maxOrder} 章），第 {board.horizon.from}–{board.horizon.to} 章建议回收以下 {board.needsPayoff.length} 条
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {board.needsPayoff.slice(0, 6).map(r => {
              const plantedChapter = r.plantedOrder != null ? chapters.find(c => c.order === r.plantedOrder) : undefined;
              return (
                <li key={r.id}>
                  · {r.title} —— {r.reason}
                  {plantedChapter && (
                    <Link to={workChapterPath(projectId, plantedChapter.id)} className="ml-1 underline">
                      看埋设章
                    </Link>
                  )}
                </li>
              );
            })}
            {board.needsPayoff.length > 6 && <li>· 还有 {board.needsPayoff.length - 6} 条…</li>}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="gap-1"><Bookmark className="h-3 w-3" />共 {board.rows.length} 条</Badge>
        <Badge variant="secondary">
          已埋 {board.rows.filter(r => r.stage === 'planted').length} · 已强化 {board.rows.filter(r => r.stage === 'reinforced').length} · 已回收 {board.rows.filter(r => r.stage === 'resolved').length} · 已废弃 {board.rows.filter(r => r.stage === 'abandoned').length}
        </Badge>
        <Badge variant={board.overdue.length > 0 ? 'destructive' : 'secondary'}>逾期 {board.overdue.length}</Badge>
        <label className="ml-auto flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
          <input type="checkbox" checked={hideSettled} onChange={e => setHideSettled(e.target.checked)} />
          隐藏已回收/已废弃
        </label>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-md border border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          还没有伏笔。展开下面的「完整编辑」新建一条；埋设时把 plantedAt 写成「第 3 章」，看板就能算出已过多少章。
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map(row => (
            <li key={row.id} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={STAGE_VARIANT[row.stage]} className="text-[10px]">{row.stageLabel}</Badge>
                    <Badge variant={IMPORTANCE[row.importance].variant} className="text-[10px]">{IMPORTANCE[row.importance].label}</Badge>
                    <span className="text-sm text-zinc-800 dark:text-zinc-100">{row.title}</span>
                    {saving === row.id && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
                  </div>
                  {row.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">{row.description}</p>
                  )}
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {row.plantedOrder != null ? `埋设：第 ${row.plantedOrder} 章` : '埋设章未标注'}
                    {row.elapsed != null && ` · 已过 ${row.elapsed} 章`}
                    {row.plannedOrder != null && ` · 计划第 ${row.plannedOrder} 章回收`}
                    {row.reinforcedOrders.length > 0 && ` · 强化于第 ${row.reinforcedOrders.join('、')} 章`}
                    {row.resolvedOrder != null && ` · 回收于第 ${row.resolvedOrder} 章`}
                    <span className={cn('ml-1.5', row.needPayoff && 'text-amber-600 dark:text-amber-400')}>{row.reason}</span>
                  </p>
                  <PositionTrack row={row} from={domain.from} to={domain.to} />
                </div>
                <StageButton row={row} onChange={stage => changeStage(row, stage)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          onClick={() => setShowEditor(v => !v)}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          {showEditor ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          完整编辑（新建 / 改描述 / 删除 / AI 生成伏笔）
        </button>
        {showEditor && (
          <div className="mt-3 -mx-4 sm:-mx-5">
            <ThreadBoard projectId={projectId} />
          </div>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-400">
        三态机是显示层的口径：数据仍用原来的 status 字段（已埋=planted、已强化=developing、已回收=resolved），
        因此老数据不用迁移。判定「该回收」的阈值见 <code>SUGGEST_PAYOFF_AFTER</code>（
        {SUGGEST_PAYOFF_AFTER} 章）与 <code>OVERDUE_CHAPTERS</code>（{OVERDUE_CHAPTERS} 章）。
      </p>
    </div>
  );
}
