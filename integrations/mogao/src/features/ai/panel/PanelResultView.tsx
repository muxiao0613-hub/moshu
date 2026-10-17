/**
 * AI 助手面板 · 结果查看区（流式正文 + 复制 / 插入 / 应用 / 重新生成）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染在错误提示下方；
 * 滚动跟随与「已复制」提示是本组件的局部 state，容器不关心。
 * 依赖方向：lucide-react + @/shared/ui（Button）+ @/shared/lib/utils（cn）→ ./types。
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, PlusCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

import type { PanelMode } from './types';

interface PanelResultViewProps {
  result: string;
  streaming: boolean;
  applying?: boolean;
  mode: PanelMode;
  /** 章节续写/润色且有插入回调时才显示「插入」 */
  canInsert: boolean;
  /** 实体生成且有应用回调时才显示「应用」 */
  canApply: boolean;
  onInsert: () => void;
  onApply: () => void;
  onRegenerate: () => void;
}

export function PanelResultView({
  result, streaming, applying = false, mode, canInsert, canApply, onInsert, onApply, onRegenerate,
}: PanelResultViewProps) {
  const resultRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (streaming && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result, streaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        ref={resultRef}
        className={cn(
          'flex-1 overflow-auto px-3 py-3 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap',
          (mode === 'continue' || mode === 'polish') ? 'font-serif' : 'font-sans',
          streaming && 'ai-cursor'
        )}
        style={(mode === 'continue' || mode === 'polish') ? { fontFamily: 'Noto Serif SC, SimSun, serif' } : {}}
      >
        {result}
      </div>

      {!streaming && result && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
          <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1 text-xs h-7 flex-1">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制'}
          </Button>
          {/* 章节续写/润色 → 插入编辑器 */}
          {canInsert && (
            <Button size="sm" onClick={onInsert} disabled={applying} className="gap-1 text-xs h-7 flex-1">
              <PlusCircle className="h-3.5 w-3.5" />插入
            </Button>
          )}
          {/* 实体生成 → 应用到字段 */}
          {canApply && (
            <Button size="sm" onClick={onApply} className="gap-1 text-xs h-7 flex-1">
              <Check className="h-3.5 w-3.5" />应用
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onRegenerate} disabled={applying} className="h-7 w-7 p-0 shrink-0" title="重新生成">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
