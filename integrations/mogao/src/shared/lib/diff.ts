/**
 * 字符级 diff，适合中文短文本（<2000字）。
 * 超出限制时降级为整体替换。
 */
export interface DiffToken {
  type: 'equal' | 'insert' | 'delete';
  value: string;
}

export function computeDiff(oldStr: string, newStr: string): DiffToken[] {
  // 对很长的文本直接返回整体替换，避免 O(m*n) 卡顿
  if (oldStr.length * newStr.length > 80_000) {
    return [
      { type: 'delete', value: oldStr },
      { type: 'insert', value: newStr },
    ];
  }

  const m = oldStr.length;
  const n = newStr.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldStr[i - 1] === newStr[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const tokens: DiffToken[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
      tokens.unshift({ type: 'equal', value: oldStr[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tokens.unshift({ type: 'insert', value: newStr[j - 1] });
      j--;
    } else {
      tokens.unshift({ type: 'delete', value: oldStr[i - 1] });
      i--;
    }
  }

  // 合并相邻同类 token
  return tokens.reduce<DiffToken[]>((acc, cur) => {
    if (acc.length && acc[acc.length - 1].type === cur.type) {
      acc[acc.length - 1].value += cur.value;
    } else {
      acc.push({ ...cur });
    }
    return acc;
  }, []);
}

/** 渲染 diff 为 JSX-ready 片段数组 */
export function diffStats(tokens: DiffToken[]) {
  const added = tokens.filter(t => t.type === 'insert').reduce((s, t) => s + t.value.length, 0);
  const removed = tokens.filter(t => t.type === 'delete').reduce((s, t) => s + t.value.length, 0);
  return { added, removed };
}
