/**
 * 完善台的标签清单（纯数据，不依赖 React）。
 *
 * 单独放一个文件是为了让**路由映射**（`shared/lib/workRoutes.ts`）与
 * **页面本身**（`RefinePage.tsx`）引用同一份清单：旧链接（`/clinic/:tab`、`/advanced/:section`）
 * 与「去完善台改」链接都靠它判断目标标签是否存在，避免拼出一个不存在的 tab
 * 而静默回落到默认页（这类静默失效正是重构第 0 批要根除的问题）。
 */

/** 设定组：写这本书之前要定下来的东西（含章节列表这类结构管理）。 */
export const REFINE_SETUP_TABS = ['characters', 'world', 'outline', 'threads', 'chapters', 'bible', 'facts', 'radar', 'beat'] as const;
/** 体检组：写完之后要回去改的地方。 */
export const REFINE_CHECKUP_TABS = ['issues', 'conflicts', 'ai-flavor', 'pacing', 'review', 'batch'] as const;
export const REFINE_TABS = [...REFINE_SETUP_TABS, ...REFINE_CHECKUP_TABS] as const;
export type RefineTab = (typeof REFINE_TABS)[number];

export function isRefineTab(value: string | undefined): value is RefineTab {
  return !!value && (REFINE_TABS as readonly string[]).includes(value);
}
