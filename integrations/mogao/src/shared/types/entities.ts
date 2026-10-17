import type { RevisionIssue } from './revisionIssue';
import type { CharacterLifeMemory } from './characterMemory';
/**
 * 共享类型 · 核心业务实体（作品、人物、世界观、大纲、伏笔、时间线、章节）—— 依赖 primitives 与 quality
 *
 * 单一出口是 ./index.ts（facade）；业务代码请继续从 '@/shared/types' 引入。
 * 模块依赖方向：primitives, quality。
 */
import type {
  CharacterStateEntry, ConflictType, NovelLengthPresetId, PacingTag, StyleFingerprint,
  TargetPlatform,
} from './primitives';
import type { ChapterBeatCard, ChapterContinuity, FactLedger, QualityReport, StoryBible, TopicCandidate } from './quality';

export interface Project {
  id: string;
  title: string;
  genre: string;
  synopsis: string;
  /** 目标平台与创作方向，旧项目可以为空 */
  targetPlatform?: TargetPlatform;
  /** 篇幅模板：短篇/中篇/长篇/超长篇，用于一键生成推荐参数 */
  novelLengthPreset?: NovelLengthPresetId;
  targetWordCount?: number;
  targetReader?: string;
  qualityGoal?: string;
  recommendedVolumes?: number;
  recommendedChaptersPerVolume?: number;
  recommendedChapterWordCount?: number;
  recommendedCharacterCount?: number;
  /** 风格指纹：从样本章节提取，用于约束 AI 生成风格 */
  styleFingerprint?: StyleFingerprint;
  /**
   * 风格样本：2–3 段作者自己的原文（REFACTOR_PLAN.md §6.3「风格样本库」）。
   * 与 styleFingerprint 互补：指纹是抽象数字（句均 18 字），样本是可以直接模仿的语感。
   * 两者都会进生成提示词，样本排在指纹之后（更接近原文，权重更直接）。
   */
  styleSamples?: string[];
  /**
   * 故事圣经。后端把它存在 projects 表的 JSON 字段里（没有独立表），
   * 因此这里必须声明出来：否则每个读取点都要靠无类型断言，字段改名不会被发现。
   * 旧数据可能是 `{ content: '...' }` 富文本壳，读取处需做兼容（见 features/quality/api.ts）。
   */
  storyBible?: StoryBible | null;
  /** 事实账本，同样存放在 projects 表的 JSON 字段里 */
  factLedger?: FactLedger[] | null;
  /** 选题候选（质量中枢的选题雷达），同样存放在 projects 表 */
  topicCandidates?: TopicCandidate[] | null;
  revisionIssues?: RevisionIssue[] | null;
  /** 是否已公开到作品广场（后端 projects.is_public / published_at） */
  isPublic?: boolean;
  publishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CharacterRelation {
  characterId: string;
  relation: string;
}

export interface CharacterProfileEvidence {
  id: string;
  sourceLabel: string;
  kind: 'chapter' | 'roleplay' | 'paste';
  sourceChapterIds: string[];
  sourceExcerpt: string;
  fields: Record<string, string>;
  confirmedAt: string;
}

export interface CharacterProfileVersion {
  id: string; effectiveOrder: number; createdAt: string; label: string; sourceChapterId?: string;
  fields: Partial<Omit<Character, 'profileVersions' | 'lifeMemories' | 'stateHistory' | 'id' | 'projectId'>>;
  changes?: CharacterProfileVersion['fields'];
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  aliases: string[];
  role: 'protagonist' | 'antagonist' | 'supporting' | 'minor';
  /** 自由文本：允许「十七八岁」「不明」这类写法 */
  age?: string;
  gender?: string;
  appearance: string;
  personality: string;
  background: string;
  abilities: string;
  /** 想要什么：动机比性格更能预测行为，一起进写作 prompt */
  goals?: string;
  relationships: CharacterRelation[];
  arc: string;
  firstAppearance: string;
  notes: string;
  /** 章节经历缓存；正文修订后失效，作者确认后用于对话和写作。 */
  lifeMemories?: CharacterLifeMemory[];
  /** 旧版状态历史保留供参考，不视为已核验经历。 */
  stateHistory?: CharacterStateEntry[];
  /**
   * 语气样本：作者确认过的该角色对话片段（每段 ≤300 字，见 shared/lib/voiceSample.ts）。
   *
   * 与 `personality` 互补：性格是抽象形容词，样本是「他到底怎么说话」的语感证据。
   * 生成章节时只在这个角色上场的情况下注入（最多 3 人），见 features/context 的 voiceSamples 组。
   */
  voiceSamples?: string[];
  /** 作者确认的人设补充及其来源；候选聊天不直接成为小说事实。 */
  profileEvidence?: CharacterProfileEvidence[];
  profileVersions?: CharacterProfileVersion[];
  /** 仅用于保存请求：这次修改从第几章生效。0 表示全书底色修订。 */
  profileEffectiveOrder?: number;
}

export interface WorldSetting {
  id: string;
  projectId: string;
  category: string;
  title: string;
  content: string;
  tags: string[];
}

export interface Outline {
  id: string;
  projectId: string;
  title: string;
  type: 'volume' | 'arc' | 'chapter';
  parentId: string | null;
  order: number;
  summary: string;
  keyEvents: string[];
  characters: string[];
  chapterId?: string;
}

export interface PlotThread {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: 'planted' | 'developing' | 'resolved' | 'abandoned';
  plantedAt: string;
  resolvedAt?: string;
  relatedChapters: string[];
  relatedCharacters: string[];
  importance: 'critical' | 'major' | 'minor';
  notes: string;
}

export interface TimelineEvent {
  id: string;
  projectId: string;
  title: string;
  description: string;
  date: string;
  realDate?: string;
  order: number; // 用于严格排序的数值字段
  characters: string[];
  chapterId?: string;
  line: string;
  type: 'event' | 'flashback' | 'foreshadow';
}

export interface ChapterVersion {
  id: string;
  chapterId: string;
  content?: string;
  note: string;
  createdAt: Date;
}

export interface Chapter {
  id: string;
  projectId: string;
  title: string;
  order: number;
  volumeId?: string;
  content: string;
  wordCount: number;
  status: 'draft' | 'revised' | 'final';
  summary: string;
  /** 基于已保存正文的实际承接摘要，区别于规划 summary。 */
  continuity?: ChapterContinuity;
  /** 节奏标签：标注本章叙事节奏 */
  pacingTag?: PacingTag;
  /** 冲突类型：标注本章主要事件类型 */
  conflictType?: ConflictType;
  createdAt: Date;
  updatedAt: Date;
  /** 节拍卡（含场景规划），存于本章的 JSON 字段 */
  beatCard?: ChapterBeatCard;
  /** 质量评审报告，存于本章的 JSON 字段 */
  qualityReport?: QualityReport;
}
