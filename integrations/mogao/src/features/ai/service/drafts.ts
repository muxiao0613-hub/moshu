/**
 * AI 服务 · 批量生成用的草稿数据结构（人物 / 世界观 / 大纲 / 伏笔 / 时间线）
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：（无：纯类型）（只允许上层业务模块 → 底层模块，不产生环）。
 */
import type { Character, Outline, PlotThread, TimelineEvent } from '@/shared/types';

// ---------- 批量生成草稿类型 ----------

export type CharacterDraft = {
  name: string; role: Character['role'];
  appearance: string; personality: string;
  background: string; abilities: string;
  arc: string; aliases?: string[];
  relationships?: { characterName: string; relation: string }[];
};
export type WorldDraft = { category: string; title: string; content: string; tags: string[] };
export type OutlineDraft = {
  title: string; type: Outline['type'];
  summary: string; keyEvents: string[];
  children?: OutlineDraft[];
};
export type ThreadDraft = {
  title: string; description: string;
  importance: PlotThread['importance'];
  status: PlotThread['status'];
  plantedAt: string; notes: string;
};
export type TimelineDraft = {
  title: string; description: string;
  date: string; line: string;
  type: TimelineEvent['type'];
};
