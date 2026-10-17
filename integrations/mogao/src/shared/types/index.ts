/**
 * 共享类型统一出口（facade）。
 *
 * 实现在同目录的 5 个模块里按领域拆分，本文件只做重导出 ——
 * 业务代码继续写 `import type { Chapter } from '@/shared/types'`，拆分对调用点零影响。
 * 依赖方向：primitives ← quality ← entities ← app，shortStory → primitives（无环）。
 */
export type {
  ChapterEmbedding, CharacterStateEntry, ConflictType, FactType, MaterialCategory,
  NovelLengthPresetId, PacingTag, RagChunk, SceneBeat, StoryGenre, StoryPlatform,
  StyleFingerprint, TargetPlatform,
} from './primitives';
export type {
  ChapterBeatCard, ChapterContinuity, FactLedger, QualityIssue, QualityReport, SceneCard, StoryBible, TopicCandidate,
} from './quality';
export type {
  Chapter, ChapterVersion, Character, CharacterRelation, Outline, PlotThread, Project,
  TimelineEvent, WorldSetting,
} from './entities';
export type { ShortStory, ShortStoryQualityReport, ShortStoryVersion, StoryPlotPoint } from './shortStory';
export type { AIContextInfo, AIResult, AppSettings, Material, MogaoExport } from './app';

export type { CharacterLifeMemory, CharacterMemoryClaim, CharacterMemoryKind, CharacterProfileField, CharacterProfileChange, CharacterSyncPreferences } from './characterMemory';
