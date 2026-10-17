/**
 * AI 批量生成 · 步骤状态与容器 props 的类型底座。
 *
 * 位置：./batch 的最底层，steps.tsx（步骤清单）、useBatchGenerate.ts（编排）、
 * 各展示组件与 run*（取数）都从这里取类型。
 * 依赖方向：react（类型）→ @/shared/types；不引用本目录任何模块，因此不会产生环。
 */
import type { ReactNode } from 'react';

import type { Chapter, ChapterBeatCard, SceneCard } from '@/shared/types';

export type StepKey = 'characters' | 'world' | 'outlines' | 'threads' | 'timeline' | 'chapters';
export type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

export interface StepState {
  status: StepStatus;
  rawText: string;
  error?: string;
  /** 各步骤产出形状不同（草稿数组 / 章节结果），保存与预览时按步骤 key 收窄，故用 unknown[] */
  data?: unknown[];
  selected: Set<number>;
  saved: boolean;
}

export interface StepMeta {
  key: StepKey;
  icon: ReactNode;
  label: string;
  desc: string;
}

/** 批量生成一章的产出：章节 + 正文（保存与预览共用同一形状） */
export interface ChapterBatchItem {
  chapter: Chapter;
  content: string;
}

/** 逐场景生成回传的落库材料：场景卡 + 节拍卡，随章正文一起保存 */
export interface PendingScenes {
  scenes: SceneCard[];
  beat: ChapterBeatCard | null;
}

export interface AIBatchGenerateProps {
  projectId: string;
  onClose: () => void;
}
