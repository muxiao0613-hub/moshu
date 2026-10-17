/**
 * 短篇写作台 · 左栏「故事设定」：核心一句话、故事骨架（可展开的逐节点编辑）与风格约束。
 *
 * 在拆分中的位置：workspace 的展示组件，由 StoryWorkspaceView 渲染（桌面常驻列 / 手机抽屉）；
 * 对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 lucide-react、@/shared 通用工具与 ./types，不依赖任何 hook。
 */
import { Check, ChevronDown, Layers, Loader2, Sparkles, X } from 'lucide-react';
import type { PlatformConfig } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import type { DrawerSwipe } from './types';

export interface StorySetupPanelProps {
  story: ShortStory;
  /** 当前平台配置，仅用于取主题色 */
  pc: PlatformConfig;
  plotPoints: StoryPlotPoint[];
  /** 已填写内容的骨架节点数 */
  filled: number;
  /** 正在进行的操作 key，用于禁用按钮与显示 loading */
  loading: string | null;
  expandedPt: string | null;
  styleOpen: boolean;
  /** 手机端抽屉是否展开 */
  drawerOpen: boolean;
  swipe: DrawerSwipe;
  /** 桌面端拖出来的宽度（手机端是覆盖抽屉，仍受 max-w 限制） */
  width?: number;
  onClose: () => void;
  onToggleExpanded: (ptId: string | null) => void;
  onToggleStyleOpen: () => void;
  onEnhancePremise: () => void;
  onGenerateStructure: () => void;
  onUpdateField: (field: Partial<ShortStory>) => void;
  onUpdatePlotPoint: (ptId: string, content: string) => void;
}

export function StorySetupPanel({
  story, pc, plotPoints, filled, loading, expandedPt, styleOpen, drawerOpen, swipe,
  width, onClose, onToggleExpanded, onToggleStyleOpen, onEnhancePremise, onGenerateStructure,
  onUpdateField, onUpdatePlotPoint,
}: StorySetupPanelProps) {
  return (
    <aside {...swipe.handlers} style={{ ...swipe.style, ...(width ? { width, maxWidth: '65vw' } : {}) }} className={cn(
      'w-72 max-w-[85vw] shrink-0 flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-y-auto',
      'fixed inset-y-0 left-0 z-40 shadow-2xl transition-transform duration-300 ease-out',
      drawerOpen ? 'translate-x-0' : '-translate-x-full',
      'md:w-64 md:static md:z-auto md:translate-x-0 md:shadow-none',
    )}>
      {/* 手机端抽屉标题栏 */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">故事设定</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-4 w-4" /></button>
      </div>

      {/* 核心一句话 */}
      <section className="px-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">核心一句话</h3>
          <button onClick={onEnhancePremise} disabled={!!loading}
            className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-70 disabled:opacity-30" style={{ color: pc.color }}>
            {loading === 'premise' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}AI 补强
          </button>
        </div>
        <textarea value={story.premise || ''} onChange={e => onUpdateField({ premise: e.target.value })}
          placeholder="谁，遇到什么无法回避的麻烦，必须做出什么选择？" rows={3}
          className="w-full text-sm text-zinc-700 dark:text-zinc-200 bg-transparent resize-none outline-none placeholder-zinc-300 dark:placeholder-zinc-600 leading-relaxed" />
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">最高优先级：AI 只能补强细节，不会换题或重写。</p>
      </section>

      {/* 故事骨架 */}
      <section className="border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between px-4 py-2.5">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" />故事骨架
            {plotPoints.length > 0 && (
              <span className="font-normal normal-case tracking-normal" style={{ color: filled === plotPoints.length ? pc.color : '#a1a1aa' }}>{filled}/{plotPoints.length}</span>
            )}
          </h3>
          <button onClick={onGenerateStructure} disabled={!!loading}
            className="flex items-center gap-1 text-[11px] font-medium transition-opacity hover:opacity-70 disabled:opacity-30" style={{ color: pc.color }}>
            {loading === 'structure' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{plotPoints.length ? '重生成' : '生成'}
          </button>
        </div>

        {plotPoints.length === 0 ? (
          <div className="px-4 pb-4 text-center">
            <p className="text-xs text-zinc-400 mb-2.5 leading-relaxed">把核心一句话拆成可以逐段写的场景节点</p>
            <button onClick={onGenerateStructure} disabled={!!loading || !story.premise?.trim()}
              className="text-xs px-3.5 py-2 rounded-lg font-medium disabled:opacity-40"
              style={{ backgroundColor: `${pc.color}15`, color: pc.color }}>
              {story.premise?.trim() ? '✨ AI 生成骨架' : '请先写核心一句话'}
            </button>
          </div>
        ) : (
          <div className="pb-1">
            {plotPoints.map((pt, idx) => {
              const open   = expandedPt === pt.id;
              const isFull = !!pt.content?.trim();
              return (
                <div key={pt.id}>
                  <button onClick={() => onToggleExpanded(open ? null : pt.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors">
                    <span className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: isFull ? pc.color : `${pc.color}20`, color: isFull ? '#fff' : pc.color }}>
                      {isFull ? <Check className="h-3 w-3" /> : idx + 1}
                    </span>
                    <span className="flex-1 text-xs text-zinc-600 dark:text-zinc-300 truncate">{pt.label}</span>
                    <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-300 shrink-0 transition-transform', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="px-4 pb-2.5 pt-0.5">
                      {pt.hint && <p className="text-[11px] text-zinc-400 italic mb-1.5">{pt.hint}</p>}
                      <textarea autoFocus value={pt.content || ''} onChange={e => onUpdatePlotPoint(pt.id, e.target.value)}
                        placeholder="这一段发生了什么..." rows={3}
                        className="w-full text-xs text-zinc-700 dark:text-zinc-200 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-2.5 py-2 resize-none outline-none leading-relaxed border placeholder-zinc-300 dark:placeholder-zinc-600"
                        style={{ borderColor: `${pc.color}40` }}
                        onKeyDown={e => { if (e.key === 'Tab') { e.preventDefault(); const nx = plotPoints[idx + 1]; if (nx) onToggleExpanded(nx.id); } }}
                      />
                    </div>
                  )}
                  {!open && isFull && <p className="px-11 pb-2 text-[11px] text-zinc-400 leading-relaxed line-clamp-1">{pt.content}</p>}
                </div>
              );
            })}
            <div className="px-4 pt-1.5 pb-3">
              <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${(filled / plotPoints.length) * 100}%`, backgroundColor: pc.color }} />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 风格约束 */}
      <section>
        <button onClick={onToggleStyleOpen}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-600 dark:hover:text-zinc-300">
          风格约束 <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', styleOpen && 'rotate-180')} />
        </button>
        {styleOpen && (
          <div className="px-4 pb-3">
            <textarea value={story.styleConstraint || ''} onChange={e => onUpdateField({ styleConstraint: e.target.value })}
              placeholder="语气、禁忌词、特殊要求..." rows={3}
              className="w-full text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800 rounded-lg px-2.5 py-2 resize-none outline-none leading-relaxed border border-zinc-200 dark:border-zinc-700 placeholder-zinc-300 dark:placeholder-zinc-600" />
          </div>
        )}
      </section>
    </aside>
  );
}
