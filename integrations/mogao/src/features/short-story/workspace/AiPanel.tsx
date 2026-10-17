/**
 * 短篇写作台 · 右栏「AI 助手」：模式页签、短篇成稿检查清单、错误提示、流式结果画布与插入/替换操作。
 *
 * 在拆分中的位置：workspace 的展示组件，由 StoryWorkspaceView 渲染（桌面常驻列 / 手机抽屉）；
 * 对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./FullDraftPanel / ./ContinueRewritePanel / ./ReviewPanel / ./QualityCard / ./StatusBadges
 * + ./types + ./useStoryGeneration 的接口类型，不依赖任何 hook。
 */
import type { ReactNode, RefObject } from 'react';
import {
  AlertTriangle, ArrowDownToLine, BookOpenCheck, Check, ChevronDown, ChevronRight, Copy,
  Loader2, PenLine, RotateCcw, ShieldCheck, Wand2, X,
} from 'lucide-react';
import type { FormatIssue, PlatformConfig } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import { ContinueRewritePanel } from './ContinueRewritePanel';
import { FullDraftPanel } from './FullDraftPanel';
import { QualityCard } from './QualityCard';
import { ReviewPanel } from './ReviewPanel';
import { CraftItem } from './StatusBadges';
import type { DrawerSwipe, PanelTab, StoryGenerationApi } from './types';

export interface AiPanelProps {
  story: ShortStory;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  /** 已填写内容的骨架节点数 */
  filled: number;
  plotPoints: StoryPlotPoint[];
  wordCount: number;
  /** 下一步引导文案 */
  nextTip: string;
  fmtIssues: FormatIssue[];
  canvasRef: RefObject<HTMLDivElement>;
  /** 手机端抽屉是否展开 */
  drawerOpen: boolean;
  swipe: DrawerSwipe;
  generation: StoryGenerationApi;
  /** 编辑器中当前选中的文本，改写模式依赖它 */
  selectedText: string;
  /** 桌面端拖出来的宽度（手机端是覆盖抽屉，仍受 max-w 限制） */
  width?: number;
  onClose: () => void;
}

export function AiPanel({
  story, pc, filled, plotPoints, wordCount, nextTip, fmtIssues, canvasRef,
  drawerOpen, swipe, generation, selectedText, width, onClose,
}: AiPanelProps) {
  const {
    endings, resultMode, tab, setTab, loading, error, setError, canvas, streamText, resultText, streamLabel,
    qualityReport, copied, craftOpen, setCraftOpen, clearCanvas, insertResult, copyText,
    setOpenings, setChosenIdx,
  } = generation;

  return (
    <aside {...swipe.handlers} style={{ ...swipe.style, ...(width ? { width, maxWidth: '70vw' } : {}) }} className={cn(
      'w-80 max-w-[88vw] shrink-0 flex flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900',
      'fixed inset-y-0 right-0 z-40 shadow-2xl transition-transform duration-300 ease-out',
      drawerOpen ? 'translate-x-0' : 'translate-x-full',
      'md:static md:z-auto md:translate-x-0 md:shadow-none',
    )}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <Wand2 className="h-4 w-4 shrink-0" style={{ color: pc.color }} />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">AI 助手</span>
        <div className="ml-auto flex items-center gap-1">
          {(canvas === 'streaming' || canvas === 'done') && (
            <button onClick={clearCanvas} className="text-zinc-400 hover:text-zinc-600" title="清除结果"><RotateCcw className="h-4 w-4" /></button>
          )}
          <button onClick={onClose} className="md:hidden text-zinc-400 hover:text-zinc-600" title="关闭"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <div className="flex flex-wrap gap-1">
          {(['full', 'continue', 'rewrite', 'review'] as PanelTab[]).map(m => {
            const labels: Record<PanelTab, { label: string; icon: ReactNode }> = {
              full:     { label: '生成全文', icon: <Wand2 className="h-3.5 w-3.5" /> },
              continue: { label: '续写',     icon: <ChevronRight className="h-3.5 w-3.5" /> },
              rewrite:  { label: '改写',     icon: <PenLine className="h-3.5 w-3.5" /> },
              review:   { label: '质检',     icon: <ShieldCheck className="h-3.5 w-3.5" /> },
            };
            const { label, icon } = labels[m];
            return (
              <button key={m} onClick={() => { setTab(m); clearCanvas(); setOpenings([]); setChosenIdx(null); }}
                className={cn('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  tab === m ? 'text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700')}
                style={tab === m ? { backgroundColor: pc.color } : {}}>
                {icon}{label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        <button onClick={() => setCraftOpen(o => !o)} className="w-full flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          <span className="flex items-center gap-1.5"><BookOpenCheck className="h-3.5 w-3.5" style={{ color: pc.color }} />短篇成稿检查</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', craftOpen && 'rotate-180')} />
        </button>
        {craftOpen && (
          <div className="mt-2 grid grid-cols-1 gap-1.5 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <CraftItem ok={!!story.premise?.trim()} text="单一中心冲突：主角想要、阻力、代价清楚" color={pc.color} />
            <CraftItem ok={filled === plotPoints.length && filled > 0} text="骨架节点完整：每段都能写成具体场景" color={pc.color} />
            <CraftItem ok={fmtIssues.some(f => f.label === '开头有钩子')} text="前三句有异常、悬念或关系压力" color={pc.color} />
            <CraftItem ok={wordCount > 800 && !fmtIssues.some(f => f.label === '细节密度偏低')} text="具身细节足够：物件/声音/触感/动作" color={pc.color} />
            <CraftItem ok={wordCount > 1000 && !fmtIssues.some(f => f.label === '结尾回收弱')} text="结尾回收前文细节，形成余韵" color={pc.color} />
          </div>
        )}
      </div>

      <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
        {tab === 'full' && <FullDraftPanel generation={generation} pc={pc} filled={filled} />}
        {(tab === 'continue' || tab === 'rewrite') && (
          <ContinueRewritePanel generation={generation} pc={pc} selectedText={selectedText} wordCount={wordCount} />
        )}
        {tab === 'review' && <ReviewPanel generation={generation} pc={pc} wordCount={wordCount} />}
      </div>

      {error && (
        <div className="mx-3 mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5 shrink-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {(canvas !== 'idle' || qualityReport) && (
        <div className="flex-1 flex flex-col min-h-0">
          {canvas === 'streaming' && streamLabel && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" style={{ color: pc.color }} />
              <span className="text-xs text-zinc-500">{streamLabel}</span>
            </div>
          )}
          <div ref={canvasRef}
            className={cn('flex-1 overflow-auto px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
              tab !== 'review' ? 'text-zinc-700 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-300',
              canvas === 'streaming' && 'ai-cursor')}
            style={tab !== 'review' ? { fontFamily: 'Noto Serif SC, SimSun, serif' } : {}}>
            {canvas === 'streaming' && streamText}
            {canvas === 'done' && tab !== 'review' && resultText && (
              <>
                <div className="mb-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300" style={{ fontFamily: 'inherit' }}>
                  右侧是 AI 生成预览，不是正式正文；需要点击下方「替换到中间正文」后，中间编辑区才会更新为完整小说。
                </div>
                {resultText}
              </>
            )}
            {endings.map((text, index) => <div key={index} className="border rounded-lg p-3 mb-3"><b>结尾 {index + 1}</b><p>{text}</p><button className="text-ink-600 text-xs" disabled={!!loading} onClick={() => insertResult(text)}>采用此结尾，替换原选段</button></div>)}
            {tab === 'review' && qualityReport && <QualityCard report={qualityReport} color={pc.color} />}
          </div>

          {!loading && canvas === 'done' && resultText && tab !== 'review' && (
            <div className="flex flex-wrap gap-1.5 px-3 py-2 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
              <button onClick={() => copyText(resultText, 'r')}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 flex-1">
                {copied === 'r' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied === 'r' ? '已复制' : '复制'}
              </button>
              <button onClick={() => insertResult(resultText, false)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 flex-1">
                <ArrowDownToLine className="h-3.5 w-3.5" />{resultMode === 'selection' ? '替换原选段' : '插入到光标'}
              </button>
              {tab === 'full' && (
                <button onClick={() => insertResult(resultText, true)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg text-white w-full justify-center"
                  style={{ backgroundColor: pc.color }}>
                  <RotateCcw className="h-3.5 w-3.5" />替换到中间正文
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {canvas === 'idle' && !qualityReport && !error && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3 border-2 border-dashed border-zinc-200 dark:border-zinc-700">
            <Wand2 className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />
          </div>
          <p className="text-xs text-zinc-400">生成结果将在这里显示</p>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-400 max-w-48">{nextTip}</p>
        </div>
      )}
    </aside>
  );
}
