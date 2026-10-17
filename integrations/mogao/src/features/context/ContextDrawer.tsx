import { useMemo, useState } from 'react';
import { Info, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { buildChapterSystemPrompt } from '@/features/ai/aiService';
import { cn } from '@/shared/lib/utils';
import { workRefinePath } from '@/shared/lib/workRoutes';
import { ContextGroupSection } from './ContextGroupSection';
import type { ContextRowActions } from './ContextItemRow';
import { buildContextPlan, type ContextItem } from './contextPlan';
import {
  TIER_HINT, TIER_LABEL, clearExcludedForChapter, clearOff, saveGlobalBudget,
  toggleIn, updateContextPrefs, useContextPrefs, type GenerationTier,
} from './contextPrefs';
import { useContextBundle } from './useContextBundle';

/**
 * 上下文抽屉：**这一章 AI 看到了什么**（看 / 开关 / 固定 / 排除 / 预览）。
 *
 * 关键点：这里的每一条、每一个 token 数、每一个「为什么没注入」都来自
 * `buildContextPlan()`（contextPlan.ts）——**与生成链路同一个函数**，
 * 所以面板上看到的就是真正喂进 prompt 的东西，不存在两套规则。
 *
 * 设定本身不在这里改（那种表单是「完善台」的职责），需要改就顺着每条的
 * 「去完善台改」跳过去；写作台右栏因此保持只有一件事：调这一次的上下文。
 */
export function ContextDrawer({ projectId, chapterId }: { projectId: string; chapterId?: string }) {
  const prefs = useContextPrefs(projectId);
  const { bundle, loading, failed, reload, prevSummary } = useContextBundle(projectId, chapterId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showPreview, setShowPreview] = useState(false);

  const plan = useMemo(() => {
    if (!bundle) return null;
    return buildContextPlan({
      project: bundle.project,
      chapter: bundle.chapter ?? null,
      characters: bundle.characters,
      worldSettings: bundle.worldSettings,
      outlines: bundle.outlines,
      threads: bundle.threads,
      storyBible: bundle.storyBible ?? null,
      factLedger: bundle.facts,
      styleFingerprint: bundle.project.styleFingerprint ?? null,
      styleSamples: bundle.project.styleSamples ?? null,
      ragChunks: bundle.ragChunks,
      prevChapterSummary: prevSummary,
      prefs,
    });
  }, [bundle, prevSummary, prefs]);

  const preview = useMemo(() => {
    if (!bundle || !showPreview) return '';
    return buildChapterSystemPrompt({
      project: bundle.project,
      chapter: bundle.chapter ?? null,
      characters: bundle.characters,
      worldSettings: bundle.worldSettings,
      outlines: bundle.outlines,
      threads: bundle.threads,
      prevChapterSummary: prevSummary,
      storyBible: bundle.storyBible ?? null,
      factLedger: bundle.facts,
      styleFingerprint: bundle.project.styleFingerprint ?? null,
      ragChunks: bundle.ragChunks,
      prefs,
    }).prompt;
  }, [bundle, prevSummary, prefs, showPreview]);

  const toggleOff = (id: string) => updateContextPrefs(projectId, p => ({ ...p, off: toggleIn(p.off, id) }));
  const togglePin = (id: string) => updateContextPrefs(projectId, p => ({ ...p, pinned: toggleIn(p.pinned, id) }));

  /**
   * 实体条目 → 完善台里的编辑地址。
   *
   * 映射只此一份：人物/世界观/伏笔各回各的设定标签，事实账本与故事圣经都在「评审」屏
   * （`features/quality/lab/FactsPanel` / `StoryBiblePanel`）。
   */
  const entityEditHref = (item: ContextItem): string | null => {
    switch (item.entity?.kind) {
      case 'character': return workRefinePath(projectId, 'characters');
      case 'world': return workRefinePath(projectId, 'world');
      case 'thread': return workRefinePath(projectId, 'threads');
      case 'fact': return workRefinePath(projectId, 'review');
      default: return null;
    }
  };

  /** 抽屉注入给每一行的动作：行内只负责画，状态与写入都留在这里。 */
  const actions: ContextRowActions = {
    isExpanded: id => !!expanded[id],
    onToggleExpand: id => setExpanded(s => ({ ...s, [id]: !s[id] })),
    editHref: entityEditHref,
    onToggleOff: toggleOff,
    onTogglePin: togglePin,
    onToggleExcluded: id => {
      if (!chapterId) return;
      updateContextPrefs(projectId, p => {
        const current = p.excludedByChapter[chapterId] ?? [];
        return { ...p, excludedByChapter: { ...p.excludedByChapter, [chapterId]: toggleIn(current, id) } };
      });
    },
  };

  const totalInjected = plan?.injectedTokens ?? 0;
  const budget = plan?.budget ?? 0;
  const budgetPct = budget > 0 ? Math.min(100, Math.round((totalInjected / budget) * 100)) : 0;
  const offCount = prefs.off.length;
  const pinnedCount = prefs.pinned.length;
  const excludedCount = chapterId ? (prefs.excludedByChapter[chapterId] ?? []).length : 0;

  return (
    <aside className="w-full h-full flex flex-col bg-white dark:bg-zinc-950 overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-medium">上下文</h2>
          </div>
          <button
            onClick={reload}
            disabled={loading}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            title="重新计算"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{totalInjected.toLocaleString()}</span>
          <span className="text-xs text-zinc-500">tokens 估算 · 本次实际注入</span>
        </div>

        {/* 预算条 */}
        <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <div
            className={cn('h-full', budgetPct >= 100 ? 'bg-amber-500' : 'bg-indigo-500')}
            style={{ width: `${budget > 0 ? Math.max(2, budgetPct) : 100}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-[11px] text-zinc-400">
            <SlidersHorizontal className="h-3 w-3" />
            预算
            <input
              type="number"
              min={0}
              step={1000}
              value={budget}
              onChange={e => {
                const next = Math.max(0, Number(e.target.value) || 0);
                saveGlobalBudget(next);
                updateContextPrefs(projectId, p => ({ ...p, tokenBudget: next }));
              }}
              className="w-16 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-0.5 text-[11px] tabular-nums"
            />
            <span>tokens{budget === 0 ? '（0 = 不限）' : ''}</span>
          </label>
          {plan?.overBudget && <span className="text-[11px] text-amber-600 dark:text-amber-500">已按优先级裁剪</span>}
        </div>

        {/* 档位 */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-400">档位</span>
          {(['steady', 'normal', 'bold'] as GenerationTier[]).map(t => (
            <button
              key={t}
              type="button"
              title={TIER_HINT[t]}
              onClick={() => updateContextPrefs(projectId, p => ({ ...p, tier: t }))}
              className={cn(
                'rounded px-2 py-0.5 text-[11px] border transition-colors',
                prefs.tier === t
                  ? 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
              )}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>

        {(offCount > 0 || pinnedCount > 0 || excludedCount > 0) && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
            <span>
              {offCount > 0 && `关闭 ${offCount}`}
              {offCount > 0 && (pinnedCount > 0 || excludedCount > 0) && ' · '}
              {pinnedCount > 0 && `固定 ${pinnedCount}`}
              {pinnedCount > 0 && excludedCount > 0 && ' · '}
              {excludedCount > 0 && `本章排除 ${excludedCount}`}
            </span>
            <button
              type="button"
              onClick={() => {
                clearOff(projectId);
                if (chapterId) clearExcludedForChapter(projectId, chapterId);
              }}
              className="inline-flex items-center gap-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <RotateCcw className="h-3 w-3" /> 重置
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowPreview(v => !v)}
          className="mt-2 text-[11px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
        >
          {showPreview ? '收起' : '查看'}本次注入预览（最终拼出的 system prompt）
        </button>
        {showPreview && (
          <>
            <pre className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2 text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
              {preview}
            </pre>
            <p className="mt-1 text-[11px] text-zinc-400">
              预览基于已保存的正文；在对话面板续写时，编辑器里未保存的改动也会一并带上。
            </p>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {failed && <p className="text-xs text-red-500">上下文数据加载失败，请稍后重试。</p>}

        {!failed && loading && !bundle && (
          <p className="text-xs text-zinc-400">正在读取本项目的人物/设定/伏笔/账本…</p>
        )}

        {!chapterId && bundle && (
          <p className="text-xs text-zinc-400">未选中章节，仅显示项目级上下文（人物/世界观/伏笔按全集统计）。</p>
        )}

        {plan && (
          <>
            <ContextGroupSection
              sectionKey="hard"
              title="硬约束"
              hint="不参与 token 预算裁剪（仍受条数上限约束）"
              icon={<ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />}
              groups={plan.groups}
              prefs={prefs}
              chapterId={chapterId}
              actions={actions}
            />
            <ContextGroupSection
              sectionKey="auto"
              title="自动检索"
              hint="预算不足时按 跨章检索 → 风格指纹 → 上章摘要 → 世界观 → 伏笔 → 人物 的顺序放弃"
              icon={<Search className="h-3.5 w-3.5 text-emerald-500" />}
              groups={plan.groups}
              prefs={prefs}
              chapterId={chapterId}
              actions={actions}
            />
          </>
        )}

        {plan && (
          <p className="flex items-start gap-1 text-[11px] leading-4 text-zinc-400">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              开关/固定/排除会真实改变下一次生成的 prompt（与上方预览一致）。
              偏好保存在本机，按作品隔离；换设备不同步。
            </span>
          </p>
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-zinc-200 dark:border-zinc-800">
        <p className="text-[11px] leading-4 text-zinc-400">
          依据「正文续写」链路（callNovelAI）的真实规则渲染，未做任何美化。
          整章生成（generateFullChapterContent）另会注入本章节拍卡与蓝图。
          人物/世界观/伏笔/账本要改内容，用每条的「去完善台改」。
        </p>
      </div>
    </aside>
  );
}
