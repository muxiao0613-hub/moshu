/**
 * 短篇写作台 · AI 面板「生成全文」页签：一键自动成稿、生成并选择 3 种开头、基于选中开头生成全文。
 *
 * 在拆分中的位置：workspace 的展示组件，由 AiPanel 渲染；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./useStoryGeneration 的接口类型 + ./types + lucide-react，不依赖其它展示组件。
 */
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { PlatformConfig } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import type { StoryGenerationApi } from './types';

export interface FullDraftPanelProps {
  generation: StoryGenerationApi;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  /** 已填写内容的骨架节点数 */
  filled: number;
}

export function FullDraftPanel({ generation, pc, filled }: FullDraftPanelProps) {
  const {
    loading, openingsLoading, openings, chosenIdx, setChosenIdx, setOpenings,
    handleOneClickFullDraft, handleGenerateOpenings, handleGenerateFull,
  } = generation;

  return (
    <div className="space-y-2">
      <div className="rounded-xl border p-3 text-xs space-y-2" style={{ borderColor: `${pc.color}35`, backgroundColor: `${pc.color}08` }}>
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" style={{ color: pc.color }} />
          <div>
            <p className="font-semibold text-zinc-800 dark:text-zinc-100">新手推荐：一键自动成稿</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">自动按你的核心一句话完成骨架、开头和全文，并直接写入中间正文区。写完后右侧会切到「质检」，不会再停留在选择开头界面。</p>
          </div>
        </div>
        <button onClick={handleOneClickFullDraft} disabled={!!loading || openingsLoading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
          style={{ backgroundColor: pc.color }}>
          {loading === 'oneClickFull' ? <><Loader2 className="h-4 w-4 animate-spin" />自动创作中...</> : <><Wand2 className="h-4 w-4" />一键自动成稿并写入正文</>}
        </button>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-400"><div className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" />专业分步流程<div className="h-px bg-zinc-200 dark:bg-zinc-700 flex-1" /></div>
      {openings.length === 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs text-zinc-400">先生成 3 种开头，选好再生成全文</p>
          <button onClick={handleGenerateOpenings} disabled={!!loading || openingsLoading || filled === 0}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border-2 disabled:opacity-40"
            style={{ borderColor: pc.color, color: pc.color }}>
            {openingsLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成开头中...</> : <><Sparkles className="h-3.5 w-3.5" />生成 3 种开头（推荐）</>}
          </button>
          <button onClick={() => handleGenerateFull(true)} disabled={!!loading || openingsLoading}
            className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 disabled:opacity-40">
            {loading === 'full' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />生成中...</> : '跳过，直接生成全文'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">选择开头风格</p>
            <button onClick={() => { setOpenings([]); setChosenIdx(null); }} className="text-[10px] text-zinc-400 hover:text-zinc-600">重新生成</button>
          </div>
          {openings.map((o, i) => (
            <div key={i} onClick={() => setChosenIdx(i)}
              className={cn('cursor-pointer rounded-lg p-3 border leading-relaxed', chosenIdx === i ? '' : 'border-zinc-200 dark:border-zinc-700')}
              style={chosenIdx === i ? { borderColor: pc.color, backgroundColor: `${pc.color}12` } : {}}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                  style={{ borderColor: chosenIdx === i ? pc.color : '#a1a1aa' }}>
                  {chosenIdx === i && <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pc.color }} />}
                </div>
                <span className="font-medium text-xs" style={{ color: chosenIdx === i ? pc.color : undefined }}>
                  {['直入冲突', '反常陈述', '场景氛围'][i] || `开头 ${i + 1}`}
                </span>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap max-h-44 overflow-auto"
                style={{ fontFamily: 'Noto Serif SC, SimSun, serif' }}>{o}</p>
            </div>
          ))}
          <button onClick={() => handleGenerateFull(false)} disabled={!!loading || chosenIdx === null}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: pc.color }}>
            {loading === 'full' ? <><Loader2 className="h-4 w-4 animate-spin" />生成中...</> : <><Wand2 className="h-4 w-4" />基于选中开头生成全文</>}
          </button>
        </div>
      )}
    </div>
  );
}
