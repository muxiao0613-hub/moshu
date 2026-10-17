/**
 * 章节标题与元信息区：节奏 / 事件标签 + 可编辑的一级标题。
 *
 * 拆分位置：原 `ChapterEditor.tsx` 的「章节标题区」；标题失焦后的写入
 * 交给 `useChapterEditor.saveTitle`（它负责与当前章标题比较后持久化）。
 * 依赖方向：只依赖 `@/shared/lib/pacingTracker` 的标签与配色，不取数。
 */

import { CONFLICT_LABELS, PACING_COLORS, PACING_LABELS } from '@/shared/lib/pacingTracker';
import type { Chapter } from '@/shared/types';

interface ChapterTitleSectionProps {
  chapter: Chapter;
  onTitleCommit: (title: string) => void;
}

export function ChapterTitleSection({ chapter, onTitleCommit }: ChapterTitleSectionProps) {
  return (
    <div className="px-10 pt-8 pb-2 bg-white dark:bg-zinc-850">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          {chapter.pacingTag && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PACING_COLORS[chapter.pacingTag]}`}>{PACING_LABELS[chapter.pacingTag]}</span>}
          {chapter.conflictType && chapter.conflictType !== 'none' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300">{CONFLICT_LABELS[chapter.conflictType]}</span>}
        </div>
        <h1
          className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 outline-none border-b-2 border-transparent focus:border-ink-300 pb-1 transition-colors"
          contentEditable
          suppressContentEditableWarning
          onBlur={e => {
            const newTitle = e.currentTarget.textContent?.trim() || chapter.title;
            onTitleCommit(newTitle);
          }}
        >
          {chapter.title}
        </h1>
      </div>
    </div>
  );
}
