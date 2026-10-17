/**
 * 章节编辑器工具栏下方的三类提示条：定稿提取消息、伏笔扫描、章末悬念检测。
 *
 * 拆分位置：原 `ChapterEditor.tsx` 里夹在工具栏与正文之间的三段条件渲染；
 * 三者都只做「把结果画出来」，判断分别来自 `threadScan.ts`（纯函数）与
 * `@/shared/lib/antiAiDetector`（主容器按需调用）。放在同一个文件是因为它们是
 * 同一块区域的同质组件，且彼此之间没有依赖。
 * 依赖方向：只依赖 `@/shared/lib`、`@/shared/types` 与 tiptap 的 Editor 类型。
 */

import type { Editor } from '@tiptap/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { stripHtml } from '@/features/ai/aiService';
import type { EndingCheck } from '@/shared/lib/antiAiDetector';
import type { Chapter, PlotThread } from '@/shared/types';
import { scanChapterThreads } from './threadScan';

/** 「定稿提取人物状态」等一次性操作的结果提示。 */
export function ChapterStateUpdateBar({ message }: { message: string }) {
  return (
    <div className="px-4 py-1.5 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-300 flex items-center gap-2 shrink-0">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />{message}
    </div>
  );
}

/** 伏笔扫描条。正文只在显示时才读取（与原来一样：不显示就不调 editor.getText()）。 */
export function ChapterThreadScanBar({
  editor, chapter, threads,
}: { editor: Editor | null; chapter: Chapter; threads: PlotThread[] }) {
  const chapterText = editor?.getText() || stripHtml(chapter.content);
  const { matched, unmatched } = scanChapterThreads(threads, chapterText);

  return (
    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 text-xs shrink-0">
      <div className="flex items-center gap-4 flex-wrap">
        {matched.length > 0 && <span><span className="font-medium text-amber-700 dark:text-amber-400">本章涉及：</span>{matched.map(t => <span key={t.id} className="ml-1 px-1.5 py-0.5 bg-amber-200 dark:bg-amber-800 rounded text-amber-800 dark:text-amber-300">{t.title}</span>)}</span>}
        {unmatched.length > 0 && <span><span className="font-medium text-zinc-500">未回收重要伏笔：</span>{unmatched.map(t => <span key={t.id} className="ml-1 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500">{t.title}</span>)}</span>}
        {matched.length === 0 && unmatched.length === 0 && <span className="text-zinc-400">本章未发现已记录的伏笔关键词</span>}
      </div>
    </div>
  );
}

/** 章末关键词提示不判定优劣，收束与悬念都由作者选择。 */
export function ChapterEndingBar({ check }: { check: EndingCheck }) {
  return <div className="px-4 py-2 border-b text-xs shrink-0 flex items-start gap-2 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-500">
    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>{check.verdict}</span>
  </div>;
}
