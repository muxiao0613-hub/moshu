/**
 * 完善台分析 · 批量体检：已存评审报告的分类汇总（分组问题 / 低分榜 / 高风险榜 / 未体检）
 *
 * 本文件是 ./analysis 的内部实现，对外统一由同目录的 index.ts（analysis 门面）导出。
 * 依赖方向：common, aiFlavor（纯函数，无副作用）。
 */
import { currentReport } from '@/shared/lib/chapterSources';
import type { QualityReport } from '@/shared/types';
import type { ChapterRef } from './common';

// ────────────────────────────── 批量体检 ──────────────────────────────

export interface IssueItem {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  type: string;
  location: string;
  problem: string;
  suggestion: string;
}

export interface IssueGroup {
  type: string;
  count: number;
  items: IssueItem[];
}

export interface BatchSummary {
  reviewed: number;
  unreviewed: ChapterRef[];
  /** 总评偏低的章节，按分数升序。 */
  lowScore: { chapterId: string; order: number; title: string; totalScore: number }[];
  /** 高风险章节（AI 味或一致性风险偏高）。 */
  highRisk: { chapterId: string; order: number; title: string; aiFlavorRisk: number; consistencyRisk: number }[];
  groups: IssueGroup[];
  totalIssues: number;
}

export const LOW_SCORE_THRESHOLD = 60;
export const RISK_THRESHOLD = 50;

/**
 * 汇总已存的评审报告（`chapter.qualityReport`）：
 * 按问题类型分组 + 低分章 + 高风险章 + 未评审章。这是「批量修」的输入清单。
 */
export function summarizeQualityReports(
  reports: QualityReport[],
  chapters: ChapterRef[],
  opts: { lowScoreThreshold?: number; riskThreshold?: number } = {},
): BatchSummary {
  reports = reports.filter(currentReport);
  const lowScoreThreshold = opts.lowScoreThreshold ?? LOW_SCORE_THRESHOLD;
  const riskThreshold = opts.riskThreshold ?? RISK_THRESHOLD;
  const byId = new Map(chapters.map(c => [c.id, c]));
  const reviewedIds = new Set(reports.map(r => r.chapterId));

  const items: IssueItem[] = [];
  for (const report of reports) {
    const chapter = byId.get(report.chapterId);
    for (const issue of report.issues || []) {
      items.push({
        chapterId: report.chapterId,
        chapterOrder: chapter?.order ?? 0,
        chapterTitle: chapter?.title ?? '（已删除章节）',
        type: (issue.type || '未分类').trim() || '未分类',
        location: issue.location || '',
        problem: issue.problem || '',
        suggestion: issue.suggestion || '',
      });
    }
  }

  const grouped = new Map<string, IssueItem[]>();
  for (const item of items) {
    const list = grouped.get(item.type);
    if (list) list.push(item);
    else grouped.set(item.type, [item]);
  }

  const groups: IssueGroup[] = [...grouped.entries()]
    .map(([type, list]) => ({
      type,
      count: list.length,
      items: list.sort((a, b) => a.chapterOrder - b.chapterOrder),
    }))
    .sort((a, b) => b.count - a.count);

  const rowOf = (report: QualityReport) => ({
    chapterId: report.chapterId,
    order: byId.get(report.chapterId)?.order ?? 0,
    title: byId.get(report.chapterId)?.title ?? '（已删除章节）',
  });

  return {
    reviewed: reports.length,
    unreviewed: chapters.filter(c => !reviewedIds.has(c.id)).sort((a, b) => a.order - b.order),
    lowScore: reports
      .filter(r => r.totalScore < lowScoreThreshold)
      .map(r => ({ ...rowOf(r), totalScore: r.totalScore }))
      .sort((a, b) => a.totalScore - b.totalScore),
    highRisk: reports
      .filter(r => r.aiFlavorRisk >= riskThreshold || r.consistencyRisk >= riskThreshold)
      .map(r => ({ ...rowOf(r), aiFlavorRisk: r.aiFlavorRisk, consistencyRisk: r.consistencyRisk }))
      .sort((a, b) => Math.max(b.aiFlavorRisk, b.consistencyRisk) - Math.max(a.aiFlavorRisk, a.consistencyRisk)),
    groups,
    totalIssues: items.length,
  };
}
