import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ListChecks, Loader2, Play, XCircle } from 'lucide-react';
import {
  getChapter,
  getChapters,
  getCharacters,
  getFactLedger,
  getProject,
  getQualityReports,
  getStoryBible,
  getThreads,
  getWorldSettings,
  saveQualityReport,
} from '@/api';
import { workChapterPath } from '@/shared/lib/workRoutes';
import { reviewChapterQuality } from '@/features/quality/qualityService';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import type { Chapter } from '@/shared/types';
import {
  LOW_SCORE_THRESHOLD,
  RISK_THRESHOLD,
  summarizeQualityReports,
  type IssueGroup,
} from '../analysis';

type Range = 'all' | 'unreviewed' | 'draft' | 'failed';

/**
 * 完善台 · 批量体检（REFACTOR_PLAN.md §5.6）。
 *
 * 把「一章一章点评审」变成「一键扫全本」：选范围 → 逐章入队评审 → 汇总问题清单。
 * 评审走的是同一份 `reviewChapterQuality`（0-100 量表），报告落 `chapter.qualityReport`。
 */
export function BatchView({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [summary, setSummary] = useState<ReturnType<typeof summarizeQualityReports> | null>(null);
  const [range, setRange] = useState<Range>('unreviewed');
  const [progress, setProgress] = useState<{ done: number; total: number; title: string } | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const cancelled = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const [failures, setFailures] = useState<Array<{ id: string; title: string; message: string }>>([]);
  useEffect(() => () => { cancelled.current = true; abort.current?.abort(); }, []);

  const refresh = useCallback(async () => {
    const list = await getChapters(projectId);
    const reports = await getQualityReports(projectId);
    setChapters(list);
    setSummary(summarizeQualityReports(reports, list));
    setReportsLoaded(true);
  }, [projectId]);

  useEffect(() => { refresh().catch(() => setReportsLoaded(true)); }, [refresh]);

  const queue = useMemo(() => {
    if (range === 'failed') return failures.map(f => f.id);
    if (!summary) return [];
    if (range === 'unreviewed') return summary.unreviewed.map(c => c.id);
    if (range === 'draft') return chapters.filter(c => c.status === 'draft').map(c => c.id);
    return chapters.map(c => c.id);
  }, [summary, range, chapters, failures]);

  const runReview = async () => {
    if (abort.current) return;
    if (queue.length === 0) { toast.info('这个范围里没有需要评审的章节'); return; }
    const controller = new AbortController(); abort.current = controller;
    cancelled.current = false; setFailures([]); setProgress({ done: 0, total: queue.length, title: '读取依据' });
    try {
      const [project, characters, worldSettings, threads, storyBible, factLedger] = await Promise.all([
        getProject(projectId),
        getCharacters(projectId),
        getWorldSettings(projectId),
        getThreads(projectId),
        getStoryBible(projectId),
        getFactLedger(projectId),
      ]);
      if (!project) { toast.error('读不到作品信息'); return; }

      let ok = 0;
      for (let i = 0; i < queue.length; i++) {
        if (cancelled.current) break;
        const listItem = chapters.find(c => c.id === queue[i]);
        setProgress({ done: i, total: queue.length, title: listItem?.title || queue[i] });
        try {
          const chapter = await getChapter(queue[i], projectId);
          if (!chapter) throw new Error('来源章已删除');
          const report = await reviewChapterQuality({
            project, signal: controller.signal,
            chapter,
            beatCard: chapter.beatCard,
            storyBible,
            factLedger,
            characters,
            worldSettings,
            threads,
          });
          if (cancelled.current) break;
          await saveQualityReport({ ...report, projectId, chapterId: chapter.id });
          ok += 1;
        } catch (e) {
          if (cancelled.current) break;
          setFailures(items => [...items, { id: queue[i], title: listItem?.title || queue[i], message: e instanceof Error ? e.message : '评审失败' }]);
        }
      }
      setProgress(null);
      await refresh();
      toast.success(cancelled.current ? `已停止，完成 ${ok}/${queue.length} 章` : `评审完成 ${ok}/${queue.length} 章`);
    } catch {
      setProgress(null);
      if (!cancelled.current) toast.error('批量评审失败');
    } finally { setProgress(null); if (abort.current === controller) abort.current = null; }
  };

  const groups: IssueGroup[] = summary?.groups ?? [];

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          范围
          <select
            className="h-7 rounded border border-zinc-200 bg-white px-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            value={range}
            onChange={e => setRange(e.target.value as Range)}
            disabled={!!progress}
          >
            <option value="unreviewed">只评审未体检的章节</option>
            <option value="draft">只评审草稿章</option>
            <option value="failed">只重试失败的章节</option>
            <option value="all">全部章节（重跑）</option>
          </select>
        </div>
        <Button size="sm" onClick={runReview} disabled={!!progress || queue.length === 0} className="gap-1.5">
          {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          入队评审（{queue.length} 章）
        </Button>
        {progress && (
          <>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {progress.done}/{progress.total} · {progress.title}
            </span>
            <button
              onClick={() => { cancelled.current = true; abort.current?.abort(); }}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <XCircle className="h-3.5 w-3.5" />停止
            </button>
          </>
        )}
      </div>

      {!!failures.length && <div className="border border-amber-300 rounded-lg p-3 text-xs space-y-2"><b>{failures.length} 章评审失败；可选择「只重试失败的章节」</b>{failures.map(f => <p key={f.id}><Link className="text-ink-600" to={workChapterPath(projectId, f.id)}>{f.title}</Link>：{f.message}</p>)}</div>}
      <p className="text-[11px] leading-relaxed text-zinc-400">
        批量评审会逐章调用 AI（消耗 token），每章一份 8 维报告写回该章。
        低分线 {LOW_SCORE_THRESHOLD} 分、高风险线 {RISK_THRESHOLD} —— 改阈值请改 <code>analysis/review.ts</code> 的常量。
      </p>

      {!reportsLoaded && <p className="p-4 text-sm text-zinc-400">正在读取章节…</p>}

      {reportsLoaded && summary && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">共 {chapters.length} 章</Badge>
            <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />已体检 {summary.reviewed}</Badge>
            <Badge variant={summary.unreviewed.length > 0 ? 'warning' : 'secondary'}>未体检 {summary.unreviewed.length}</Badge>
            <Badge variant="secondary" className="gap-1"><ListChecks className="h-3 w-3" />问题 {summary.totalIssues} 条</Badge>
            <Badge variant={summary.lowScore.length > 0 ? 'destructive' : 'secondary'}>低分 {summary.lowScore.length}</Badge>
            <Badge variant={summary.highRisk.length > 0 ? 'destructive' : 'secondary'}>高风险 {summary.highRisk.length}</Badge>
          </div>

          {summary.totalIssues === 0 && summary.reviewed === 0 && (
            <p className="rounded-md border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              还没有任何体检报告。选好范围点「入队评审」，跑完这里就会出现全本问题清单。
            </p>
          )}

          {groups.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">问题清单（按类型分组）</h4>
              {groups.map(group => (
                <div key={group.type} className="rounded-md border border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => setExpandedGroup(expandedGroup === group.type ? null : group.type)}
                    className="flex w-full items-center gap-2 p-2.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="flex-1 text-zinc-800 dark:text-zinc-100">{group.type}</span>
                    <Badge variant="secondary">{group.count} 条</Badge>
                    <span className="text-xs text-zinc-400">{expandedGroup === group.type ? '收起' : '展开'}</span>
                  </button>
                  {expandedGroup === group.type && (
                    <ul className="divide-y divide-zinc-100 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                      {group.items.map((item, idx) => (
                        <li key={`${item.chapterId}-${idx}`} className="p-2.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 dark:text-zinc-400">第 {item.chapterOrder} 章 · {item.chapterTitle}</span>
                            {item.location && <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">{item.location}</code>}
                            <Link to={workChapterPath(projectId, item.chapterId)} className="ml-auto text-ink-600 hover:underline dark:text-ink-300">
                              去改 →
                            </Link>
                          </div>
                          {item.problem && <p className="mt-1 text-zinc-700 dark:text-zinc-200">{item.problem}</p>}
                          {item.suggestion && <p className="mt-0.5 text-ink-600 dark:text-ink-300">建议：{item.suggestion}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {(summary.lowScore.length > 0 || summary.highRisk.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {summary.lowScore.length > 0 && (
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />总评偏低
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {summary.lowScore.slice(0, 10).map(row => (
                      <li key={row.chapterId} className="flex items-center gap-2">
                        <Badge variant="destructive" className="w-10 justify-center">{row.totalScore}</Badge>
                        <Link to={workChapterPath(projectId, row.chapterId)} className="truncate text-zinc-700 hover:underline dark:text-zinc-200">
                          第 {row.order} 章 · {row.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {summary.highRisk.length > 0 && (
                <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />风险偏高（AI 味 / 一致性）
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs">
                    {summary.highRisk.slice(0, 10).map(row => (
                      <li key={row.chapterId} className="flex items-center gap-2">
                        <span className="text-zinc-400">AI {row.aiFlavorRisk} · 一致 {row.consistencyRisk}</span>
                        <Link to={workChapterPath(projectId, row.chapterId)} className="truncate text-zinc-700 hover:underline dark:text-zinc-200">
                          第 {row.order} 章 · {row.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-400">
            「批量修」暂不在这里做：可改可删是写作决定，批量让 AI 重写整章风险太大（见
            <code>fixChapterByIssues</code> 的整章重写问题）。目前请按上面的清单逐章跳到编辑器改。
          </p>
        </>
      )}
    </div>
  );
}
