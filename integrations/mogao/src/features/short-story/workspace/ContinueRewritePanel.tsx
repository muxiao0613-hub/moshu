/**
 * 短篇写作台 · AI 面板「续写 / 改写」页签：选中文本提示、续写与改写指令、生成结尾、补足字数、全文精修。
 *
 * 在拆分中的位置：workspace 的展示组件，由 AiPanel 渲染；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./useStoryGeneration 的接口类型 + ./types + @/shared/ui 与 lucide-react，不依赖其它展示组件。
 */
import { BookOpenCheck, ChevronRight, Loader2, PenLine, Sparkles, Wand2 } from 'lucide-react';
import type { PlatformConfig } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import { Textarea } from '@/shared/ui/textarea';
import type { StoryGenerationApi } from './types';

export interface ContinueRewritePanelProps {
  generation: StoryGenerationApi;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  /** 编辑器中当前选中的文本，改写模式依赖它 */
  selectedText: string;
  wordCount: number;
}

export function ContinueRewritePanel({ generation, pc, selectedText, wordCount }: ContinueRewritePanelProps) {
  const {
    tab, loading, continueInstr, setContinueInstr, rewriteInstr, setRewriteInstr,
    revisionInstr, setRevisionInstr, handleContinue, handleRewrite, handleGenerateEndings,
    handleCompleteToTarget, handleReviseFull,
  } = generation;

  return (
    <>
      {tab === 'rewrite' && (
        <div className={cn('mb-2 px-2.5 py-2 rounded-lg text-xs border',
          selectedText ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 line-clamp-2'
                       : 'border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-400 italic')}>
          {selectedText || '请先在编辑器中选中要改写的文字'}
        </div>
      )}

      <Textarea
        value={tab === 'continue' ? continueInstr : rewriteInstr}
        onChange={e => tab === 'continue' ? setContinueInstr(e.target.value) : setRewriteInstr(e.target.value)}
        placeholder={tab === 'continue' ? '续写要求（可为空）...' : '改写要求，如：加强画面感...'}
        rows={3} className="text-sm resize-none mb-2"
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            tab === 'continue' ? handleContinue() : (selectedText && handleRewrite());
          }
        }}
      />
      <button onClick={() => tab === 'continue' ? handleContinue() : handleRewrite()}
        disabled={!!loading || (tab === 'rewrite' && !selectedText)}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
        style={{ backgroundColor: pc.color }}>
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" />生成中...</>
          : tab === 'continue' ? <><ChevronRight className="h-4 w-4" />续写</>
          : <><PenLine className="h-4 w-4" />AI 改写</>}
      </button>
      {tab === 'continue' && (
        <button onClick={handleGenerateEndings} disabled={!!loading || wordCount < 300}
          className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
          style={{ borderColor: pc.color, color: pc.color }}>
          {loading === 'ending' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成结尾中...</> : <><Sparkles className="h-3.5 w-3.5" />生成 3 种结尾</>}
        </button>
      )}
      {tab === 'continue' && (
        <button onClick={handleCompleteToTarget} disabled={!!loading || wordCount < 300}
          className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
          style={{ borderColor: pc.color, color: pc.color }}>
          {loading === 'completeTarget' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />补足中...</> : <><BookOpenCheck className="h-3.5 w-3.5" />补足到目标字数</>}
        </button>
      )}
      {tab === 'rewrite' && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <p className="text-xs font-medium text-zinc-500">全文精修</p>
          <Textarea value={revisionInstr} onChange={e => setRevisionInstr(e.target.value)}
            placeholder="全文精修要求（可为空）：如加强悬疑感、减少说教、强化结尾回收..." rows={2}
            className="text-xs resize-none" />
          <button onClick={handleReviseFull} disabled={!!loading || wordCount < 200}
            className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium border disabled:opacity-40"
            style={{ borderColor: pc.color, color: pc.color }}>
            {loading === 'reviseFull' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />精修中...</> : <><Wand2 className="h-3.5 w-3.5" />一键全文精修</>}
          </button>
        </div>
      )}
      <p className="text-xs text-zinc-400 text-center mt-1">Ctrl+Enter 发送</p>
    </>
  );
}
