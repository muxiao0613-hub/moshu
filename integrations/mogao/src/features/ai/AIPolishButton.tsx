import { useState } from 'react';
import { Sparkles, Loader2, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { polishText } from '@/features/ai/aiService';
import { computeDiff, diffStats } from '@/shared/lib/diff';
import { cn, getAIErrorMessage } from '@/shared/lib/utils';

interface AIPolishButtonProps {
  /** 当前字段的文本内容 */
  value: string;
  /** 字段标签，用于 AI 提示词 */
  fieldLabel: string;
  /** 项目名称（可选，改善 AI 输出质量） */
  projectTitle?: string;
  /** 接受润色结果后的回调 */
  onApply: (polished: string) => void;
  className?: string;
}

export function AIPolishButton({ value, fieldLabel, projectTitle, onApply, className }: AIPolishButtonProps) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [result, setResult] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [showDiff, setShowDiff] = useState(true);

  const handleOpen = () => {
    setResult('');
    setError('');
    setInstruction('');
    setOpen(true);
  };

  const handleGenerate = async () => {
    if (!value.trim()) return;
    setResult('');
    setError('');
    setStreaming(true);
    try {
      await polishText({
        text: value,
        fieldLabel,
        instruction: instruction || undefined,
        projectTitle,
        onChunk: c => setResult(r => r + c),
      });
    } catch (e) {
      setError(getAIErrorMessage(e));
    } finally {
      setStreaming(false);
    }
  };

  const handleApply = () => {
    onApply(result);
    setOpen(false);
  };

  const diff = result && !streaming ? computeDiff(value, result) : null;
  const stats = diff ? diffStats(diff) : null;

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={!value.trim()}
        title={`AI润色「${fieldLabel}」`}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
          'text-violet-600 dark:text-violet-400',
          'border border-violet-200 dark:border-violet-700',
          'hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          className
        )}
      >
        <Sparkles className="h-3 w-3" />
        润色
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>AI 润色 · {fieldLabel}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {/* 原文 */}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">原文</p>
              <div className="px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-600 dark:text-zinc-400 max-h-32 overflow-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-700">
                {value}
              </div>
            </div>

            {/* 润色指令 */}
            <div className="flex gap-2">
              <Textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder="润色要求（可选），如：更加简洁有力 / 增加诗意 / 改为第三人称..."
                rows={2}
                className="text-sm resize-none flex-1"
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleGenerate(); } }}
              />
              <Button onClick={handleGenerate} disabled={streaming || !value.trim()} className="self-end gap-1.5 shrink-0">
                {streaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {streaming ? '润色中…' : '开始润色'}
              </Button>
            </div>

            {/* 错误提示 */}
            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}

            {/* 润色结果 */}
            {(result || streaming) && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-zinc-500">润色结果</p>
                  {diff && stats && (
                    <div className="flex items-center gap-3 text-xs">
                      {stats.added > 0 && <span className="text-green-600">+{stats.added}字</span>}
                      {stats.removed > 0 && <span className="text-red-500">-{stats.removed}字</span>}
                      <button
                        onClick={() => setShowDiff(d => !d)}
                        className="flex items-center gap-0.5 text-zinc-400 hover:text-zinc-600"
                      >
                        {showDiff ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {showDiff ? '隐藏对比' : '显示对比'}
                      </button>
                    </div>
                  )}
                </div>

                <div className={cn(
                  'px-3 py-2 rounded-md text-sm max-h-48 overflow-auto whitespace-pre-wrap',
                  'border border-zinc-200 dark:border-zinc-700',
                  streaming ? 'bg-violet-50 dark:bg-violet-900/10' : 'bg-white dark:bg-zinc-900'
                )}>
                  {/* Diff 高亮展示 */}
                  {diff && showDiff && !streaming
                    ? diff.map((token, i) => (
                        <span key={i} className={cn(
                          token.type === 'delete' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 line-through',
                          token.type === 'insert' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                        )}>
                          {token.value}
                        </span>
                      ))
                    : <span className={cn(streaming && 'after:content-["▌"] after:animate-pulse after:text-violet-500')}>{result}</span>
                  }
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5">
              <X className="h-3.5 w-3.5" />取消
            </Button>
            <Button
              onClick={handleApply}
              disabled={!result || streaming}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />接受润色结果
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
