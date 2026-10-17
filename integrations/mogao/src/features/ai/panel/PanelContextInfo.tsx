/**
 * AI 助手面板 · 本次注入上下文抽屉（人物 / 世界观 / 大纲 / 伏笔 / RAG 检索）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器在章节模式下渲染；展开态是本组件的局部 state。
 * 依赖方向：lucide-react + @/shared/types（AIContextInfo/RagChunk）；不依赖 hook。
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

import type { AIContextInfo, RagChunk } from '@/shared/types';

interface PanelContextInfoProps {
  contextInfo: AIContextInfo;
  ragChunks: RagChunk[];
}

export function PanelContextInfo({ contextInfo, ragChunks }: PanelContextInfoProps) {
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
      <button
        onClick={() => setContextOpen(o => !o)}
        className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        <span className="font-medium">本次注入的上下文</span>
        {contextOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {contextOpen && (
        <div className="mt-2 space-y-1 text-xs">
          {contextInfo.characters.length > 0 && <div><span className="text-zinc-400">人物：</span><span className="text-zinc-600 dark:text-zinc-400">{contextInfo.characters.join('、')}</span></div>}
          {contextInfo.worldSettings.length > 0 && <div><span className="text-zinc-400">世界观：</span><span className="text-zinc-600 dark:text-zinc-400">{contextInfo.worldSettings.join('、')}</span></div>}
          {contextInfo.outline && <div><span className="text-zinc-400">大纲：</span><span className="text-zinc-600 dark:text-zinc-400">{contextInfo.outline}</span></div>}
          {contextInfo.threads.length > 0 && <div><span className="text-zinc-400">伏笔：</span><span className="text-zinc-600 dark:text-zinc-400">{contextInfo.threads.join('、')}</span></div>}
          {ragChunks.length > 0 && (
            <div>
              <span className="text-zinc-400">RAG检索：</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {ragChunks.map(c => `第${c.chapterOrder}章《${c.chapterTitle}》`).join('、')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
