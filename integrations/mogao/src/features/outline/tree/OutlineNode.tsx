/**
 * 大纲树节点（递归）：持有展开状态，渲染自身一行并按需递归渲染子节点与概要。
 *
 * 拆分位置：原 `OutlineTree.tsx` 中的 `OutlineNode`；行内操作拆到 `OutlineNodeRow.tsx`，
 * 子节点查找走 `outlineTreeUtils.getChildNodes`。
 * 依赖方向：依赖同目录 `OutlineNodeRow` 与 `outlineTreeUtils`，不依赖主容器，不取数。
 */

import { useState } from 'react';
import type { Outline } from '@/shared/types';
import { OutlineNodeRow } from './OutlineNodeRow';
import { getChildNodes, getChildType } from './outlineTreeUtils';

interface OutlineNodeProps {
  node: Outline;
  children: Outline[];
  allNodes: Outline[];
  onEdit: (node: Outline) => void;
  onDelete: (node: Outline) => void;
  onAddChild: (parentId: string, type: Outline['type']) => void;
}

export function OutlineNode({ node, children, allNodes, onEdit, onDelete, onAddChild }: OutlineNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;

  return (
    <div className="select-none">
      <OutlineNodeRow
        node={node}
        hasChildren={hasChildren}
        expanded={expanded}
        onToggleExpand={() => setExpanded(e => !e)}
        onAddChild={() => onAddChild(node.id, getChildType(node.type))}
        onEdit={() => onEdit(node)}
        onDelete={() => onDelete(node)}
      />

      {hasChildren && expanded && (
        <div className="ml-4 border-l border-zinc-200 dark:border-zinc-700 pl-2 mt-0.5 space-y-0.5">
          {children.map(child => (
            <OutlineNode
              key={child.id}
              node={child}
              children={getChildNodes(allNodes, child.id)}
              allNodes={allNodes}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}

      {node.summary && expanded && !hasChildren && (
        <p className="ml-10 text-xs text-zinc-400 mt-0.5 mb-1">{node.summary}</p>
      )}
    </div>
  );
}
