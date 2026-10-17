/**
 * 大纲树顶部工具栏：节点统计 + 新建卷 / 新建章 / AI 续写入口 / 同步到章节。
 *
 * 拆分位置：原 `OutlineTree.tsx` 的头部区域；所有写操作都通过回调交给主容器，
 * 本组件不持有状态、不取数（AI 续写的弹窗由 `OutlineContinuationDialog.tsx` 负责）。
 * 依赖方向：依赖 `@/shared/ui/button` 与 lucide 图标；被主容器引用，不反向依赖。
 */

import { ArrowRightFromLine, Loader2, Plus, Wand2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';

interface OutlineTreeToolbarProps {
  nodeCount: number;
  hasChapterNodes: boolean;
  syncing: boolean;
  onAddVolume: () => void;
  onAddChapter: () => void;
  onOpenAIContinue: () => void;
  onSync: () => void;
}

export function OutlineTreeToolbar({
  nodeCount, hasChapterNodes, syncing, onAddVolume, onAddChapter, onOpenAIContinue, onSync,
}: OutlineTreeToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
      <div>
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">章节大纲</h2>
        <p className="text-xs text-zinc-500 mt-0.5">共 {nodeCount} 个节点</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={onAddVolume} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" />卷
        </Button>
        <Button onClick={onAddChapter} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Plus className="h-3 w-3" />章
        </Button>
        <Button
          onClick={onOpenAIContinue}
          size="sm" variant="outline" className="gap-1.5 text-xs"
        >
          <Wand2 className="h-3 w-3" />AI续写
        </Button>
        <Button
          onClick={onSync}
          disabled={syncing || !hasChapterNodes}
          size="sm" className="gap-1.5 text-xs"
          title="将大纲中的章节节点同步创建为正文章节"
        >
          {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightFromLine className="h-3 w-3" />}
          同步到章节
        </Button>
      </div>
    </div>
  );
}
