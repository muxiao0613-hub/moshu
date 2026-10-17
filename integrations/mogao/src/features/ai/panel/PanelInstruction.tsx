/**
 * AI 助手面板 · 指令输入区（选中文字/当前条目提示 + 输入框 + 生成/停止按钮 + 快捷键提示）。
 *
 * 位置：./panel 的展示层，被 AIPanel.tsx 容器渲染在模式选择器下方；
 * 是否可生成由容器算好（canGenerate）传入，本组件不含业务判断。
 * 依赖方向：lucide-react、@/shared/ui（Textarea/Button）、@/shared/contexts（ModuleContext 类型）→ ./types。
 */
import { Send, Square } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import type { ModuleContext } from '@/shared/contexts/EditorContext';

import type { PanelMode } from './types';

interface PanelInstructionProps {
  mode: PanelMode;
  instruction: string;
  onInstructionChange: (value: string) => void;
  placeholder: string;
  canGenerate: boolean;
  streaming: boolean;
  /** 已生成字数，用于停止按钮上的进度提示 */
  resultLength: number;
  buttonLabel: string;
  selectedText: string;
  moduleCtx: ModuleContext | null;
  onGenerate: () => void;
  onStop: () => void;
}

export function PanelInstruction({
  mode, instruction, onInstructionChange, placeholder, canGenerate, streaming, resultLength,
  buttonLabel, selectedText, moduleCtx, onGenerate, onStop,
}: PanelInstructionProps) {
  return (
    <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
      {mode === 'polish' && selectedText && (
        <div className="mb-2 p-2 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700 dark:text-zinc-300">选中文字：</span>
          <span className="line-clamp-2">{selectedText}</span>
        </div>
      )}
      {mode === 'generate' && moduleCtx?.entitySnapshot && (
        <div className="mb-2 p-2 rounded bg-ink-50 dark:bg-ink-900/20 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium text-ink-700 dark:text-ink-400">当前条目：</span>
          {(moduleCtx.entitySnapshot.name as string) ||
           (moduleCtx.entitySnapshot.title as string) ||
           '未命名'}
          {moduleCtx.entitySnapshot.targetFieldLabel
            ? <span className="ml-1 text-ink-500">→ {String(moduleCtx.entitySnapshot.targetFieldLabel)}</span>
            : null
          }
        </div>
      )}
      <Textarea
        value={instruction}
        onChange={e => onInstructionChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="text-sm resize-none"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (canGenerate) onGenerate();
          }
        }}
      />
      {streaming ? (
        <Button
          onClick={onStop}
          variant="outline"
          className="w-full mt-2 gap-2 text-sm border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          size="sm"
        >
          <Square className="h-3 w-3 fill-current" />
          停止生成{resultLength ? ` · 已生成 ${resultLength} 字` : '…'}
        </Button>
      ) : (
        <Button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="w-full mt-2 gap-2 text-sm"
          size="sm"
        >
          <Send className="h-3.5 w-3.5" />{buttonLabel}
        </Button>
      )}
      <p className="text-xs text-zinc-400 text-center mt-1">Ctrl+Enter 快捷发送</p>
    </div>
  );
}
