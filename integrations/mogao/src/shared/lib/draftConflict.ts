/** 保存冲突数据与三方合并。与 server/common/merge-draft.ts 以行为测试校验相同口径。 */
export interface DraftConflict<T extends { id: string; content: string }> { remote: T; local: string }
export function conflictRemote<T extends { id: string; content: string }>(error: unknown): T | undefined {
  const data = (error as { response?: { data?: { code?: string; remote?: T; data?: { code?: string; remote?: T } } } })?.response?.data;
  const value = data?.data ?? data;
  return value?.code === 'DRAFT_CONFLICT' && typeof value.remote?.content === 'string' ? value.remote : undefined;
}
export function mergeDraft(base: string, local: string, remote: string): string | null {
  if (local === remote || remote === base) return local;
  if (local === base) return remote;
  const change = (next: string) => {
    let start = 0, end = base.length, tail = next.length;
    while (start < end && start < tail && base[start] === next[start]) start++;
    while (end > start && tail > start && base[end - 1] === next[tail - 1]) { end--; tail--; }
    return { start, end, text: next.slice(start, tail) };
  };
  const a = change(local), b = change(remote);
  if (a.start === b.start && a.end === b.end && a.text === b.text) return local;
  if (a.start === b.start || !(a.end <= b.start || b.end <= a.start)) return null;
  const [first, last] = a.start < b.start ? [a, b] : [b, a];
  return base.slice(0, first.start) + first.text + base.slice(first.end, last.start) + last.text + base.slice(last.end);
}
