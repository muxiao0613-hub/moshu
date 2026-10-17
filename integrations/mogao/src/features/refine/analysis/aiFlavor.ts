/**
 * 完善台分析 · AI 味体检：逐章扫描、只看严重筛选与全书加权分
 *
 * 本文件是 ./analysis 的内部实现，对外统一由同目录的 index.ts（analysis 门面）导出。
 * 依赖方向：common（纯函数，无副作用）。
 */
import { detectAntiAiPatterns, type IssueSeverity } from '@/shared/lib/antiAiDetector';
import { stripHtml } from '@/shared/lib/contentFormat';
import type { ChapterRef } from './common';

export const SEVERITY_RANK: Record<IssueSeverity, number> = { low: 1, medium: 2, high: 3 };

export interface AiFlavorRow {
  chapterId: string;
  order: number;
  title: string;
  charCount: number;
  /** 加权前的单章 AI 味分（0-100，越高越重）。 */
  score: number;
  verdict: string;
  high: number;
  medium: number;
  low: number;
  topLabels: string[];
  /** 未生成或过短，未参与统计。 */
  skipped: boolean;
}

export interface AiFlavorScan {
  rows: AiFlavorRow[];
  /** 按字数加权的全书分：短章不该跟 3000 字章等权。 */
  bookScore: number;
  totals: {
    chapters: number;
    scanned: number;
    skipped: number;
    chars: number;
    high: number;
    medium: number;
    low: number;
  };
  worst: AiFlavorRow[];
}

/** 低于这个字数视为「没正文」，不参与 AI 味统计。 */
export const MIN_AI_FLAVOR_CHARS = 200;

export function scanAiFlavor(chapters: ChapterRef[]): AiFlavorScan {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const rows: AiFlavorRow[] = sorted.map(ch => {
    const text = stripHtml(ch.content || '');
    if (text.length < MIN_AI_FLAVOR_CHARS) {
      return {
        chapterId: ch.id, order: ch.order, title: ch.title, charCount: text.length,
        score: 0, verdict: `正文不足 ${MIN_AI_FLAVOR_CHARS} 字，未参与统计`, high: 0, medium: 0, low: 0, topLabels: [], skipped: true,
      };
    }
    const report = detectAntiAiPatterns(text);
    const high = report.issues.filter(i => i.severity === 'high').length;
    const medium = report.issues.filter(i => i.severity === 'medium').length;
    const low = report.issues.filter(i => i.severity === 'low').length;
    const topLabels = [...report.issues]
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count)
      .slice(0, 3)
      .map(i => i.label);
    return {
      chapterId: ch.id, order: ch.order, title: ch.title, charCount: text.length,
      score: report.totalScore, verdict: report.verdict, high, medium, low, topLabels, skipped: false,
    };
  });

  const scanned = rows.filter(r => !r.skipped);
  const chars = scanned.reduce((sum, r) => sum + r.charCount, 0);
  const weighted = scanned.reduce((sum, r) => sum + r.score * r.charCount, 0);
  const totals = {
    chapters: rows.length,
    scanned: scanned.length,
    skipped: rows.length - scanned.length,
    chars,
    high: scanned.reduce((s, r) => s + r.high, 0),
    medium: scanned.reduce((s, r) => s + r.medium, 0),
    low: scanned.reduce((s, r) => s + r.low, 0),
  };

  return {
    rows,
    bookScore: chars > 0 ? Math.round(weighted / chars) : 0,
    totals,
    worst: [...scanned].sort((a, b) => b.score - a.score || b.charCount - a.charCount).slice(0, 5),
  };
}

/** 按严重度阈值筛选（视图上的「只看严重」开关）：高中低任一档达到阈值即保留。 */
export function filterAiFlavorRows(rows: AiFlavorRow[], minSeverity: IssueSeverity | 'all'): AiFlavorRow[] {
  if (minSeverity === 'all') return rows;
  if (minSeverity === 'high') return rows.filter(r => r.high > 0);
  if (minSeverity === 'medium') return rows.filter(r => r.high > 0 || r.medium > 0);
  return rows.filter(r => r.high > 0 || r.medium > 0 || r.low > 0);
}
