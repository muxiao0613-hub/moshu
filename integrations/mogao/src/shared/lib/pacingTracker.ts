/**
 * 事件冷却矩阵 + 节奏跟踪器
 * 基于 novel-creator-skill 的节奏管理思路：
 * - 不同类型事件有冷却期，防止高潮堆砌
 * - 每5章必须有1章慢节奏缓冲
 * - 连续快节奏上限警告
 */

export type PacingTag = 'slow' | 'medium' | 'fast';

export type ConflictType =
  | 'conflict'       // 冲突/对抗
  | 'reversal'       // 反转/揭秘
  | 'relationship'   // 人物关系深化
  | 'worldbuilding'  // 世界观展开
  | 'tension'        // 张力升级
  | 'none';          // 普通推进

export interface ChapterPacingInfo {
  id: string;
  order: number;
  title: string;
  pacingTag?: PacingTag;
  conflictType?: ConflictType;
}

export interface PacingWarning {
  chapterId: string;
  type: 'cooldown_violation' | 'needs_slow' | 'consecutive_fast' | 'no_slow_in_block';
  severity: 'error' | 'warning';
  message: string;
}

// 冷却期规则（单位：章节数）
export const COOLDOWN_RULES: Record<ConflictType, number> = {
  conflict: 2,
  reversal: 2,
  relationship: 1,
  worldbuilding: 3,
  tension: 2,
  none: 0,
};

/** 连续快节奏的上限（超过就告警），`analyzePacing` 与完善台横轴共用。 */
export const CONSECUTIVE_FAST_LIMIT = 4;
/** 每多少章至少要有一章慢节奏缓冲。 */
export const SLOW_BLOCK_SIZE = 5;
/** 伏笔埋了这么多章仍未回收 → 列入「建议回收」（完善台 · 伏笔回收看板）。 */
export const SUGGEST_PAYOFF_AFTER = 20;
/** 埋了这么多章还没回收一律视为逾期，即使没写计划回收章。 */
export const OVERDUE_CHAPTERS = 35;

export const PACING_LABELS: Record<PacingTag, string> = {
  slow: '慢节奏',
  medium: '中节奏',
  fast: '快节奏',
};

export const PACING_COLORS: Record<PacingTag, string> = {
  slow: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  fast: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export const CONFLICT_LABELS: Record<ConflictType, string> = {
  conflict: '冲突',
  reversal: '反转',
  relationship: '关系',
  worldbuilding: '世界观',
  tension: '张力',
  none: '普通',
};

/**
 * 分析章节列表，返回节奏警告列表。
 * chapters 需按 order 升序排列。
 */
export function analyzePacing(chapters: ChapterPacingInfo[]): PacingWarning[] {
  const warnings: PacingWarning[] = [];
  const sorted = [...chapters].sort((a, b) => a.order - b.order);

  // 记录每种 conflictType 最近一次出现的章节序号
  const lastOccurrence: Partial<Record<ConflictType, number>> = {};

  // 连续 fast 计数
  let consecutiveFast = 0;

  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i];
    const pacing = ch.pacingTag;
    const conflict = ch.conflictType;

    if (!pacing) continue;

    // 连续快节奏检测
    if (pacing === 'fast') {
      consecutiveFast++;
      if (consecutiveFast >= CONSECUTIVE_FAST_LIMIT) {
        warnings.push({
          chapterId: ch.id,
          type: 'consecutive_fast',
          severity: 'warning',
          message: `第${ch.order}章已是连续第${consecutiveFast}章快节奏，建议插入1章慢节奏缓冲，避免读者审美疲劳。`,
        });
      }
    } else {
      consecutiveFast = 0;
    }

    // 冷却期检测
    if (conflict && conflict !== 'none') {
      const cooldown = COOLDOWN_RULES[conflict];
      const last = lastOccurrence[conflict];
      if (last !== undefined && ch.order - last <= cooldown) {
        warnings.push({
          chapterId: ch.id,
          type: 'cooldown_violation',
          severity: 'warning',
          message: `「${CONFLICT_LABELS[conflict]}」类事件冷却期为${cooldown}章，距上次（第${last}章）仅间隔${ch.order - last}章，可能导致节奏单调。`,
        });
      }
      lastOccurrence[conflict] = ch.order;
    }
  }

  // 每5章至少1章慢节奏检测（也检查不足5章的尾部块，只要全部已标记节奏）
  const BLOCK_SIZE = SLOW_BLOCK_SIZE;
  for (let start = 0; start < sorted.length; start += BLOCK_SIZE) {
    const block = sorted.slice(start, start + BLOCK_SIZE);
    if (block.length === 0) break;
    // 块内所有章节都已标记节奏才进行检测
    if (!block.every(ch => ch.pacingTag)) continue;
    const hasSlowInBlock = block.some(ch => ch.pacingTag === 'slow');
    if (!hasSlowInBlock) {
      const lastInBlock = block[block.length - 1];
      warnings.push({
        chapterId: lastInBlock.id,
        type: 'no_slow_in_block',
        severity: 'warning',
        message: `第${block[0].order}-${lastInBlock.order}章（共${block.length}章）无慢节奏，建议安排1章人物/世界观/情感内容作为缓冲。`,
      });
    }
  }

  return warnings;
}
