/**
 * AI 批量生成 · 弹层头部（标题 / 项目副标题 / 关闭按钮）。
 *
 * 位置：./batch 的展示层，只被 AIBatchGenerate.tsx 容器渲染；
 * 依赖方向：lucide-react + @/shared/types（项目信息）；不依赖 hook，避免与 useBatchGenerate 成环。
 */
import { Wand2, X } from 'lucide-react';

import type { Project } from '@/shared/types';

interface BatchHeaderProps {
  project: Project | undefined;
  onClose: () => void;
}

export function BatchHeader({ project, onClose }: BatchHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
      <div className="flex items-center gap-3">
        <Wand2 className="h-5 w-5 text-ink-500" />
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">AI 一键生成项目内容</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {project?.title} · 根据简介自动生成所有知识库内容
          </p>
        </div>
      </div>
      <button onClick={onClose} className="p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
