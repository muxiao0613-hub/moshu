/**
 * AI 服务 · 章级质检结果类型（供 score / fix / fullChapter 共用的最小结构）。
 *
 * 位置：./chapter（chapter.ts 拆分目录）的类型底座，对外仍由 @/features/ai/aiService 统一出口。
 * 依赖方向：无内部依赖，仅描述 AI 返回的 JSON 结构（字段全可选，解析失败时返回 null）。
 */

/** 质检返回的单条问题（字段缺失由 AI 输出决定，故全部可选） */
export interface ChapterQcIssue {
  rule?: string;
  segment?: string;
  reason?: string;
  fix?: string;
}

/** 质检返回的整体结论：是否达标、分数与问题清单 */
export interface ChapterQcResult {
  pass?: boolean;
  score?: number;
  issues?: ChapterQcIssue[];
}
