/**
 * 完善台的分析层（REFACTOR_PLAN.md §5）—— 对外唯一出口。
 *
 * 六个视图共用同一份章节数据，跨章判断全部落在本目录下的**纯函数**模块里，
 * 组件只负责渲染，因此「第 40–45 章连续高潮然后泄气」「这条伏笔埋了 30 章没人管」
 * 这类结论可以被回归测试盯住，而不是散落在组件的 render 里。
 *
 * - ./pacing.ts    节奏曲线（复用 pacingTracker 的告警规则，只补全局统计）
 * - ./threads.ts   伏笔回收（三态机 + 该回收判定）
 * - ./aiFlavor.ts  AI 味体检（逐章扫描 + 全书加权分）
 * - ./review.ts    批量体检（评审报告汇总成可行动清单）
 * - ./common.ts    章节引用的最小形状 ChapterRef
 *
 * 业务代码（features/refine/views/*）继续从本文件引入，不必关心内部拆分。
 */

export { buildPacingAtlas } from './pacing';
export { THREAD_HORIZON, THREAD_STAGES, threadStage, threadStatus, parseChapterOrder, buildThreadBoard } from './threads';
export { SEVERITY_RANK, MIN_AI_FLAVOR_CHARS, scanAiFlavor, filterAiFlavorRows } from './aiFlavor';
export { LOW_SCORE_THRESHOLD, RISK_THRESHOLD, summarizeQualityReports } from './review';

export type { ChapterRef } from './common';
export type { PacingRow, PacingTotals, PacingAtlas } from './pacing';
export type { ThreadStage, ThreadStageInfo, ThreadPosition, ThreadRow, ThreadBoard } from './threads';
export type { AiFlavorRow, AiFlavorScan } from './aiFlavor';
export type { IssueItem, IssueGroup, BatchSummary } from './review';
