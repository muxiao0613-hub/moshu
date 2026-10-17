/**
 * 导入向导 Step 4：导入成功面板（章节数 / 总字数 / 附带的人物与世界观条数）。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `shared/layout/ImportWizard.tsx`。
 * 依赖方向：`./types` →（本文件）→ 门面。
 */
import { Check } from 'lucide-react';
import { formatWordCount } from '@/shared/lib/utils';
import type { ExtractedMeta } from './types';

interface DoneStepProps {
  chapterCount: number;
  totalWords: number;
  meta: ExtractedMeta | null;
}

export function DoneStep({ chapterCount, totalWords, meta }: DoneStepProps) {
  return (
    <div className="text-center py-8 space-y-3">
      <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
        <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
      </div>
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">导入成功！</p>
      <p className="text-sm text-zinc-500">
        已导入 {chapterCount} 章，共 {formatWordCount(totalWords)}
        {meta && `，含 ${meta.characters.length} 个人物、${meta.worldSettings.length} 条世界观`}
      </p>
    </div>
  );
}
