import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, Info } from 'lucide-react';
import { getChapters } from '@/api';
import { workChapterPath } from '@/shared/lib/workRoutes';
import {
  CONFLICT_LABELS,
  CONSECUTIVE_FAST_LIMIT,
  PACING_LABELS,
  SLOW_BLOCK_SIZE,
  type PacingWarning,
} from '@/shared/lib/pacingTracker';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { cn } from '@/shared/lib/utils';
import type { Chapter } from '@/shared/types';
import { buildPacingAtlas } from '../analysis';
import { replaceIssues } from '../issueApi';

const WARNING_LABELS: Record<PacingWarning['type'], string> = {
  consecutive_fast: '连续快节奏',
  no_slow_in_block: '缺慢节奏缓冲',
  cooldown_violation: '同类密集参考',
  needs_slow: '需要慢节奏',
};

const BAR_COLOR = [
  'bg-zinc-200 dark:bg-zinc-700',      // 0 未标注
  'bg-sky-400 dark:bg-sky-500',        // 1 慢
  'bg-amber-400 dark:bg-amber-500',    // 2 中
  'bg-rose-500 dark:bg-rose-600',      // 3 快
];

/**
 * 完善台 · 节奏曲线（REFACTOR_PLAN.md §5.4）。
 *
 * 全局视图：一眼看出「第 40–45 章连续高潮然后泄气」这类问题——这是单章的
 * 编辑器提示条看不出来的。告警规则仍只有 `pacingTracker.analyzePacing` 一份实现。
 */
export function PacingView({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReference, setShowReference] = useState(false);
  const [onlyWarned, setOnlyWarned] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(''); setChapters([]);
    getChapters(projectId)
      .then(list => { if (alive) setChapters(list); })
      .catch(() => { if (alive) setError('节奏标注读取失败，请重试'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  const atlas = useMemo(() => buildPacingAtlas(chapters, showReference), [chapters, showReference]);
  const byId = useMemo(() => new Map(chapters.map(c => [c.id, c])), [chapters]);

  if (loading) {
    return <p className="p-6 text-sm text-zinc-400">正在读取章节…</p>;
  }
  if (chapters.length === 0) {
    return <p className={`p-6 text-sm ${error ? 'text-red-600' : 'text-zinc-400'}`}>{error || '这本作品还没有章节。'}</p>;
  }

  const { totals, warnings, rows } = atlas;

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {error && <p className="text-red-600">{error}</p>}
      <Button size="sm" variant="outline" disabled={!showReference || saving} onClick={async () => {
        setSaving(true); setError('');
        try {
          const latest = await getChapters(projectId); setChapters(latest);
          const result = buildPacingAtlas(latest, true);
          await replaceIssues(projectId, 'pacing', latest, result.warnings.map(w => ({ chapterId: w.chapterId,
            type: w.type, problem: w.message, suggestion: '按作者叙事目标修改节奏标注或选择保留',
            location: '作者节奏与事件标注', severity: w.severity === 'error' ? 'high' : 'medium' })),
            '全书作者标注的连载参考；未标注章节不能据此判断正文节奏');
          toast.success('节奏复检结果已保存到问题台账');
        } catch { setError('复检或问题台账保存失败，请重试'); } finally { setSaving(false); }
      }}>复检标注并保存到问题台账</Button>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary" className="gap-1"><Activity className="h-3 w-3" />共 {totals.chapters} 章</Badge>
        <Badge variant="secondary">已标注 {totals.tagged} · 未标注 {totals.untagged}</Badge>
        <Badge variant="outline">慢 {totals.slow} · 中 {totals.medium} · 快 {totals.fast}</Badge>
        <Badge variant={showReference && totals.longestFastRun >= CONSECUTIVE_FAST_LIMIT ? 'warning' : 'secondary'}>
          最长连续快节奏 {totals.longestFastRun} 章
        </Badge>
        <Badge variant={totals.blocksWithoutSlow > 0 ? 'warning' : 'secondary'}>
          {SLOW_BLOCK_SIZE} 章块缺慢节奏 {totals.blocksWithoutSlow} 处
        </Badge>
        <Badge variant={totals.cooldownViolations > 0 ? 'warning' : 'secondary'}>
          同类密集参考 {totals.cooldownViolations} 处
        </Badge>
      </div>

      <label className="flex gap-2 text-xs text-zinc-500"><input type="checkbox" checked={showReference} onChange={e => setShowReference(e.target.checked)} />查看连载节奏参考（可选，不作为质量错误）</label>
      <section>
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">全书节奏横轴</h3>
          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-sky-400" />慢</span>
            <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-amber-400" />中</span>
            <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-rose-500" />快</span>
            <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-zinc-200 dark:bg-zinc-700" />未标注</span>
          </div>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          每根柱子是一章，悬停看节奏与冲突类型；点柱子跳到那一章。节奏与冲突类型目前需要作者在编辑器底部手选（
          <span className="text-zinc-500 dark:text-zinc-300">标注是手动的，AI 还没有替你判断</span>）。
        </p>
        <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1">
          {rows.map(row => (
            <Link
              key={row.id}
              to={workChapterPath(projectId, row.id)}
              title={`第${row.order}章 ${row.title}｜${row.pacingLabel}｜${row.conflictLabel}`}
              className="group flex w-6 shrink-0 flex-col items-center gap-1"
            >
              <span
                className={cn(
                  'w-full rounded-sm transition-all group-hover:opacity-80',
                  BAR_COLOR[row.intensity],
                )}
                style={{ height: `${12 + row.intensity * 9}px` }}
              />
              <span className="text-[9px] leading-none text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                {row.order}
              </span>
            </Link>
          ))}
        </div>
        {totals.untagged > 0 && (
          <p className="mt-2 text-[11px] text-zinc-400">
            未标注 {totals.untagged} 章：
            {atlas.untagged.slice(0, 12).map(r => (
              <Link key={r.id} to={workChapterPath(projectId, r.id)} className="ml-1 text-ink-600 hover:underline dark:text-ink-300">
                第{r.order}章
              </Link>
            ))}
            {totals.untagged > 12 && <span className="ml-1">…</span>}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            节奏告警（{warnings.length}）
          </h3>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <input type="checkbox" checked={onlyWarned} onChange={e => setOnlyWarned(e.target.checked)} />
            只看有告警的章
          </label>
        </div>
        {warnings.length === 0 ? (
          <p className="rounded-md border border-zinc-200 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {showReference ? `未命中连载参考阈值：连续 ≥${CONSECUTIVE_FAST_LIMIT} 章快节奏、每 ${SLOW_BLOCK_SIZE} 章块内无慢节奏、同类事件密集。` : '未启用连载参考；当前仅展示作者标注，不判断节奏是否正确。'}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {warnings
              .filter(w => !onlyWarned || byId.has(w.chapterId))
              .map((w, i) => (
                <li
                  key={`${w.chapterId}-${w.type}-${i}`}
                  className="flex items-start gap-2 rounded-md border border-zinc-200 p-2.5 text-xs dark:border-zinc-800"
                >
                  <AlertTriangle
                    className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', w.severity === 'error' ? 'text-rose-500' : 'text-amber-500')}
                  />
                  <span className="min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">
                    <Badge variant="outline" className="mr-1.5 align-middle text-[10px]">{WARNING_LABELS[w.type]}</Badge>
                    {w.message}
                  </span>
                  <Link
                    to={workChapterPath(projectId, w.chapterId)}
                    className="shrink-0 text-ink-600 hover:underline dark:text-ink-300"
                  >
                    第{byId.get(w.chapterId)?.order ?? '?'}章 →
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 p-3 text-[11px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <p className="flex items-center gap-1.5 font-medium text-zinc-600 dark:text-zinc-300">
          <Info className="h-3.5 w-3.5" />判断依据
        </p>
        <p className="mt-1">
          连载参考用于观察模式重复，作者可以选择保留。连续高潮、慢热、抒情和完整收束都可能符合创作意图：
          {Object.entries(CONFLICT_LABELS).map(([k, v]) => `${v} `).join('')}
          —— 横轴强度只反映<b>已标注</b>的节奏标签
          {Object.values(PACING_LABELS).join(' / ')}，未标注的章不计入强度。
        </p>
      </section>
    </div>
  );
}
