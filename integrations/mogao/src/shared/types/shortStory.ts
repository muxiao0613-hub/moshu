/**
 * 共享类型 · 短篇小说（独立于长篇：有平台/体裁/节拍点与自己的评审报告）—— 只依赖 primitives
 *
 * 单一出口是 ./index.ts（facade）；业务代码请继续从 '@/shared/types' 引入。
 * 模块依赖方向：primitives。
 */
import type { StoryGenre, StoryPlatform } from './primitives';

export interface StoryPlotPoint {
  id: string;
  label: string;   // e.g. "开局钩子"
  hint: string;    // 提示文字
  content: string; // 用户填写的情节内容
  order: number;
}

export interface ShortStoryVersion {
  id: string;
  content: string;
  savedAt: Date;
  note: string;
}

export interface ShortStoryQualityReport {
  sourceHash?: string; status?: 'current' | 'stale'; coverage?: string;
  hookScore: number;         // 开头钩子 0-100
  structureScore: number;    // 结构完整性
  emotionArcScore: number;   // 情绪弧
  endingScore: number;       // 结尾共鸣
  infoDensityScore: number;  // 信息密度
  totalScore: number;
  verdict: string;
  suggestions: string[];
  formatIssues: string[];    // 平台格式问题
}

export interface ShortStory {
  id: string;
  title: string;
  platform: StoryPlatform;
  genre: StoryGenre;
  targetWords: number;
  premise: string;           // 核心一句话
  content: string;           // 正文 HTML
  plotPoints: StoryPlotPoint[];
  styleConstraint: string;   // 风格/禁忌约束
  status: 'draft' | 'revised' | 'final';
  wordCount: number;
  qualityReport?: ShortStoryQualityReport;
  /** 是否已公开到作品广场（后端 short_stories.is_public / published_at） */
  isPublic?: boolean;
  publishedAt?: Date | null;
  versions: ShortStoryVersion[];
  createdAt: Date;
  updatedAt: Date;
}
