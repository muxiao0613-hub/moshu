/**
 * 上下文编译器 —— **注入规则的唯一实现**。
 *
 * 为什么要有这个文件：在此之前「喂给 AI 的上下文」这套规则只存在于
 * `features/ai/aiService.ts` 内部（matchRelevantCharacters → slice(0,6) →
 * trunc(personality,80) …），UI 想展示只能抄一份，抄完就会和真实注入漂移，
 * 于是出现「面板写着注入了 6 个人物、实际注入了别的」这类**静默失真**。
 *
 * 现在：生成链路（`buildChapterSystemPrompt`）与右栏上下文抽屉
 * （`ContextDrawer`）都调用 `buildContextPlan()`，看与用的规则天然一致。
 *
 * 与 `REWRITE_PLAN.md` 的关系：这里就是 ContextCompiler 的 UI 层落地，
 * 第 1 / 第 2 批阶段先在前端拼装，等 `GET /chapters/:cid/context` 就绪后
 * 换成真接口，**调用方不动**。规则本身与旧实现逐字对齐（有回归测试兜底）。
 *
 * 实现已按职责拆到 ./plan（本文件是对外门面，调用点无需改动）：
 * - plan/types.ts    ContextItem / ContextPlanGroup / ContextPlan / 入参等全部类型
 * - plan/texts.ts    条目文本的渲染与截断口径（性格 80 / 能力 60 …）
 * - plan/items.ts    条目构建：开关 / 固定 / 条数上限的统一收口（pickItems）
 * - plan/budget.ts   DROP_ORDER 与预算裁剪
 * - plan/groups.ts   候选筛选、分组装配、sections 与 contextInfo、summarizePlan
 * - plan/build.ts    buildContextPlan 的顺序编排
 */

export { buildContextPlan, summarizePlan } from './plan';

export type {
  ContextGroupKey,
  EditableKind,
  EditableField,
  ContextItemEntity,
  ContextItem,
  ContextPlanGroup,
  ContextPlan,
  ContextPlanInput,
} from './plan';
