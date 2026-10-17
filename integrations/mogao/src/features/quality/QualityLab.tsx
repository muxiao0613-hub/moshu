/**
 * 质量中枢（页面级容器）：六个视图的标签页外壳 + 顶部统计与错误提示。
 *
 * 实现已按职责拆到 ./lab（本文件只做渲染编排，保持对外导出 QualityLab 不变）：
 * - lab/useQualityLabData.ts 六张表的读取与刷新（只读数据源）
 * - lab/useQualityLab.ts  生成/保存/改稿动作编排（全部 UI 状态与 useEffect 都在这里）
 * - lab/primitives.tsx    ScorePill / SectionCard / ChapterSelect
 * - lab/*Panel.tsx        各标签页视图（题材雷达 / 故事圣经 / 剧情卡 / 质量评审 / 事实账本 / 去AI化）
 * - lab/utils.ts          纯文本与平台选项工具；lab/types.ts 本地类型
 *
 * 依赖方向：./lab/*、@/shared/ui/*（页面层，不直接请求 @/api）。
 */
import {
  AlertTriangle,
  BookOpenCheck,
  Bot,
  ClipboardCheck,
  DatabaseZap,
  Flame,
  Loader2,
  Radar,
  ShieldCheck,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { AntiAiPanel } from './lab/AntiAiPanel';
import { BeatCardPanel } from './lab/BeatCardPanel';
import { FactsPanel } from './lab/FactsPanel';
import { ReviewPanel } from './lab/ReviewPanel';
import { StoryBiblePanel } from './lab/StoryBiblePanel';
import { TopicRadarPanel } from './lab/TopicRadarPanel';
import type { QualityLabProps } from './lab/types';
import { useQualityLab } from './lab/useQualityLab';

export function QualityLab({ projectId, view }: QualityLabProps) {
  const lab = useQualityLab(projectId);
  const { project, topics, beatCards, facts, reports, error, tab, setTab, loading, streamText } = lab;

  if (!project) return <div className="p-8 text-zinc-400">加载中...</div>;

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-8 space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink-50 dark:bg-ink-950/40 text-ink-700 dark:text-ink-300 text-xs mb-3">
            <ShieldCheck className="h-3.5 w-3.5" /> 长篇质量控制 · 依据校验 · 评审 · 修订
          </div>
          <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">创作依据与评审</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            先锁定故事圣经和事实账本，再用剧情卡、质量评审和局部改稿把章节质量稳定下来。
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
            <b>{topics.length}</b>
            <span className="text-zinc-500 ml-1">题材</span>
          </div>
          <div className="rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
            <b>{beatCards.length}</b>
            <span className="text-zinc-500 ml-1">剧情卡</span>
          </div>
          <div className="rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
            <b>{facts.length}</b>
            <span className="text-zinc-500 ml-1">事实</span>
          </div>
          <div className="rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
            <b>{reports.length}</b>
            <span className="text-zinc-500 ml-1">评审</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      <Tabs value={view ?? tab} onValueChange={setTab}>
        {!view && <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="radar">
            <Radar className="h-3.5 w-3.5 mr-1" />
            题材雷达
          </TabsTrigger>
          <TabsTrigger value="bible">
            <BookOpenCheck className="h-3.5 w-3.5 mr-1" />
            故事圣经
          </TabsTrigger>
          <TabsTrigger value="beat">
            <ClipboardCheck className="h-3.5 w-3.5 mr-1" />
            章节剧情卡
          </TabsTrigger>
          <TabsTrigger value="review">
            <Flame className="h-3.5 w-3.5 mr-1" />
            质量评审
          </TabsTrigger>
          <TabsTrigger value="facts">
            <DatabaseZap className="h-3.5 w-3.5 mr-1" />
            事实账本
          </TabsTrigger>
          <TabsTrigger value="antiai">
            <Bot className="h-3.5 w-3.5 mr-1" />
            去AI化
          </TabsTrigger>
        </TabsList>}

        <TopicRadarPanel lab={lab} />
        <StoryBiblePanel lab={lab} />
        <BeatCardPanel lab={lab} />
        <ReviewPanel lab={lab} />
        <FactsPanel lab={lab} />
        <AntiAiPanel lab={lab} />
      </Tabs>

      {streamText && (
        <div className="rounded-2xl border border-ink-200 dark:border-ink-900 bg-ink-50/60 dark:bg-ink-950/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {loading ? 'AI 正在输出' : '操作结果'}
          </div>
          <pre className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300 max-h-64 overflow-auto">
            {streamText}
          </pre>
        </div>
      )}
    </div>
  );
}
