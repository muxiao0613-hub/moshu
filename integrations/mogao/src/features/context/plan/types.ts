/**
 * 上下文编译器 · 类型定义：分组 key、可编辑实体与 ContextItem / ContextPlan / 入参。
 *
 * 本文件是 ./plan 的内部实现，对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：@/shared/types、../contextPrefs（仅类型，无运行时依赖）。
 */
import type {
  AIContextInfo,
  Chapter,
  Character,
  FactLedger,
  Outline,
  PlotThread,
  Project,
  RagChunk,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';
import type { ContextPrefs } from '../contextPrefs';

export type ContextGroupKey =
  | 'bible'
  | 'facts'
  | 'recentContent'
  | 'outline'
  | 'characters'
  | 'threads'
  | 'world'
  | 'prevSummary'
  | 'fingerprint'
  | 'styleSamples'
  | 'voiceSamples'
  | 'rag';

export type EditableKind = 'character' | 'world' | 'thread' | 'fact';

export interface EditableField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
}

export interface ContextItemEntity {
  kind: EditableKind;
  id: string;
  fields: EditableField[];
}

export interface ContextItem {
  /** 稳定引用 id：character:<id> / world:<id> / thread:<id> / fact:<id> / rag:<chapterId> / group:<key> */
  id: string;
  group: ContextGroupKey;
  label: string;
  /** 实际会写进 prompt 的文本（按现有规则截断后） */
  text: string;
  /** 未截断的完整文本（对比「被砍掉了什么」、跳去完善台前先看原文） */
  full: string;
  tokens: number;
  fullTokens: number;
  /** 本次是否注入 */
  injected: boolean;
  /** 为什么注入 / 为什么没注入，直接展示给用户 */
  reason: string;
  pinned: boolean;
  /** 硬约束：不受 token 预算裁剪 */
  hard: boolean;
  /** 被截断时的说明（如「性格 120 → 80 字」） */
  clip?: string;
  entity?: ContextItemEntity;
}

export interface ContextPlanGroup {
  key: ContextGroupKey;
  title: string;
  kind: 'hard' | 'auto';
  /** 现有实现的条数上限；undefined = 不限 */
  limit?: number;
  /** 该组规则的来源说明（对应 aiService 的哪几行逻辑） */
  rule: string;
  items: ContextItem[];
  totalCount: number;
  injectedCount: number;
  injectedTokens: number;
}

export interface ContextPlan {
  groups: ContextPlanGroup[];
  items: ContextItem[];
  /** 真正会进入 prompt 的 token 估算 */
  injectedTokens: number;
  /** 所有候选条的 token 合计 */
  totalTokens: number;
  budget: number;
  overBudget: boolean;
  prefs: ContextPrefs;
  contextInfo: AIContextInfo;
  /** 供 prompt 拼装：仅包含已注入项的分组正文 */
  sections: Partial<Record<ContextGroupKey, string>>;
}

export interface ContextPlanInput {
  project: Project;
  chapter?: Chapter | null;
  /** 全量候选，筛选规则由本文件负责 */
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  /** 风格样本（作者原文片段，见 shared/lib/styleFingerprint.ts 的 styleSampleHint） */
  styleSamples?: string[] | null;
  ragChunks?: RagChunk[];
  prevChapterSummary?: string;
  prefs?: Partial<ContextPrefs> | null;
}
