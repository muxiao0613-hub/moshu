/**
 * 上下文编译器 · 编排入口：解析偏好 → 建过滤上下文 → 装配分组 → 预算裁剪 → 统计与 sections。
 *
 * 本文件只做顺序编排，不含任何条目口径；对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：./types、./groups、./budget、../contextPrefs。
 */
import { resolvePrefs } from '../contextPrefs';
import type { ContextGroupKey, ContextPlan, ContextPlanInput } from './types';
import type { PlanScope } from './items';
import { applyBudget } from './budget';
import { buildContextInfo, buildGroups, buildSections } from './groups';

export function buildContextPlan(input: ContextPlanInput): ContextPlan {
  const prefs = resolvePrefs(input.prefs);
  const chapterId = input.chapter?.id;

  const scope: PlanScope = {
    /** 该条是否被用户关掉 / 标记为「本章无关」 */
    blockedBy: (id: string, group: ContextGroupKey): string | null => {
      if (prefs.off.includes(id) || prefs.off.includes(`group:${group}`)) return '已关闭（本次不注入）';
      const perChapter = chapterId ? prefs.excludedByChapter[chapterId] ?? [] : [];
      if (perChapter.includes(id) || perChapter.includes(`group:${group}`)) return '已标记为本章无关';
      return null;
    },
    isPinned: (id: string, group: ContextGroupKey) =>
      prefs.pinned.includes(id) || prefs.pinned.includes(`group:${group}`),
  };

  const { groups, chapterOutline, threadCandidates } = buildGroups(input, scope);
  const budget = prefs.tokenBudget;
  const allItems = groups.flatMap(g => g.items);
  const overBudget = applyBudget(groups, budget);
  const prevChapterSummary = input.prevChapterSummary ?? '';

  return {
    groups,
    items: allItems,
    injectedTokens: allItems.filter(i => i.injected).reduce((s, i) => s + i.tokens, 0),
    totalTokens: allItems.reduce((s, i) => s + i.tokens, 0),
    budget,
    overBudget,
    prefs,
    contextInfo: buildContextInfo(groups, chapterOutline, threadCandidates, prevChapterSummary),
    sections: buildSections(groups),
  };
}
