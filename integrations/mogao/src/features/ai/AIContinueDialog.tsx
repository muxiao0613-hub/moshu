import { useState } from 'react';
import { Wand2, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { Input } from '@/shared/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';

import { cn, getAIErrorMessage } from '@/shared/lib/utils';

interface AIContinueDialogProps<T> {
  title: string;
  /** 生成单位名称，如"人物"、"设定" */
  noun: string;
  defaultCount?: number;
  maxCount?: number;
  /** 执行 AI 续写，返回草稿列表 */
  onGenerate: (instruction: string, count: number) => Promise<T[]>;
  /** 渲染单条预览项 */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** 保存选中项到 DB */
  onSave: (items: T[]) => Promise<void>;
  onClose: () => void;
}

export function AIContinueDialog<T>({
  title, noun, defaultCount = 5, maxCount = 20,
  onGenerate, renderItem, onSave, onClose,
}: AIContinueDialogProps<T>) {
  const [instruction, setInstruction] = useState('');
  const [count, setCount] = useState(String(defaultCount));
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<T[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setPreview([]);
    setSelected(new Set());
    try {
      const n = Math.max(1, Math.min(maxCount, parseInt(count) || defaultCount));
      const items = await onGenerate(instruction, n);
      setPreview(items);
      setSelected(new Set(items.map((_, i) => i)));
      if (items.length === 0) setError('AI 未生成内容，可尝试补充要求后重试');
    } catch (e) {
      setError(getAIErrorMessage(e, '生成失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (i: number) =>
    setSelected(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(preview.filter((_, i) => selected.has(i)));
      onClose();
    } catch (e) {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-ink-500" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* 参数 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500 block mb-1">
                续写要求（可选，不填则自动延续现有设定）
              </label>
              <Textarea
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                placeholder={`例如：侧重${noun}之间的冲突关系…`}
                rows={2}
                className="text-sm resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate(); }}
              />
            </div>
            <div className="w-20 shrink-0">
              <label className="text-xs font-medium text-zinc-500 block mb-1">数量</label>
              <Input
                type="number"
                min={1} max={maxCount}
                value={count}
                onChange={e => setCount(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" />生成中…</>
              : <><Wand2 className="h-4 w-4" />AI 续写 {noun}</>
            }
          </Button>

          {error && <p className="text-xs text-red-500">{error}</p>}

          {/* 预览 */}
          {preview.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-zinc-500">
                  预览（共 {preview.length} 条）
                </p>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setSelected(new Set(preview.map((_, i) => i)))} className="text-ink-600 hover:underline">全选</button>
                  <button onClick={() => setSelected(new Set())} className="text-zinc-400 hover:underline">取消</button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-60 overflow-auto pr-1">
                {preview.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => toggleSelect(i)}
                    className={cn(
                      'flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                      selected.has(i)
                        ? 'border-ink-300 bg-ink-50 dark:bg-ink-900/20'
                        : 'border-zinc-200 dark:border-zinc-700 opacity-50'
                    )}
                  >
                    <div className={cn(
                      'mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center',
                      selected.has(i) ? 'bg-ink-600 border-ink-600' : 'border-zinc-300 dark:border-zinc-600'
                    )}>
                      {selected.has(i) && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {renderItem(item, i)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="gap-1.5">
            <X className="h-3.5 w-3.5" />取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={preview.length === 0 || selected.size === 0 || saving}
            className="gap-1.5"
          >
            {saving
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Check className="h-3.5 w-3.5" />
            }
            保存选中 ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
