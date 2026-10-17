/**
 * AI 一键生成项目内容 · 弹层主容器。
 *
 * 位置：features/ai 的对外入口（被 shared/layout/ProjectWorkspace 引用，导出名与 props 不变）；
 * 结构已拆到 ./batch：状态与编排在 useBatchGenerate，头部/设置区/进度区各为独立组件。
 * 依赖方向：本文件只做组合渲染 → ./batch 的子组件与 hook；不承载业务逻辑。
 */
import type { AIBatchGenerateProps } from './batch/types';
import { useBatchGenerate } from './batch/useBatchGenerate';
import { BatchConfigPanel } from './batch/BatchConfigPanel';
import { BatchHeader } from './batch/BatchHeader';
import { BatchStepList } from './batch/BatchStepList';

export function AIBatchGenerate({ projectId, onClose }: AIBatchGenerateProps) {
  const controller = useBatchGenerate({ projectId, onClose });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <BatchHeader project={controller.project} onClose={onClose} />

        <div className="flex-1 overflow-auto">
          {/* Config Panel */}
          <BatchConfigPanel controller={controller} />

          {/* Progress & Results */}
          <BatchStepList controller={controller} />
        </div>
      </div>
    </div>
  );
}
