/**
 * 共享类型 · 应用层类型（素材库、设置、AI 上下文与返回值、导出）—— 依赖 primitives 与 entities
 *
 * 单一出口是 ./index.ts（facade）；业务代码请继续从 '@/shared/types' 引入。
 * 模块依赖方向：primitives, entities。
 */
import type {
  Chapter, Character, Outline, PlotThread, Project, TimelineEvent, WorldSetting,
} from './entities';
import type { MaterialCategory } from './primitives';
import type { ChapterBeatCard, FactLedger, QualityReport, StoryBible, TopicCandidate } from './quality';

export interface Material {
  id: string;
  title: string;
  /** 用户的粗略灵感/草稿 */
  rawContent: string;
  /** AI 扩充后的完整素材 */
  expandedContent: string;
  category: MaterialCategory;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AppSettings {
  apiKey: string;
  model: string;
  autoSaveInterval: number;
  fontSize: number;
  lineHeight: number;
  theme: 'light' | 'dark';
  defaultWordCount: number;
}

export interface AIContextInfo {
  characters: string[];
  worldSettings: string[];
  outline: string | null;
  threads: string[];
  prevSummary: string | null;
}

export interface AIResult {
  content: string;
  contextInfo: AIContextInfo;
}

export interface MogaoExport {
  version: string;
  exportedAt: string;
  project: Project;
  chapters: Chapter[];
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  timeline: TimelineEvent[];
  topicCandidates?: TopicCandidate[];
  storyBible?: StoryBible | null;
  chapterBeatCards?: ChapterBeatCard[];
  factLedger?: FactLedger[];
  qualityReports?: QualityReport[];
  materials?: Material[];
}
