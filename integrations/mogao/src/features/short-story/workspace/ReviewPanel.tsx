/**
 * 短篇写作台 · AI 面板「质检」页签：AI 深度质检与上线前终审（结果直接替换中间正文）。
 *
 * 在拆分中的位置：workspace 的展示组件，由 AiPanel 渲染；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./useStoryGeneration 的接口类型 + lucide-react，不依赖其它展示组件。
 */
import { BookOpenCheck, Loader2, ShieldCheck } from 'lucide-react';
import type { PlatformConfig } from '@/shared/lib/storyRules';
import type { StoryGenerationApi } from './types';

export interface ReviewPanelProps {
  generation: StoryGenerationApi;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  wordCount: number;
}

export function ReviewPanel({ generation, pc, wordCount }: ReviewPanelProps) {
  const { loading, handleReview, handlePublishReadyRevise } = generation;

  return (
    <div className="space-y-2">
      <button onClick={handleReview} disabled={!!loading}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
        style={{ backgroundColor: pc.color }}>
        {loading === 'review' ? <><Loader2 className="h-4 w-4 animate-spin" />质检中...</> : <><ShieldCheck className="h-4 w-4" />AI 深度质检</>}
      </button>
      <button onClick={handlePublishReadyRevise} disabled={!!loading || wordCount < 300}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border disabled:opacity-40"
        style={{ borderColor: pc.color, color: pc.color }}>
        {loading === 'publishReady' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />终审中...</> : <><BookOpenCheck className="h-3.5 w-3.5" />上线前终审并替换正文</>}
      </button>
      <p className="text-[10px] leading-relaxed text-zinc-400">建议流程：先质检看问题；确认方向后点「上线前终审」。终审会自动保存旧版本，结果直接写入中间正文区。</p>
    </div>
  );
}
