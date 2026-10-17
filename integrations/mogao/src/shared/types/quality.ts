/**
 * 共享类型 · 质量中枢相关类型（选题、故事圣经、场景卡、事实账本、评审报告）—— 只依赖 primitives
 *
 * 单一出口是 ./index.ts（facade）；业务代码请继续从 '@/shared/types' 引入。
 * 模块依赖方向：primitives。
 */
import type { FactType, SceneBeat } from './primitives';

export interface TopicCandidate {
  selected?: boolean;
  id: string;
  projectId: string;
  title: string;
  oneLineHook: string;
  platformFit: string[];
  protagonist: string;
  goldenFinger: string;
  mainConflict: string;
  coolPoints: string[];
  firstThreeChapters: string[];
  longTermArc: string;
  innovation: string;
  risk: string;
  score: number;
  createdAt: Date;
}

export interface StoryBible {
  id: string;
  projectId: string;
  coreHook: string;
  targetReader: string;
  protagonistDesire: string;
  mainConflict: string;
  powerRules: string[];
  hardRules: string[];
  tone: string;
  taboo: string[];
  updatedAt: Date;
}

/**
 * 场景卡：章节正文的生成单位。
 * 由节拍卡的 beats 展开而来（见 features/ai/scenePlan.ts），
 * text 为逐场景生成后回填的该场正文，未生成为空。
 */
export interface SceneCard extends SceneBeat {
  /** 场次序号，从 1 开始 */
  index: number;
  /** 该场目标字数（按 pace/tension 加权分配本章目标字数） */
  wordBudget: number;
  /** 该场已生成的正文，未生成时为空 */
  text?: string;
}

export interface ChapterBeatCard {
  sourceHash?: string;
  status?: 'current' | 'stale';
  id: string;
  projectId: string;
  chapterId: string;
  goal: string;
  conflict: string;
  coolPoint: string;
  emotionPoint: string;
  reversal: string;
  hookEnding: string;
  characterChange: string;
  foreshadowing: string[];
  payoff: string[];
  mustInclude: string[];
  mustAvoid: string[];
  /** 节奏曲线（同时就是场景划分） */
  beats?: SceneBeat[];
  /** 逐场景生成后的场景卡（含每场正文） */
  scenes?: SceneCard[];
  updatedAt: Date;
}

export interface FactLedger {
  sourceHash?: string;
  sourceChapterOrder?: number;
  quote?: string;
  status?: 'pending' | 'confirmed' | 'stale';
  id: string;
  projectId: string;
  type: FactType;
  subject: string;
  fact: string;
  sourceChapterId: string;
  importance: 'critical' | 'major' | 'minor';
  locked: boolean;
  createdAt: Date;
}

export interface QualityIssue {
  type: string;
  location: string;
  problem: string;
  suggestion: string;
}

export interface QualityReport {
  basisHash?: string;
  sourceHash?: string;
  status?: 'current' | 'stale';
  coverage?: string;
  id: string;
  projectId: string;
  chapterId: string;
  totalScore: number;
  hookScore: number;
  conflictScore: number;
  pacingScore: number;
  coolPointScore: number;
  characterScore: number;
  originalityScore: number;
  aiFlavorRisk: number;
  consistencyRisk: number;
  shortVerdict: string;
  strengths: string[];
  issues: QualityIssue[];
  createdAt: Date;
}

export interface ChapterContinuity {
  sourceHash: string;
  text: string;
  updatedAt: string;
  status: 'current' | 'stale';
}
