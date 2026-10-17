/**
 * 短篇写作台 · 中栏「写作画布」：标题编辑、核心一句话引用、空态引导、tiptap 正文与平台格式提示。
 *
 * 在拆分中的位置：workspace 的展示组件，由 StoryWorkspaceView 渲染；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./StatusBadges + ./types + @tiptap/react + @/shared 通用工具，不依赖任何 hook。
 */
import { EditorContent } from '@tiptap/react';
import { AlertTriangle, Layers, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type { FormatIssue, PlatformConfig } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import type { ShortStory, StoryPlotPoint, ShortStoryQualityReport } from '@/shared/types';
import { Chip } from './StatusBadges';
import type { TipTapEditor } from './types';

export interface WritingCanvasProps {
  story: ShortStory;
  editor: TipTapEditor;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  titleInput: string;
  wordCount: number;
  hasPremise: boolean;
  /** 已填写内容的骨架节点数 */
  filled: number;
  plotPoints: StoryPlotPoint[];
  isLikelyCompleteDraft: boolean;
  loading: string | null;
  qualityReport: ShortStoryQualityReport | null;
  /** 下一步引导文案 */
  nextTip: string;
  fmtIssues: FormatIssue[];
  hasErr: boolean;
  onTitleChange: (value: string) => void;
  onTitleBlur: (value: string) => void;
  onOneClickFullDraft: () => void;
  onGenerateStructure: () => void;
}

export function WritingCanvas({
  story, editor, pc, titleInput, wordCount, hasPremise, filled, plotPoints,
  isLikelyCompleteDraft, loading, qualityReport, nextTip, fmtIssues, hasErr,
  onTitleChange, onTitleBlur, onOneClickFullDraft, onGenerateStructure,
}: WritingCanvasProps) {
  return (
    <main className="flex-1 min-w-0 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-5 py-8 md:px-12 md:py-12 min-h-full">
          <input
            type="text"
            value={titleInput}
            onChange={e => onTitleChange(e.target.value)}
            onBlur={e => onTitleBlur(e.target.value)}
            placeholder="无标题故事"
            className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 outline-none border-b-2 border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 pb-2 w-full bg-transparent placeholder:text-zinc-300 dark:placeholder:text-zinc-700 placeholder:font-bold"
          />
          {story.premise?.trim() && (
            <p className="text-sm text-zinc-400 dark:text-zinc-500 italic mt-3 leading-relaxed pl-3 border-l-2" style={{ borderColor: `${pc.color}50` }}>
              {story.premise}
            </p>
          )}

          {/* 空态：全页唯一的引导入口 */}
          {wordCount === 0 && (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/60 p-8 text-center">
              <div className="h-12 w-12 rounded-2xl flex items-center justify-center text-white mx-auto mb-4" style={{ backgroundColor: pc.color }}>
                <Wand2 className="h-5 w-5" />
              </div>
              <p className="text-base font-semibold text-zinc-800 dark:text-zinc-100">开始你的短篇</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">{nextTip}</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                <button onClick={onOneClickFullDraft} disabled={!!loading}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40 shadow-sm"
                  style={{ backgroundColor: pc.color }}>
                  {loading === 'oneClickFull' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  一键自动成稿
                </button>
                <button onClick={onGenerateStructure} disabled={!!loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 px-5 py-2.5 text-sm text-zinc-600 dark:text-zinc-300 disabled:opacity-40">
                  <Layers className="h-4 w-4" />先生成骨架
                </button>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
                <Chip ok={hasPremise} label="核心已锁定" color={pc.color} />
                <Chip ok={filled === plotPoints.length && filled > 0} label="骨架完整" color={pc.color} />
                <Chip ok={isLikelyCompleteDraft} label="正文成篇" color={pc.color} />
                <Chip ok={!!qualityReport && qualityReport.totalScore >= 75} label="质检通过" color={pc.color} />
              </div>
            </div>
          )}

          <div className="tiptap-editor min-h-[360px] mt-8">
            <EditorContent editor={editor} />
          </div>

          {wordCount > 0 && !isLikelyCompleteDraft && (
            <p className="mt-5 text-xs leading-relaxed text-amber-600 dark:text-amber-400">
              正文可能还没到完整短篇长度，可在右侧「续写 → 补足到目标字数」，或重新一键成稿。
            </p>
          )}
        </div>
      </div>

      {story.platform !== '自由创作' && fmtIssues.some(f => f.type !== 'ok') && (
        <div className={cn('shrink-0 px-6 py-2 border-t text-xs flex items-center gap-3 flex-wrap',
          hasErr ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                 : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900')}>
          <AlertTriangle className={cn('h-3.5 w-3.5 shrink-0', hasErr ? 'text-red-500' : 'text-amber-500')} />
          <span className={cn('font-medium', hasErr ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>{story.platform}</span>
          {fmtIssues.filter(f => f.type !== 'ok').map((iss, i) => (
            <span key={i} className={iss.type === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>⚠ {iss.label}</span>
          ))}
        </div>
      )}
    </main>
  );
}
