/**
 * 大纲树单个节点的「行」：类型徽标 + 标题 + 关联标记 + 行内操作按钮（加子节点 / 编辑 / 删除）。
 *
 * 拆分位置：原 `OutlineTree.tsx` 中 `OutlineNode` 的行内 JSX；展开状态与递归由
 * `OutlineNode.tsx` 持有，本组件只接收回调，不自己管理状态。
 * 依赖方向：依赖 `@/shared/ui/badge` 与同目录 `outlineTreeUtils` 的类型配置，不取数。
 */

import { AlignLeft, BookMarked, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Outline } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { OUTLINE_TYPE_CONFIG } from './outlineTreeUtils';

interface OutlineNodeRowProps {
  node: Outline;
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onAddChild: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function OutlineNodeRow({
  node, hasChildren, expanded, onToggleExpand, onAddChild, onEdit, onDelete,
}: OutlineNodeRowProps) {
  const { label, badge } = OUTLINE_TYPE_CONFIG[node.type];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer group"
      onClick={onToggleExpand}
    >
      <button className="text-zinc-400 w-4 shrink-0">
        {hasChildren
          ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
          : <span className="inline-block w-3.5" />
        }
      </button>
      <Badge variant={badge} className="text-xs px-1.5 py-0 shrink-0">{label}</Badge>
      <span className="flex-1 text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
        {node.title || '（未命名）'}
      </span>
      {node.chapterId && (
        <span title="已关联正文章节">
          <BookMarked className="h-3.5 w-3.5 text-ink-500 shrink-0" />
        </span>
      )}
      <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1">
        {node.type !== 'chapter' && (
          <button
            onClick={e => { e.stopPropagation(); onAddChild(); }}
            className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
            title="添加子节点"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onEdit(); }}
          className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-700"
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
