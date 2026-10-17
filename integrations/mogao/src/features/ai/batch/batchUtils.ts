/**
 * AI 批量生成 · 纯函数工具（无 React、无副作用）。
 *
 * 位置：./batch 的最底层，供 runEntityBatch（续写上下文）与 saveStep（大纲展开）复用；
 * 对外由 AIBatchGenerate.tsx 容器间接使用，不直接出口给业务代码。
 * 依赖方向：uuid + @/features/ai/aiService（仅类型）+ @/shared/types；不引用同目录其它模块。
 */
import { v4 as uuidv4 } from 'uuid';

import type { OutlineDraft } from '@/features/ai/aiService';
import type { Chapter, Character, Outline } from '@/shared/types';

/** 把嵌套 OutlineDraft 展开为带 parentId 的 Outline[] */
export function flattenOutlines(
  nodes: OutlineDraft[],
  projectId: string,
  parentId: string | null = null,
  orderStart = 0
): Outline[] {
  const result: Outline[] = [];
  nodes.forEach((node, i) => {
    const id = uuidv4();
    result.push({
      id, projectId,
      title: node.title,
      type: node.type,
      parentId,
      order: orderStart + i,
      summary: node.summary,
      keyEvents: node.keyEvents || [],
      characters: [],
    });
    if (node.children?.length) {
      result.push(...flattenOutlines(node.children, projectId, id, 0));
    }
  });
  return result;
}

/** 待生成正文的章节：只补还没有内容的章节（已有内容的章节不会被覆盖） */
export function pickChaptersToGenerate(chapters: Chapter[] | undefined): Chapter[] {
  return chapters?.filter(c => !(c.content ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()) || [];
}

/**
 * 续写模式下「上一卷末尾章节」的上下文块。
 * 取排序后最后约一卷（perVol 章）的标题 + 摘要，作为大纲续写的接续点。
 */
export function buildVolumeContinuationContext(chapters: Chapter[], perVol: number): string {
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const lastVol = sorted.slice(-perVol);
  const lastVolSummary = lastVol
    .map(c => `${c.title}：${c.summary || '（无摘要）'}`)
    .join('\n');
  return `\n\n【上一卷末尾章节（共${lastVol.length}章，请在此之后续写）】\n${lastVolSummary}\n\n续写要求：剧情须紧接上一卷结尾，不得重复已有内容，保持人物状态与故事走向连贯。`;
}

/** 续写模式下的人物上下文：把现有主要人物名（含角色定位）交给 AI 参考 / 扩展 */
export function buildExistingCharacterSummary(chars: Character[]): string {
  if (chars.length === 0) return '';
  return `\n现有主要人物（可参考、扩展或引入新龙套）：${chars.slice(0, 50).map(c => `${c.name}(${c.role})`).join('、')}`;
}
