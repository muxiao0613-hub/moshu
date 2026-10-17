/**
 * 共享类型 · 基础类型：篇幅/节奏/冲突等枚举、人物动态状态、检索索引、风格指纹 —— 不依赖其他模块
 *
 * 单一出口是 ./index.ts（facade）；业务代码请继续从 '@/shared/types' 引入。
 * 模块依赖方向：（无）。
 */

export type TargetPlatform = '番茄' | '七猫' | '起点' | '晋江' | '知乎盐选' | '小红书故事' | '自定义';

export type NovelLengthPresetId = 'short' | 'medium' | 'long' | 'epic';

// ================== 节奏管理 ==================
export type PacingTag = 'slow' | 'medium' | 'fast';

export type ConflictType = 'conflict' | 'reversal' | 'relationship' | 'worldbuilding' | 'tension' | 'none';

// ================== 人物动态状态 ==================
export interface CharacterStateEntry {
  chapterId: string;
  chapterTitle: string;
  summary: string;    // AI 提取的本章人物变化摘要
  savedAt: Date;
}

// ================== RAG 检索索引 ==================
export interface ChapterEmbedding {
  id: string;
  projectId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  indexedText: string;      // 用于索引的文本（摘要 + 内容节选）
  keywords: string[];       // 提取的关键词，用于快速关键词检索
  updatedAt: Date;
}

export interface RagChunk {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  excerpt: string;          // 相关段落节选（最多300字）
  score: number;            // 相关度得分
}

// ================== 风格指纹 ==================
export interface StyleFingerprint {
  avgSentenceLength: number;
  dialogueRatio: number;
  punctuationDensity: number;
  preferredPOV: '第一人称' | '第三人称' | '混合';
  topPhrases: string[];
  sampleChapterIds: string[];
  charCount: number;
  createdAt: Date;
}

/** 节拍卡里的单条节奏曲线数据点 */
export interface SceneBeat {
  scene: string;
  tension: string;
  pace: string;
  purpose: string;
}

export type FactType = 'character' | 'world' | 'plot' | 'relationship' | 'item' | 'ability';

export type StoryPlatform = '小红书故事' | '知乎盐选' | '公众号' | '纯文学' | '自由创作';

export type StoryGenre = '悬疑推理' | '情感' | '都市' | '科幻' | '恐怖' | '微小说' | '其他';

// 素材库（作者级，不属于单个项目）
export type MaterialCategory =
  | '角色设定' | '世界观' | '情节' | '对话'
  | '场景描写' | '主题' | '其他';
