/**
 * 短篇写作台 · 纯函数工具：内核补强约束合并、终审稿可接受性判断、标题与核心兜底。
 *
 * 在拆分中的位置：workspace/* 的最底层工具，被 useStoryEditor / useStoryGeneration 使用；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 @/api 的 countWords、../shortStoryService 的成篇判断与短篇模板配置，不依赖 hooks 与视图组件。
 */
import { countWords } from '@/api';
import { isStoryTextComplete } from '@/features/short-story/shortStoryService';
import { PLATFORM_CONFIGS } from '@/features/short-story/shortStoryTemplates';
import type { ShortStory } from '@/shared/types';

export function mergeEnhancementConstraint(base?: string, enhancedPremise?: string, enhancedStyle?: string): string {
  const parts: string[] = [];
  const push = (value?: string) => {
    const v = (value || '').trim();
    if (v && !parts.includes(v)) parts.push(v);
  };
  push(base);
  if ((enhancedPremise || '').trim()) {
    push(`AI 补强故事内核（仅作展开参考，必须服从左侧"核心一句话"，不得换题、换人物、换冲突）：${enhancedPremise!.trim()}`);
  }
  if ((enhancedStyle || '').trim()) {
    push(`AI 写作约束：${enhancedStyle!.trim()}`);
  }
  return parts.join('\n');
}

export function isAcceptableFinalDraft(text: string, originalWords: number): boolean {
  const words = countWords(text);
  if (words < Math.max(350, Math.floor(originalWords * 0.72))) return false;
  if (words > 700 && !isStoryTextComplete(text)) return false;
  return true;
}

/** AI 标题失败时的兜底：从正文首句提取一个不超过 16 字的标题 */
export function fallbackTitle(content: string): string {
  const plain = content.replace(/<[^>]*>/g, '').replace(/\s+/g, '').trim();
  if (!plain) return '无标题故事';
  // 取首个句子片段
  const seg = plain.split(/[。！？!?…，,；;]/).find(s => s.trim().length >= 2) || plain;
  const t = seg.trim().slice(0, 16);
  return t || '无标题故事';
}

export function getFallbackPremise(s: ShortStory) {
  const platformTone = PLATFORM_CONFIGS[s.platform]?.tone || '完整、有钩子、有余韵';
  return `一个${s.genre}短篇：主角在一天之内遇到一个无法回避的异常事件，必须在关系、秘密或利益之间做出选择；故事要符合${s.platform}的阅读期待，做到${platformTone}，结尾回收前文细节并留下余韵。`;
}
