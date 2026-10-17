/**
 * 章节编辑器底部状态栏：上一章 / 下一章导航、字数、节奏与事件标签、进度。
 *
 * 拆分位置：原 `ChapterEditor.tsx` 的「底部状态栏」；节奏/事件标签的写入走
 * `useChapterEditor` 的同名回调，本组件只负责显示与触发。
 * 依赖方向：依赖 `@/shared/lib/workRoutes` 拼章节路由，不取数。
 */

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ConflictType, PacingTag } from '@/shared/lib/pacingTracker';
import { workChapterPath } from '@/shared/lib/workRoutes';
import type { Chapter } from '@/shared/types';

const PACING_OPTIONS: { value: PacingTag | ''; label: string }[] = [
  { value: '', label: '节奏' },
  { value: 'slow', label: '慢' },
  { value: 'medium', label: '中' },
  { value: 'fast', label: '快' },
];

const CONFLICT_OPTIONS: { value: ConflictType | ''; label: string }[] = [
  { value: '', label: '事件' },
  { value: 'none', label: '推进' },
  { value: 'conflict', label: '冲突' },
  { value: 'reversal', label: '反转' },
  { value: 'relationship', label: '关系' },
  { value: 'worldbuilding', label: '世界观' },
  { value: 'tension', label: '张力' },
];

interface ChapterFooterBarProps {
  projectId: string;
  chapter: Chapter;
  chapterCount: number;
  currentIndex: number;
  wordCount: number;
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  onPacingChange: (pacingTag: string) => void;
  onConflictTypeChange: (conflictType: string) => void;
}

export function ChapterFooterBar({
  projectId, chapter, chapterCount, currentIndex, wordCount,
  prevChapter, nextChapter, onPacingChange, onConflictTypeChange,
}: ChapterFooterBarProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shrink-0 text-xs text-zinc-400 gap-2">
      {/* 上一章 */}
      <button
        onClick={() => prevChapter && navigate(workChapterPath(projectId, prevChapter.id))}
        disabled={!prevChapter}
        title={prevChapter ? `上一章：${prevChapter.title}` : '已是第一章'}
        className="flex items-center gap-1 min-w-0 flex-1 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{prevChapter ? prevChapter.title : '已是第一章'}</span>
      </button>

      {/* 中：字数 + 节奏 + 事件 + 进度 */}
      <div className="flex items-center gap-2 shrink-0 px-3 border-x border-zinc-200 dark:border-zinc-700">
        <span className="font-medium text-zinc-600 dark:text-zinc-300 tabular-nums">{wordCount.toLocaleString()} 字</span>
        <span className="text-zinc-200 dark:text-zinc-700">·</span>
        <select
          value={chapter.pacingTag || ''}
          onChange={e => onPacingChange(e.target.value)}
          className="h-6 text-[11px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1 cursor-pointer"
          title="节奏标签"
        >
          {PACING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select
          value={chapter.conflictType || ''}
          onChange={e => onConflictTypeChange(e.target.value)}
          className="h-6 text-[11px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1 cursor-pointer"
          title="事件类型"
        >
          {CONFLICT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-zinc-200 dark:text-zinc-700">·</span>
        <span className="tabular-nums">{currentIndex + 1} / {chapterCount || 1}</span>
      </div>

      {/* 下一章 */}
      <button
        onClick={() => nextChapter && navigate(workChapterPath(projectId, nextChapter.id))}
        disabled={!nextChapter}
        title={nextChapter ? `下一章：${nextChapter.title}` : '已是最后一章'}
        className="flex items-center gap-1 min-w-0 flex-1 justify-end hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <span className="truncate">{nextChapter ? nextChapter.title : '已是最后一章'}</span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
      </button>
    </div>
  );
}
