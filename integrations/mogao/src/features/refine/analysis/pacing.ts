/**
 * 完善台分析 · 节奏曲线：逐章强度、全局统计与告警（复用 pacingTracker.analyzePacing 的规则）
 *
 * 本文件是 ./analysis 的内部实现，对外统一由同目录的 index.ts（analysis 门面）导出。
 * 依赖方向：common（纯函数，无副作用）。
 */
import {
  CONFLICT_LABELS,
  PACING_LABELS,
  analyzePacing,
  type ChapterPacingInfo,
  type ConflictType,
  type PacingTag,
  type PacingWarning,
} from '@/shared/lib/pacingTracker';
import type { ChapterRef } from './common';

// ────────────────────────────── 节奏曲线 ──────────────────────────────

export interface PacingRow {
  id: string;
  order: number;
  title: string;
  pacingTag: PacingTag | null;
  conflictType: ConflictType | null;
  /** 1 慢 / 2 中 / 3 快，未标注为 0 —— 横轴色块的强度。 */
  intensity: 0 | 1 | 2 | 3;
  pacingLabel: string;
  conflictLabel: string;
}

export interface PacingTotals {
  chapters: number;
  tagged: number;
  untagged: number;
  slow: number;
  medium: number;
  fast: number;
  /** 最长的连续快节奏段长度（告警阈值是 4）。 */
  longestFastRun: number;
  blocksWithoutSlow: number;
  cooldownViolations: number;
  consecutiveFastWarnings: number;
}

export interface PacingAtlas {
  rows: PacingRow[];
  warnings: PacingWarning[];
  totals: PacingTotals;
  untagged: PacingRow[];
}

const INTENSITY: Record<PacingTag, 1 | 2 | 3> = { slow: 1, medium: 2, fast: 3 };

export function buildPacingAtlas(chapters: ChapterRef[], showReference = false): PacingAtlas {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const rows: PacingRow[] = sorted.map(ch => ({
    id: ch.id,
    order: ch.order,
    title: ch.title,
    pacingTag: ch.pacingTag ?? null,
    conflictType: ch.conflictType ?? null,
    intensity: ch.pacingTag ? INTENSITY[ch.pacingTag] : 0,
    pacingLabel: ch.pacingTag ? PACING_LABELS[ch.pacingTag] : '未标注',
    conflictLabel: ch.conflictType ? CONFLICT_LABELS[ch.conflictType] : '—',
  }));

  // 告警规则只有一份实现（pacingTracker），这里不重复写一遍。
  const warnings = showReference ? analyzePacing(
    sorted.map<ChapterPacingInfo>(ch => ({
      id: ch.id,
      order: ch.order,
      title: ch.title,
      pacingTag: ch.pacingTag,
      conflictType: ch.conflictType,
    })),
  ) : [];

  let longestFastRun = 0;
  let run = 0;
  for (const r of rows) {
    if (r.pacingTag === 'fast') {
      run += 1;
      longestFastRun = Math.max(longestFastRun, run);
    } else {
      run = 0;
    }
  }

  const totals: PacingTotals = {
    chapters: rows.length,
    tagged: rows.filter(r => r.pacingTag).length,
    untagged: rows.filter(r => !r.pacingTag).length,
    slow: rows.filter(r => r.pacingTag === 'slow').length,
    medium: rows.filter(r => r.pacingTag === 'medium').length,
    fast: rows.filter(r => r.pacingTag === 'fast').length,
    longestFastRun,
    blocksWithoutSlow: warnings.filter(w => w.type === 'no_slow_in_block').length,
    cooldownViolations: warnings.filter(w => w.type === 'cooldown_violation').length,
    consecutiveFastWarnings: warnings.filter(w => w.type === 'consecutive_fast').length,
  };

  return { rows, warnings, totals, untagged: rows.filter(r => !r.pacingTag) };
}

// ────────────────────────────── 伏笔回收 ──────────────────────────────
