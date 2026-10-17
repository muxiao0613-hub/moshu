/**
 * 上下文偏好 —— 上下文抽屉里「开关 / 固定 / 排除 / 预算 / 档位」的持久化。
 *
 * 存储位置：本机 localStorage，按作品隔离（`mogao_context_prefs:<projectId>`）。
 * 说明：目前是「本机偏好」，换设备不会同步 —— 与 `REWRITE_PLAN.md` 里
 * ContextCompiler 的 `GET /chapters/:cid/context` 落地后，这里会换成
 * 服务端字段（届时 UI 不变，只换读写实现）。
 *
 * 这份偏好是**真的生效**的：`buildContextPlan()` 与生成链路读的是同一份数据。
 */
import { useSyncExternalStore } from 'react';

/** 生成档位：替代裸温度滑块（见 REFACTOR_PLAN §4.4 底部） */
export type GenerationTier = 'steady' | 'normal' | 'bold';

export const TIER_TEMPERATURE: Record<GenerationTier, number> = {
  steady: 0.6,
  normal: 0.85,
  bold: 1.05,
};

export const TIER_LABEL: Record<GenerationTier, string> = {
  steady: '稳',
  normal: '常规',
  bold: '放',
};

export const TIER_HINT: Record<GenerationTier, string> = {
  steady: 'temperature 0.6 · 措辞保守、更贴设定，适合需要严丝合缝的章节',
  normal: 'temperature 0.85 · 默认档，兼顾稳定性与可读性',
  bold: 'temperature 1.05 · 用词更放开、情节更容易出意外，适合转折章',
};

export interface ContextPrefs {
  /** 本次生成不注入（作品级，随时可恢复） */
  off: string[];
  /** 固定：升级为硬约束，永不因条数上限或 token 预算被裁剪 */
  pinned: string[];
  /** 按章排除：明确「本章无关」，切章不互相影响 */
  excludedByChapter: Record<string, string[]>;
  /** 上下文 token 上限；0 表示不限制（仅按条数/字数截断） */
  tokenBudget: number;
  /** 生成档位 */
  tier: GenerationTier;
}

export const DEFAULT_TOKEN_BUDGET = 12000;

export const DEFAULT_PREFS: ContextPrefs = {
  off: [],
  pinned: [],
  excludedByChapter: {},
  tokenBudget: DEFAULT_TOKEN_BUDGET,
  tier: 'normal',
};

const STORAGE_KEY = (projectId: string) => `mogao_context_prefs:${projectId}`;

/** 全局兜底预算（设置页可改），未在作品偏好里覆盖时使用 */
const BUDGET_KEY = 'mogao_context_token_budget';

function readGlobalBudget(): number {
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    if (raw === null) return DEFAULT_TOKEN_BUDGET;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TOKEN_BUDGET;
  } catch {
    return DEFAULT_TOKEN_BUDGET;
  }
}

export function saveGlobalBudget(budget: number): void {
  try {
    localStorage.setItem(BUDGET_KEY, String(budget));
  } catch {
    /* 忽略：隐私模式下写不进去时保持内存值即可 */
  }
  emit();
}

export function loadGlobalBudget(): number {
  return readGlobalBudget();
}

/** 归一化：任何来源的数据都要能安全参与运算 */
export function resolvePrefs(prefs?: Partial<ContextPrefs> | null): ContextPrefs {
  return {
    off: Array.isArray(prefs?.off) ? prefs!.off.filter(Boolean) : [],
    pinned: Array.isArray(prefs?.pinned) ? prefs!.pinned.filter(Boolean) : [],
    excludedByChapter:
      prefs?.excludedByChapter && typeof prefs.excludedByChapter === 'object'
        ? prefs!.excludedByChapter
        : {},
    tokenBudget:
      typeof prefs?.tokenBudget === 'number' && prefs!.tokenBudget >= 0
        ? prefs!.tokenBudget
        : readGlobalBudget(),
    tier: prefs?.tier === 'steady' || prefs?.tier === 'bold' ? prefs.tier : 'normal',
  };
}

/* ---------------- 读写 + 跨组件同步 ---------------- */

const listeners = new Set<() => void>();
let snapshotCache = new Map<string, ContextPrefs>();

function emit(): void {
  snapshotCache = new Map();
  listeners.forEach(l => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 同步读取（生成链路直接用这个，保证拿到的是最新值） */
export function loadContextPrefs(projectId: string): ContextPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    if (!raw) return resolvePrefs(null);
    return resolvePrefs(JSON.parse(raw) as Partial<ContextPrefs>);
  } catch {
    return resolvePrefs(null);
  }
}

function getSnapshot(projectId: string): ContextPrefs {
  const cached = snapshotCache.get(projectId);
  if (cached) return cached;
  const next = loadContextPrefs(projectId);
  snapshotCache.set(projectId, next);
  return next;
}

export function saveContextPrefs(projectId: string, prefs: ContextPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(prefs));
  } catch {
    /* 忽略 */
  }
  emit();
}

export function updateContextPrefs(
  projectId: string,
  updater: (prev: ContextPrefs) => ContextPrefs
): ContextPrefs {
  const next = updater(loadContextPrefs(projectId));
  saveContextPrefs(projectId, next);
  return next;
}

/** 组件里用这个：抽屉与生成链路共享同一份偏好 */
export function useContextPrefs(projectId: string): ContextPrefs {
  return useSyncExternalStore(
    subscribe,
    () => getSnapshot(projectId),
    () => DEFAULT_PREFS
  );
}

/* ---------------- 条目开关的小工具 ---------------- */

export function isOff(prefs: ContextPrefs, id: string): boolean {
  return prefs.off.includes(id);
}

export function isPinned(prefs: ContextPrefs, id: string): boolean {
  return prefs.pinned.includes(id);
}

export function isExcluded(prefs: ContextPrefs, chapterId: string | undefined, id: string): boolean {
  if (!chapterId) return false;
  return (prefs.excludedByChapter[chapterId] ?? []).includes(id);
}

export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

export function clearOff(projectId: string): void {
  updateContextPrefs(projectId, p => ({ ...p, off: [] }));
}

export function clearExcludedForChapter(projectId: string, chapterId: string): void {
  updateContextPrefs(projectId, p => {
    const next = { ...p.excludedByChapter };
    delete next[chapterId];
    return { ...p, excludedByChapter: next };
  });
}
