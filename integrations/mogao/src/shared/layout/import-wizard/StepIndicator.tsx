/**
 * 导入向导的步骤指示器：四个圆点 + 当前步骤名。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`。
 * 依赖方向：`./types` →（本文件）→ 门面。
 */
import { ChevronRight } from 'lucide-react';
import type { Step } from './types';

const STEPS: Step[] = ['upload', 'preview', 'extract', 'done'];

const STEP_LABELS: Record<Step, string> = {
  upload: '选择文件',
  preview: '预览章节',
  extract: '设定提取',
  done: '完成',
};

export function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1 text-xs text-zinc-400 mb-2">
      {STEPS.map((s, i) => (
        <span key={s} className="flex items-center gap-1">
          <span className={`px-2 py-0.5 rounded-full ${step === s ? 'bg-ink-700 text-white' : 'bg-zinc-100 dark:bg-zinc-800'}`}>
            {i + 1}
          </span>
          {i < 3 && <ChevronRight className="h-3 w-3" />}
        </span>
      ))}
      <span className="ml-2">{STEP_LABELS[step]}</span>
    </div>
  );
}
