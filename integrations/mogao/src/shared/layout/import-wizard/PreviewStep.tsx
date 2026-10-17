/**
 * 导入向导 Step 2：章节预览 + 书名/题材 + 「AI 自动提取」开关。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`，
 * 状态与动作全部由 `useImportWizard` 提供（本组件不取数、不落库）。
 * 依赖方向：`./constants`、`./useImportWizard` →（本文件）→ 门面。
 */
import { AlertTriangle } from 'lucide-react';
import { formatWordCount } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { GENRES } from './constants';
import type { ImportWizardState } from './useImportWizard';

export function PreviewStep({ wizard }: { wizard: ImportWizardState }) {
  const {
    fileName, detectionMethod, detectedChapters, totalWords,
    projectTitle, setProjectTitle, genre, setGenre,
    extractMeta, setExtractMeta, extractError,
  } = wizard;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 text-sm space-y-1">
        <p><span className="font-medium">文件：</span>{fileName}</p>
        <p><span className="font-medium">识别方式：</span>{detectionMethod}</p>
        <p><span className="font-medium">章节数：</span>{detectedChapters.length} 章</p>
        <p><span className="font-medium">总字数：</span>{formatWordCount(totalWords)}</p>
      </div>

      {/* 书名 + 类型 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">书名</label>
          <Input value={projectTitle} onChange={e => setProjectTitle(e.target.value)} placeholder="请输入书名" />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">类型</label>
          <Select value={genre} onChange={e => setGenre(e.target.value)}>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>
      </div>

      {/* 章节预览 */}
      <div className="max-h-48 overflow-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        {detectedChapters.slice(0, 20).map(ch => (
          <div key={ch.order} className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 text-sm last:border-0">
            <span className="text-zinc-700 dark:text-zinc-300 truncate max-w-xs">{ch.title}</span>
            <span className="text-xs text-zinc-400 shrink-0 ml-2">{formatWordCount(ch.wordCount)}</span>
          </div>
        ))}
        {detectedChapters.length > 20 && (
          <div className="px-3 py-2 text-xs text-zinc-400">...还有 {detectedChapters.length - 20} 章</div>
        )}
      </div>

      {/* AI 提取选项 */}
      <label className="flex items-start gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={extractMeta}
          onChange={e => setExtractMeta(e.target.checked)}
          className="mt-0.5"
        />
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">AI 自动提取人物和世界观（可选）</p>
          <p className="text-xs text-zinc-400">分析前5章内容，自动创建人物档案和世界观设定，消耗少量 token</p>
        </div>
      </label>

      {extractError && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{extractError}
        </div>
      )}
    </div>
  );
}
