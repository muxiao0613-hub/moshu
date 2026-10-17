/**
 * 短篇生成 · 纯文本工具：截断、正文清洗、成篇判断、JSON 解析、目标字数区间
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：无同级依赖（最低层），任何同级模块都可以依赖它，它不反向依赖任何人。
 */
import type { ShortStory } from '@/shared/types';

export function trunc(s: string, max = 200) {
  return s && s.length > max ? s.slice(0, max) + '…' : (s || '');
}

export function cleanStoryText(text: string) {
  return text
    .replace(/^```(?:text|txt|markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\s*(?:正文|故事正文|以下是正文|以下为正文)[:：]\s*/i, '')
    .trim();
}

export function looksLikeCompleteStory(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (!/[。！？!?…」』"）)]$/.test(t)) return false;
  const leftQuotes = (t.match(/[「『"]/g) || []).length;
  const rightQuotes = (t.match(/[」』"]/g) || []).length;
  if (Math.abs(leftQuotes - rightQuotes) > 1) return false;
  return true;
}


export function isStoryTextComplete(text: string): boolean {
  return looksLikeCompleteStory(cleanStoryText(text));
}

export function getTargetWordBand(story: ShortStory) {
  const min = Math.max(600, Math.round(story.targetWords * 0.82));
  const ideal = story.targetWords;
  const max = Math.round(story.targetWords * 1.18);
  return { min, ideal, max };
}

export function parseJsonFromAI<T>(text: string): T {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = s.search(/[\[{]/);
  if (start === -1) throw new Error('AI 未返回有效 JSON');
  const openChar = s[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0, inStr = false, escaped = false, end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inStr) { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) { depth--; if (depth === 0) { end = i; break; } }
  }
  const raw = end !== -1 ? s.slice(start, end + 1) : s.slice(start);
  return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')) as T;
}
