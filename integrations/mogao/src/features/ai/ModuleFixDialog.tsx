import { useState } from 'react';
import { Check, X, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/lib/utils';

export interface EntityFix {
  id: string;
  [field: string]: unknown;
}

export interface ModuleFixDialogProps {
  title: string;
  fixes: EntityFix[];
  /** 原始实体列表（id 索引） */
  entities: Array<{ id: string; [k: string]: unknown }>;
  /** 字段展示名称映射 */
  fieldLabels: Record<string, string>;
  /** 数组字段如何格式化展示 */
  formatValue?: (field: string, value: unknown) => string;
  onApply: (selected: EntityFix[]) => Promise<void>;
  onClose: () => void;
}

function defaultFormat(_field: string, value: unknown): string {
  if (Array.isArray(value)) return (value as unknown[]).join('；');
  if (value === null || value === undefined) return '';
  return String(value);
}

function getChangedFields(fix: EntityFix, orig: Record<string, unknown>): string[] {
  return Object.keys(fix).filter(k => {
    if (k === 'id') return false;
    const fixVal = fix[k];
    if (fixVal === undefined) return false;
    const origVal = orig[k];
    if (Array.isArray(fixVal) && Array.isArray(origVal))
      return JSON.stringify(fixVal) !== JSON.stringify(origVal);
    return fixVal !== origVal;
  });
}

export function ModuleFixDialog({
  title, fixes, entities, fieldLabels, formatValue, onApply, onClose
}: ModuleFixDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(fixes.map(f => f.id)));
  const [applying, setApplying] = useState(false);

  const fmt = formatValue ?? defaultFormat;
  const entityMap = Object.fromEntries(entities.map(e => [e.id, e]));

  const toggle = (id: string) =>
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const validFixes = fixes.filter(f => {
    const orig = entityMap[f.id];
    return orig && getChangedFields(f, orig).length > 0;
  });

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(validFixes.filter(f => selected.has(f.id)));
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            <Badge variant="secondary">{validFixes.length} 条变更</Badge>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-zinc-500 mb-3">
          以下是 AI 建议的修正，勾选要应用的项目后点「应用选中项」。
        </p>

        <div className="space-y-2 max-h-[55vh] overflow-auto pr-1">
          {validFixes.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8">AI 未发现需要修改的字段</p>
          )}
          {validFixes.map(fix => {
            const orig = entityMap[fix.id] as Record<string, unknown>;
            if (!orig) return null;
            const fields = getChangedFields(fix, orig);
            const isSel = selected.has(fix.id);
            // 显示名称：优先用 title / name 字段
            const displayName = String(orig.title ?? orig.name ?? fix.id);

            return (
              <div
                key={fix.id}
                className={cn(
                  'rounded-lg border p-3 cursor-pointer transition-colors',
                  isSel
                    ? 'border-ink-400 bg-ink-50 dark:bg-ink-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 opacity-60'
                )}
                onClick={() => toggle(fix.id)}
              >
                <div className="flex items-start gap-3">
                  {/* 勾选框 */}
                  <div className={cn(
                    'mt-0.5 h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center',
                    isSel ? 'bg-ink-600 border-ink-600' : 'border-zinc-300 dark:border-zinc-600'
                  )}>
                    {isSel && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-2">
                      {displayName}
                    </p>
                    <div className="space-y-1.5">
                      {fields.map(field => (
                        <div key={field} className="flex items-start gap-2 text-xs">
                          <span className="text-zinc-400 w-14 shrink-0 pt-0.5">
                            {fieldLabels[field] ?? field}
                          </span>
                          <div className="flex items-start gap-1.5 flex-1 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 line-through max-w-[200px] break-words">
                              {fmt(field, orig[field])}
                            </span>
                            <ChevronRight className="h-3 w-3 text-zinc-400 shrink-0 mt-0.5" />
                            <span className="px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 max-w-[200px] break-words">
                              {fmt(field, fix[field])}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <div className="flex items-center gap-2 w-full">
            <span className="text-xs text-zinc-400 flex-1">
              已选 {selected.size} / {validFixes.length} 条
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>取消全选</Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set(validFixes.map(f => f.id)))}>全选</Button>
            <Button variant="outline" onClick={onClose} className="gap-1.5">
              <X className="h-3.5 w-3.5" />取消
            </Button>
            <Button
              onClick={handleApply}
              disabled={selected.size === 0 || validFixes.length === 0 || applying}
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              {applying ? '保存中…' : `应用选中项 (${selected.size})`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
