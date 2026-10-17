/**
 * 导入向导 Step 3：AI 提取结果预览（故事梗概 + 人物 + 世界观）。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`，
 * 数据由 `useImportWizard` 的 `handleExtract` 写入后传入。
 * 依赖方向：`./types` →（本文件）→ 门面。
 */
import { Globe, Users } from 'lucide-react';
import type { ExtractedMeta } from './types';

export function ExtractStep({ meta }: { meta: ExtractedMeta }) {
  return (
    <div className="space-y-3 text-sm">
      {meta.outlineSummary && (
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 px-4 py-3">
          <p className="text-xs font-medium text-zinc-500 mb-1">故事梗概</p>
          <p className="text-zinc-700 dark:text-zinc-300">{meta.outlineSummary}</p>
        </div>
      )}
      {meta.characters.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1"><Users className="h-3.5 w-3.5" />识别人物（{meta.characters.length}）</p>
          <div className="space-y-1.5">
            {meta.characters.map((c, i) => (
              <div key={i} className="rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-zinc-400">{c.role}</span>
                <p className="text-xs text-zinc-500 mt-0.5">{c.personality}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {meta.worldSettings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1"><Globe className="h-3.5 w-3.5" />世界观设定（{meta.worldSettings.length}）</p>
          <div className="space-y-1.5">
            {meta.worldSettings.map((w, i) => (
              <div key={i} className="rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <span className="font-medium">{w.title}</span>
                <span className="ml-2 text-xs text-zinc-400">{w.category}</span>
                <p className="text-xs text-zinc-500 mt-0.5">{w.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
