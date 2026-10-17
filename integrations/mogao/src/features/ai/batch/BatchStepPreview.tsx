/**
 * AI 批量生成 · 单步结果预览（全选/全不选 + 各步骤的条目列表与勾选）。
 *
 * 位置：./batch 的展示层，被 BatchStepList 在步骤展开时渲染；
 * data 是 unknown[]，这里按 stepKey 收窄为对应草稿类型，收窄只影响展示，不改落库。
 * 依赖方向：@/shared/ui/badge、@/features/ai/aiService（草稿类型）→ ./types；不依赖 hook。
 */
import type {
  CharacterDraft,
  OutlineDraft,
  ThreadDraft,
  TimelineDraft,
  WorldDraft,
} from '@/features/ai/aiService';
import { Badge } from '@/shared/ui/badge';

import type { ChapterBatchItem, StepKey } from './types';

interface BatchStepPreviewProps {
  stepKey: StepKey;
  data: unknown[];
  selected: Set<number>;
  onToggle: (idx: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function BatchStepPreview({
  stepKey, data, selected, onToggle, onSelectAll, onDeselectAll,
}: BatchStepPreviewProps) {
  return (
    <div className="border-t border-zinc-100 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
        <button onClick={onSelectAll} className="text-xs text-ink-600 hover:underline">全选</button>
        <span className="text-zinc-300">·</span>
        <button onClick={onDeselectAll} className="text-xs text-zinc-400 hover:underline">全不选</button>
      </div>
      <div className="max-h-64 overflow-auto divide-y divide-zinc-100 dark:divide-zinc-800">
        {stepKey === 'characters' && (data as CharacterDraft[]).map((c, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{c.name}</span>
                <Badge variant={c.role === 'protagonist' ? 'default' : c.role === 'antagonist' ? 'destructive' : 'secondary'} className="text-xs">
                  {c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : c.role === 'supporting' ? '配角' : '次要'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{c.personality}</p>
            </div>
          </label>
        ))}
        {stepKey === 'world' && (data as WorldDraft[]).map((w, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{w.title}</span>
                <Badge variant="outline" className="text-xs">{w.category}</Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{w.content}</p>
            </div>
          </label>
        ))}
        {stepKey === 'outlines' && (data as OutlineDraft[]).map((o, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{o.title}</span>
                <Badge variant="secondary" className="text-xs">{o.type === 'volume' ? '卷' : o.type === 'arc' ? '篇' : '章'}</Badge>
                {o.children && <span className="text-xs text-zinc-400">{o.children.length} 章</span>}
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{o.summary}</p>
            </div>
          </label>
        ))}
        {stepKey === 'threads' && (data as ThreadDraft[]).map((t, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.title}</span>
                <Badge variant={t.importance === 'critical' ? 'default' : t.importance === 'major' ? 'warning' : 'outline'} className="text-xs">
                  {t.importance === 'critical' ? '关键' : t.importance === 'major' ? '重要' : '次要'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{t.description}</p>
            </div>
          </label>
        ))}
        {stepKey === 'timeline' && (data as TimelineDraft[]).map((t, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.title}</span>
                <span className="text-xs text-zinc-400">{t.date}</span>
                <Badge variant="secondary" className="text-xs">{t.line}</Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{t.description}</p>
            </div>
          </label>
        ))}
        {stepKey === 'chapters' && (data as ChapterBatchItem[]).map((item, i) => (
          <label key={i} className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} className="mt-0.5 accent-ink-600" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.chapter.title}</span>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                约 {Math.floor(item.content.length / 2)} 字
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
