/**
 * 完善台分析 · 伏笔回收看板：三态机、章节号解析与「该回收」判定
 *
 * 本文件是 ./analysis 的内部实现，对外统一由同目录的 index.ts（analysis 门面）导出。
 * 依赖方向：common（纯函数，无副作用）。
 */
import { OVERDUE_CHAPTERS, SUGGEST_PAYOFF_AFTER } from '@/shared/lib/pacingTracker';
import type { PlotThread } from '@/shared/types';
import type { ChapterRef } from './common';

export const THREAD_HORIZON = 4;
export type ThreadStage = 'planted' | 'reinforced' | 'resolved' | 'abandoned';

export interface ThreadStageInfo {
  stage: ThreadStage;
  label: string;
  /** 三态机里这一步的含义，直接展示给作者，避免「已埋设 / 发展中」两套说法的歧义。 */
  hint: string;
  /** 下一步应该做什么。 */
  next: string;
}

export const THREAD_STAGES: Record<ThreadStage, ThreadStageInfo> = {
  planted: { stage: 'planted', label: '已埋', hint: '埋下了，但还没有再触碰', next: '安排一次「已强化」' },
  reinforced: { stage: 'reinforced', label: '已强化', hint: '中途已再次提到或加强', next: '安排「已回收」兑现' },
  resolved: { stage: 'resolved', label: '已回收', hint: '已经兑现', next: '—' },
  abandoned: { stage: 'abandoned', label: '已废弃', hint: '决定不再回收', next: '—' },
};

/** 旧的自由文本状态 → 三态机。 */
export function threadStage(status: PlotThread['status']): ThreadStage {
  if (status === 'developing') return 'reinforced';
  if (status === 'resolved') return 'resolved';
  if (status === 'abandoned') return 'abandoned';
  return 'planted';
}

/** 三态机 → 落库的 status 字段（保持向后兼容，不加新列）。 */
export function threadStatus(stage: ThreadStage): PlotThread['status'] {
  if (stage === 'reinforced') return 'developing';
  return stage;
}

export interface ThreadPosition {
  order: number;
  kind: 'plant' | 'reinforce' | 'payoff';
}

export interface ThreadRow {
  id: string;
  title: string;
  description: string;
  importance: PlotThread['importance'];
  stage: ThreadStage;
  stageLabel: string;
  plantedOrder: number | null;
  reinforcedOrders: number[];
  resolvedOrder: number | null;
  plannedOrder: number | null;
  /** 埋设至今已过多少章（用全书最新章节序计）。 */
  elapsed: number | null;
  overdue: boolean;
  positions: ThreadPosition[];
  needPayoff: boolean;
  /** 为什么上榜（或为什么不上榜），直接给作者看。 */
  reason: string;
}

export interface ThreadBoard {
  rows: ThreadRow[];
  /** 三态里还没回收、且埋得够久的伏笔，按重要度与时长排序。 */
  needsPayoff: ThreadRow[];
  overdue: ThreadRow[];
  horizon: { from: number; to: number } | null;
  maxOrder: number;
}

const CN_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

function cnNumber(token: string): number | null {
  if (token === '十') return 10;
  const tenIndex = token.indexOf('十');
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : CN_DIGITS[token[0]];
    const onesToken = token.slice(tenIndex + 1);
    const ones = onesToken ? CN_DIGITS[onesToken[0]] ?? 0 : 0;
    if (!tens) return null;
    return tens * 10 + ones;
  }
  return CN_DIGITS[token] ?? null;
}

/**
 * 从自由文本里解析章序：「第 37 章」「37」「第三十七章」都能认。
 *
 * 旧实现是「把 plantedAt 里的数字抠出来跟全库最大值比大小」——日期字符串会被误判成章序。
 * 这里只认「N章」与纯数字，认不出就返回 null，交给调用方用别的依据（relatedChapters）兜底。
 */
export function parseChapterOrder(text?: string | null): number | null {
  if (!text) return null;
  const s = String(text).trim();
  if (!s) return null;
  const arabic = s.match(/(\d{1,4})\s*章/) || s.match(/^(\d{1,4})$/);
  if (arabic) return Number(arabic[1]);
  const cn = s.match(/([一二三四五六七八九十]{1,3})\s*章/);
  if (cn) return cnNumber(cn[1]);
  return null;
}

/**
 * 从 notes/description 里读出作者写的「打算在第 N 章回收」。
 *
 * 自然写法有三种，都要认：
 * - 「计划第 40 章回收」/「预计 12 章内收束」
 * - 「第 40 章回收」/「第 40 章揭晓」
 * - 「预计第 45 章揭晓」（数字在前、动作词在后 —— 旧实现漏掉的就是这种）
 */
function plannedPayoffOrder(t: PlotThread): number | null {
  const text = `${t.notes || ''} ${t.description || ''}`;
  const patterns: RegExp[] = [
    /计划[^。；;\n]{0,20}?第?\s*(\d{1,4})\s*章/,
    /(?:回收|兑现|揭晓|收线)[^。；;\n]{0,12}?第?\s*(\d{1,4})\s*章/,
    /第\s*(\d{1,4})\s*章[^。；;\n]{0,10}?(?:回收|兑现|揭晓|收线)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

const IMPORTANCE_RANK: Record<PlotThread['importance'], number> = { critical: 3, major: 2, minor: 1 };

export function buildThreadBoard(
  threads: PlotThread[],
  chapters: ChapterRef[],
  opts: { suggestAfter?: number; horizonSize?: number } = {},
): ThreadBoard {
  const suggestAfter = opts.suggestAfter ?? SUGGEST_PAYOFF_AFTER;
  const horizonSize = opts.horizonSize ?? THREAD_HORIZON;
  const orderById = new Map(chapters.map(c => [c.id, c.order]));
  const maxOrder = chapters.reduce((max, c) => Math.max(max, c.order), 0);

  const rows: ThreadRow[] = threads.map(t => {
    const stage = threadStage(t.status);
    const reinforcedOrders = (t.relatedChapters || [])
      .map(id => orderById.get(id))
      .filter((o): o is number => typeof o === 'number')
      .sort((a, b) => a - b);

    const plantedOrder =
      parseChapterOrder(t.plantedAt) ??
      (reinforcedOrders.length ? reinforcedOrders[0] : null);
    const resolvedOrder =
      parseChapterOrder(t.resolvedAt) ?? (stage === 'resolved' ? reinforcedOrders[reinforcedOrders.length - 1] ?? null : null);
    const plannedOrder = plannedPayoffOrder(t);
    const elapsed = plantedOrder != null && maxOrder >= plantedOrder ? maxOrder - plantedOrder : null;

    const positions: ThreadPosition[] = [];
    if (plantedOrder != null) positions.push({ order: plantedOrder, kind: 'plant' });
    for (const order of reinforcedOrders) {
      if (order === plantedOrder || order === resolvedOrder) continue;
      positions.push({ order, kind: 'reinforce' });
    }
    if (resolvedOrder != null) positions.push({ order: resolvedOrder, kind: 'payoff' });
    positions.sort((a, b) => a.order - b.order);

    const overdue = stage === 'planted' || stage === 'reinforced'
      ? (plannedOrder != null && maxOrder > plannedOrder) ||
        (elapsed != null && elapsed >= OVERDUE_CHAPTERS)
      : false;

    const unresolved = stage === 'planted' || stage === 'reinforced';
    const needPayoff =
      unresolved && t.importance !== 'minor' && (overdue || (elapsed != null && elapsed >= suggestAfter));

    let reason: string;
    if (!unresolved) {
      reason = stage === 'resolved' ? '已回收' : '已废弃';
    } else if (t.importance === 'minor') {
      reason = '次要伏笔，不催';
    } else if (needPayoff) {
      reason = overdue
        ? `已过计划回收点${plannedOrder ? `（计划第 ${plannedOrder} 章）` : ''}，已过 ${elapsed ?? '?'} 章`
        : `已埋 ${elapsed ?? '?'} 章未回收`;
    } else {
      reason = `还能再放 ${Math.max(0, suggestAfter - (elapsed ?? 0))} 章`;
    }

    return {
      id: t.id,
      title: t.title,
      description: t.description,
      importance: t.importance,
      stage,
      stageLabel: THREAD_STAGES[stage].label,
      plantedOrder,
      reinforcedOrders,
      resolvedOrder,
      plannedOrder,
      elapsed,
      overdue,
      positions,
      needPayoff,
      reason,
    };
  });

  const needsPayoff = rows
    .filter(r => r.needPayoff)
    .sort((a, b) => {
      const byImportance = IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance];
      if (byImportance !== 0) return byImportance;
      return (b.elapsed ?? 0) - (a.elapsed ?? 0);
    });

  return {
    rows,
    needsPayoff,
    overdue: rows.filter(r => r.overdue),
    horizon: maxOrder > 0 ? { from: maxOrder + 1, to: maxOrder + horizonSize } : null,
    maxOrder,
  };
}

// ────────────────────────────── AI 味体检 ──────────────────────────────
