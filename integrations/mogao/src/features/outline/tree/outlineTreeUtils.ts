/**
 * 大纲树的纯函数与静态配置。
 *
 * 拆分位置：从 `OutlineTree.tsx` 中抽出的「纯判断」部分 —— 层级展开、兄弟/根节点过滤、
 * 顺序号与父节点推导、节点工厂。放在单独文件是为了让组件只关心渲染，这里的函数可直接单测。
 * 依赖方向：只依赖 `@/shared/types`（类型）与 `@/features/ai/aiService`（续写草稿类型），
 * 不 import 任何组件，也不被其它 feature 反向依赖。
 */

import type { OutlineContinuationDraft } from '@/features/ai/aiService';
import type { Outline } from '@/shared/types';

interface OutlineTypeStyle {
  label: string;
  color: string;
  badge: 'default' | 'secondary' | 'outline';
}

export const OUTLINE_TYPE_CONFIG: Record<Outline['type'], OutlineTypeStyle> = {
  volume: { label: '卷', color: 'bg-ink-600', badge: 'default' },
  arc: { label: '篇', color: 'bg-blue-600', badge: 'secondary' },
  chapter: { label: '章', color: 'bg-zinc-400', badge: 'outline' },
};

/** 顶层节点（没有父节点）。 */
export function getRootNodes(outlines: Outline[]): Outline[] {
  return outlines.filter(n => !n.parentId);
}

/** 某个父节点下的直接子节点。 */
export function getChildNodes(outlines: Outline[], parentId: string): Outline[] {
  return outlines.filter(n => n.parentId === parentId);
}

/** 同级兄弟（用于 AI 生成概要时提供上下文）。 */
export function getSiblingNodes(
  outlines: Outline[],
  parentId: string | null | undefined,
  excludeId: string,
): Outline[] {
  return outlines.filter(o => o.parentId === parentId && o.id !== excludeId);
}

/** 在卷下加子节点时默认建「篇」，其余一律建「章」。 */
export function getChildType(type: Outline['type']): Outline['type'] {
  return type === 'volume' ? 'arc' : 'chapter';
}

/** 新建章节节点的顺序号：接在所有章节节点之后。 */
export function getNextChapterOrder(outlines: Outline[]): number {
  return outlines
    .filter(o => o.type === 'chapter')
    .reduce((max, o) => Math.max(max, o.order), 0);
}

/** 用于挂载续写章节的父节点：最后一个顶层卷。 */
export function getLastRootVolume(outlines: Outline[]): Outline | undefined {
  return [...outlines].reverse().find(o => o.type === 'volume' && !o.parentId);
}

export function getEditDialogTitle(type: Outline['type']): string {
  if (type === 'volume') return '编辑卷';
  if (type === 'arc') return '编辑篇';
  return '编辑章节大纲';
}

/** 新增节点工厂：标题留给编辑弹窗填写。 */
export function createOutlineNode(params: {
  id: string;
  projectId: string;
  type: Outline['type'];
  parentId: string | null;
  order: number;
}): Outline {
  return {
    id: params.id,
    projectId: params.projectId,
    title: '',
    type: params.type,
    parentId: params.parentId,
    order: params.order,
    summary: '',
    keyEvents: [],
    characters: [],
  };
}

/** AI 续写草稿 → 待落库的章节节点（父节点缺失时挂到最后一个卷下）。 */
export function createContinuationNode(params: {
  id: string;
  projectId: string;
  draft: OutlineContinuationDraft;
  fallbackParentId: string | null;
  order: number;
}): Outline {
  return {
    id: params.id,
    projectId: params.projectId,
    title: params.draft.title,
    type: 'chapter',
    parentId: params.draft.parentId ?? params.fallbackParentId,
    order: params.order,
    summary: params.draft.summary,
    keyEvents: params.draft.keyEvents || [],
    characters: [],
  };
}
