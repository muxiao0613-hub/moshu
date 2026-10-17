/**
 * 后端 → 前端的统一「时间字段」归一化。
 *
 * 后端通过 JSON 返回的是 ISO 字符串，而前端类型（Chapter / ChapterVersion / Project …）
 * 声明的是 `Date`；这里在进入类型系统前把 createdAt / updatedAt 转成 Date，
 * 避免每个调用点各自用无类型断言去 new Date。
 */

/** 只关心两个时间字段：其余字段原样透传，不做深拷贝（保持与旧实现一致的引用语义） */
interface TimestampFields {
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function normalize<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const rec = obj as TimestampFields;
  if (typeof rec.createdAt === 'string') rec.createdAt = new Date(rec.createdAt);
  if (typeof rec.updatedAt === 'string') rec.updatedAt = new Date(rec.updatedAt);
  return obj;
}

export function normalizeList<T>(list: T[]): T[] {
  return list.map(item => normalize(item));
}
