/**
 * 正文编辑区：TipTap `EditorContent` 的挂载容器。
 *
 * 拆分位置：原 `ChapterEditor.tsx` 的「正文编辑区」，编辑器的创建与内容同步
 * 在 `useChapterEditor`（它监听 chapter 变化后 setContent），这里只负责挂载。
 * 依赖方向：只依赖 `@tiptap/react`，不取数。
 */

import type { Editor } from '@tiptap/react';
import { EditorContent } from '@tiptap/react';

export function ChapterBody({ editor }: { editor: Editor | null }) {
  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-zinc-850 px-10 py-6">
      <div className="max-w-2xl mx-auto min-h-full">
        <EditorContent editor={editor} className="tiptap-editor min-h-full" />
      </div>
    </div>
  );
}
