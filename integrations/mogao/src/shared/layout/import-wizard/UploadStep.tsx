/**
 * 导入向导 Step 1：选择 .txt 文件（点击区域触发隐藏的 file input）。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`，
 * file input 的 ref 与变更处理都由 `useImportWizard` 提供。
 * 依赖方向：（本文件）→ 门面。
 */
import type { ChangeEvent, RefObject } from 'react';
import { FileText } from 'lucide-react';

interface UploadStepProps {
  fileRef: RefObject<HTMLInputElement>;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function UploadStep({ fileRef, onFileSelect }: UploadStepProps) {
  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-10 text-center cursor-pointer hover:border-ink-400 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <FileText className="h-10 w-10 mx-auto mb-3 text-zinc-300" />
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">点击选择 .txt 文件</p>
        <p className="text-xs text-zinc-400 mt-1">支持常见中文网文格式，自动识别章节标题</p>
      </div>
      <input ref={fileRef} type="file" accept=".txt" className="hidden" onChange={onFileSelect} />
    </div>
  );
}
