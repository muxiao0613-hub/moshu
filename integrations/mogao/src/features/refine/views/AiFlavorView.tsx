import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Play, Sparkles, XCircle } from 'lucide-react';
import { getChapter, getChapters } from '@/api';
import { workChapterPath } from '@/shared/lib/workRoutes';
import { detectAntiAiPatterns, type IssueSeverity } from '@/shared/lib/antiAiDetector';
import { stripHtml } from '@/shared/lib/contentFormat';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { cn } from '@/shared/lib/utils';
import type { Chapter } from '@/shared/types';
import { filterAiFlavorRows, scanAiFlavor, type AiFlavorRow } from '../analysis';
import { replaceIssues } from '../issueApi';

const SEVERITY_VARIANT: Record<IssueSeverity, 'destructive' | 'warning' | 'secondary'> = {
  high: 'destructive',
  medium: 'warning',
  low: 'secondary',
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = { high: '重', medium: '中', low: '轻' };

function scoreVariant(score: number): 'destructive' | 'warning' | 'success' {
  if (score >= 60) return 'destructive';
  if (score >= 30) return 'warning';
  return 'success';
}

/**
 * 完善台 · AI 味体检（REFACTOR_PLAN.md §5.3）。
 *
 * 全书扫描：按 AI 味分数排序，最严重在前 —— 不再是单章手点。
 * 规则仍只有 `antiAiDetector` 一份实现（7 张规则表），这里只做聚合与排序。
 */
export function AiFlavorView({ projectId }: { projectId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [rows, setRows] = useState<AiFlavorRow[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minSeverity, setMinSeverity] = useState<IssueSeverity | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const cancelled = useRef(false);
  const runId = useRef(0);
  const scope = useRef(projectId); scope.current = projectId;
  useEffect(() => { setChapters([]); setRows(null); setProgress(null); return () => { cancelled.current = true; runId.current++; }; }, [projectId]);

  const loadChapters = useCallback(async () => {
    const list = await getChapters(projectId);
    if (scope.current === projectId) setChapters(list);
    return list;
  }, [projectId]);

  const scan = useCallback(async () => {
    const run = ++runId.current;
    cancelled.current = false;
    setProgress({ done: 0, total: 0, title: '读取章节' });
    setError(null);
    setRows(null);
    setExpanded(null);
    try {
      const list = await loadChapters();
      if (cancelled.current || scope.current !== projectId || runId.current !== run) return;
      if (list.length === 0) { setRows([]); return; }
      const withContent: Chapter[] = [];
      for (let i = 0; i < list.length; i++) {
        if (cancelled.current || scope.current !== projectId || runId.current !== run) return;
        setProgress({ done: i, total: list.length, title: list[i].title });
        const full = await getChapter(list[i].id, projectId);
        if (full) withContent.push(full);
      }
      if (cancelled.current || scope.current !== projectId || runId.current !== run) return;
      setChapters(withContent);
      setProgress({ done: list.length, total: list.length, title: '汇总中' });
      const result = scanAiFlavor(withContent);
      const scanned = withContent.filter(c => !result.rows.find(r => r.chapterId === c.id)?.skipped);
      await replaceIssues(projectId, 'ai-flavor', scanned, scanned.flatMap(c => detectAntiAiPatterns(stripHtml(c.content)).issues.map(i => ({
        chapterId: c.id, type: i.label, problem: `${i.label}：${i.count}处，${i.density}`, suggestion: i.suggestion,
        location: `全章规则统计，${i.count}处`, quote: i.examples.find(e => stripHtml(c.content).includes(e)), severity: i.severity,
      }))), `本地规则检查${result.totals.scanned}章全文，${result.totals.skipped}章正文不足阈值未参与；命中只作编辑参考`);
      if (!cancelled.current && scope.current === projectId && runId.current === run) setRows(result.rows);
    } catch {
      if (!cancelled.current && scope.current === projectId && runId.current === run) setError('扫描或问题台账保存失败，请重试。');
    } finally {
      if (scope.current === projectId && runId.current === run) setProgress(null);
    }
  }, [chapters, loadChapters, projectId]);

  const scanResult = useMemo(() => {
    if (!rows) return null;
    const byOrder = [...chapters].sort((a, b) => a.order - b.order);
    return { rows: filterAiFlavorRows(rows, minSeverity).sort((a, b) => b.score - a.score), all: rows, byOrder };
  }, [rows, minSeverity, chapters]);

  const totals = useMemo(() => {
    if (!rows) return null;
    const scanned = rows.filter(r => !r.skipped);
    const chars = scanned.reduce((s, r) => s + r.charCount, 0);
    return {
      chapters: rows.length,
      scanned: scanned.length,
      skipped: rows.length - scanned.length,
      high: scanned.reduce((s, r) => s + r.high, 0),
      medium: scanned.reduce((s, r) => s + r.medium, 0),
      low: scanned.reduce((s, r) => s + r.low, 0),
      bookScore: chars > 0 ? Math.round(scanned.reduce((s, r) => s + r.score * r.charCount, 0) / chars) : 0,
    };
  }, [rows]);

  const detailOf = (row: AiFlavorRow) => {
    const chapter = chapters.find(c => c.id === row.chapterId);
    if (!chapter?.content) return null;
    return detectAntiAiPatterns(stripHtml(chapter.content));
  };

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={scan} disabled={!!progress} className="gap-1.5">
          {progress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {rows ? '重新扫描全书' : '扫描全书'}
        </Button>
        {progress && (
          <>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              读取正文 {progress.done}/{progress.total} · {progress.title}
            </span>
            <button
              onClick={() => { cancelled.current = true; }}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <XCircle className="h-3.5 w-3.5" />取消
            </button>
          </>
        )}
        {rows && !progress && (
          <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            阈值
            <Select
              className="h-7 w-28 text-xs"
              value={minSeverity}
              onChange={e => setMinSeverity(e.target.value as IssueSeverity | 'all')}
            >
              <option value="all">全部命中</option>
              <option value="low">含轻度及以上</option>
              <option value="medium">中度及以上</option>
              <option value="high">只看重度</option>
            </Select>
          </label>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-400">
        扫描是<b>纯本地正则</b>（7 张规则表：震惊词 / 空洞副词 / 书面语入侵 / 套话心理 / 作文腔开头 / 三连排比 / 冗余填充），
        不消耗 token。问题与原文引用保存到作品台账。判定见 <code>shared/lib/antiAiDetector.ts</code>。
      </p>

      {error && <p className="rounded-md border border-rose-200 p-3 text-xs text-rose-600 dark:border-rose-900 dark:text-rose-300">{error}</p>}

      {!rows && !progress && (
        <p className="rounded-md border border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          还没有扫描结果。点「扫描全书」逐章读取正文并统计 AI 味。
        </p>
      )}

      {totals && scanResult && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={scoreVariant(totals.bookScore)} className="gap-1">
              <Sparkles className="h-3 w-3" />全书 AI 味 {totals.bookScore}（按字数加权）
            </Badge>
            <Badge variant="secondary">已扫 {totals.scanned}/{totals.chapters} 章</Badge>
            <Badge variant="destructive">重度 {totals.high}</Badge>
            <Badge variant="warning">中度 {totals.medium}</Badge>
            <Badge variant="secondary">轻度 {totals.low}</Badge>
            {totals.skipped > 0 && <Badge variant="outline">跳过 {totals.skipped} 章（无正文或过短）</Badge>}
          </div>

          {scanResult.rows.length === 0 ? (
            <p className="rounded-md border border-zinc-200 p-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              按当前阈值没有命中的章节。切到「全部命中」看看轻度问题。
            </p>
          ) : (
            <ul className="space-y-1.5">
              {scanResult.rows.map(row => (
                <li key={row.chapterId} className="rounded-md border border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-center gap-2 p-2.5">
                    <Badge variant={scoreVariant(row.score)} className="w-12 justify-center">{row.score}</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100">
                      第 {row.order} 章 · {row.title}
                    </span>
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400">
                      {row.topLabels.length > 0 ? row.topLabels.join(' / ') : '—'}
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {row.high > 0 && <b className="text-rose-500">{row.high}重</b>}
                      {row.medium > 0 && <span className="ml-1 text-amber-500">{row.medium}中</span>}
                      {row.low > 0 && <span className="ml-1">{row.low}轻</span>}
                    </span>
                    <button
                      onClick={() => setExpanded(expanded === row.chapterId ? null : row.chapterId)}
                      className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {expanded === row.chapterId ? '收起' : '详情'}
                    </button>
                    <Link
                      to={workChapterPath(projectId, row.chapterId)}
                      className="text-xs text-ink-600 hover:underline dark:text-ink-300"
                    >
                      去改 →
                    </Link>
                  </div>
                  {expanded === row.chapterId && (
                    <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
                      {(() => {
                        const report = detailOf(row);
                        if (!report) return <p className="text-xs text-zinc-400">这一章还没有正文。</p>;
                        return (
                          <ul className="space-y-2">
                            {report.issues.map(issue => (
                              <li key={issue.id} className="text-xs">
                                <div className="flex items-center gap-1.5">
                                  <Badge variant={SEVERITY_VARIANT[issue.severity]} className="text-[10px]">
                                    {SEVERITY_LABEL[issue.severity]}
                                  </Badge>
                                  <span className="text-zinc-700 dark:text-zinc-200">{issue.label}</span>
                                  <span className="text-zinc-400">{issue.count} 处 · {issue.density}</span>
                                </div>
                                {issue.examples.length > 0 && (
                                  <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                                    原文：{issue.examples.map((e, i) => (
                                      <code key={i} className="mr-1 rounded bg-zinc-100 px-1 dark:bg-zinc-800">{e}</code>
                                    ))}
                                  </p>
                                )}
                                <p className="mt-0.5 text-ink-600 dark:text-ink-300">建议：{issue.suggestion}</p>
                              </li>
                            ))}
                            <li className="text-[11px] text-zinc-400">{report.verdict}（共 {report.charCount} 字）</li>
                          </ul>
                        );
                      })()}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className={cn('text-[11px] leading-relaxed text-zinc-400')}>
            这里只做<b>定位与建议</b>，没有「一键替换」：规则给的是改写方向（例如「突然」要说清是什么动作），
            不是等价词表，机械替换会产出更生硬的句子。要动手改请到该章的「去 AI 味」精修或自己改。
          </p>
        </>
      )}
    </div>
  );
}
