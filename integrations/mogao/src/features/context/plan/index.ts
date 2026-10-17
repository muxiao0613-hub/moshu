/**
 * 上下文编译器 · 内部出口：把 ./plan 下的模块聚合成一份 API，供 ../contextPlan 门面重导出。
 *
 * 只做重导出，不含实现。依赖方向：build → groups → items/texts、budget → types（单向，无环）。
 */
export { buildContextPlan } from './build';
export { summarizePlan } from './groups';

export type {
  ContextGroupKey,
  EditableKind,
  EditableField,
  ContextItemEntity,
  ContextItem,
  ContextPlanGroup,
  ContextPlan,
  ContextPlanInput,
} from './types';
