/**
 * 上下文编译器 · 预算裁剪：按 DROP_ORDER 依次放弃软约束条目，并回写各组的注入统计。
 *
 * 为什么单独一个文件：淘汰顺序是「用户看得见的取舍」（抽屉里那条"超出预算"的理由就来自
 * 这里），改顺序等于改行为，必须集中在一处，不能被条目构建逻辑淹没。
 *
 * 本文件是 ./plan 的内部实现，对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：./types（纯函数，只改动传入的 groups 对象）。
 */
import type { ContextGroupKey, ContextPlanGroup } from './types';

/** 各组在预算不足时的淘汰顺序（数字大 = 先被放弃），硬约束组不参与 */
export const DROP_ORDER: Partial<Record<ContextGroupKey, number>> = {
  rag: 8,
  styleSamples: 7,
  voiceSamples: 6,
  fingerprint: 5,
  prevSummary: 4,
  world: 3,
  threads: 2,
  characters: 1,
};

/**
 * 硬约束与固定项先计入，其余按淘汰顺序放；返回是否真的砍掉过东西（overBudget）。
 * 副作用：把未入选条目的 `injected` / `reason` 改掉，并重算每组的注入条数与 token。
 */
export function applyBudget(groups: ContextPlanGroup[], budget: number): boolean {
  let used = groups
    .flatMap(g => g.items)
    .filter(i => i.injected && i.hard)
    .reduce((s, i) => s + i.tokens, 0);
  let overBudget = false;

  const softGroups = groups
    .filter(g => g.kind === 'auto')
    .slice()
    .sort((a, b) => (DROP_ORDER[a.key] ?? 9) - (DROP_ORDER[b.key] ?? 9));

  if (budget > 0) {
    for (const g of softGroups) {
      for (const item of g.items) {
        if (!item.injected || item.hard) continue;
        if (used + item.tokens <= budget) {
          used += item.tokens;
        } else {
          item.injected = false;
          item.reason = `超出上下文预算 ${budget} tokens（本次约需 ${used + item.tokens}）`;
          overBudget = true;
        }
      }
    }
  }
  if (budget === 0) overBudget = false;

  // 重新统计（预算可能把某些条拿掉了）
  for (const g of groups) {
    const injected = g.items.filter(i => i.injected);
    g.injectedCount = injected.length;
    g.injectedTokens = injected.reduce((s, i) => s + i.tokens, 0);
  }

  return overBudget;
}
