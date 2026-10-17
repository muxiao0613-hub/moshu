/**
 * 伏笔扫描的纯判断：从本章正文里挑出「本章涉及」与「未回收的重要伏笔」。
 *
 * 拆分位置：`ChapterEditor.tsx` 只做编排，原来的 filter 直接从 JSX 里搬到这里；
 * 唯一的调用方是提示条组件 `editor/ChapterNoticeBars.tsx`。
 * 依赖方向：只依赖 `@/shared/types`，不依赖 React / 取数。
 */

import type { PlotThread } from '@/shared/types';

export interface ChapterThreadScan {
  matched: PlotThread[];
  unmatched: PlotThread[];
}

export function scanChapterThreads(threads: PlotThread[], chapterText: string): ChapterThreadScan {
  const matched = threads.filter(t => t.title && chapterText.includes(t.title));
  const unmatched = threads.filter(t => t.status !== 'resolved'
    && t.status !== 'abandoned'
    && t.importance !== 'minor'
    && t.title
    && !chapterText.includes(t.title));
  return { matched, unmatched };
}
