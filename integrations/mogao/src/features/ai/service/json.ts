/**
 * AI 服务 · 模型输出里 JSON 数组的容错解析（流式截断、尾逗号、markdown 包裹）
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：（无：纯函数）（只允许上层业务模块 → 底层模块，不产生环）。
 */

// ---------- JSON 解析 ----------

/** 正确追踪字符串边界的括号深度扫描，返回匹配的闭合位置（-1 表示未找到） */
function findJsonEnd(s: string, start: number): number {
  const openChar = s[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 截断修复：对未闭合的 JSON 数组，提取所有已完整生成的元素。
 * 比直接报错更友好——哪怕 AI 只生成了一半也能拿到结果。
 */
function extractCompleteArrayItems(s: string): string {
  // s 以 '[' 开头
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastCompleteEnd = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 1) lastCompleteEnd = i; // 一个顶层元素刚闭合
      else if (depth === 0) return s.slice(0, i + 1); // 整个数组完整
    }
  }

  // 截断：只保留已完整生成的元素
  if (lastCompleteEnd > 0) {
    return s.slice(0, lastCompleteEnd + 1).trimEnd().replace(/,\s*$/, '') + ']';
  }
  return '[]';
}

export function parseJsonFromAI<T>(text: string): T {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = s.search(/[\[{]/);
  if (start === -1) throw new Error('响应中未找到有效 JSON，请重试');

  const isArray = s[start] === '[';
  const end = findJsonEnd(s, start);

  let raw: string;
  if (end !== -1) {
    raw = s.slice(start, end + 1);
  } else if (isArray) {
    // 数组被截断：尝试提取已完整生成的元素
    raw = extractCompleteArrayItems(s.slice(start));
    if (raw === '[]') throw new Error('JSON 格式不完整，请重试');
  } else {
    throw new Error('JSON 格式不完整，请重试');
  }

  const tryParse = (input: string) => JSON.parse(input) as T;
  const repair = (input: string) => input
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/}\s*{/g, '},{')
    .replace(/]\s*\[/g, '],[');

  try { return tryParse(raw); } catch { /* fall through */ }
  try { return tryParse(repair(raw)); } catch { /* fall through */ }
  throw new Error('JSON 格式不完整，请重试');
}
