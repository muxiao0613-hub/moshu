import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity, AlignLeft, Bookmark, Flame, Globe, LayoutList, ListChecks, ScanSearch, Sparkles, Users,
} from 'lucide-react';
import { workRefinePath } from '@/shared/lib/workRoutes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { ChapterList } from '@/features/chapter/ChapterList';
import { CharacterList } from '@/features/character/CharacterList';
import { OutlineTree } from '@/features/outline/OutlineTree';
import { QualityLab } from '@/features/quality/QualityLab';
import { WorldList } from '@/features/world/WorldList';
import { REFINE_CHECKUP_TABS, REFINE_SETUP_TABS, REFINE_TABS, isRefineTab, type RefineTab } from './tabs';
import { IssuesView } from './views/IssuesView';
import { AiFlavorView } from './views/AiFlavorView';
import { BatchView } from './views/BatchView';
import { ConflictsView } from './views/ConflictsView';
import { PacingView } from './views/PacingView';
import { ThreadsView } from './views/ThreadsView';

/**
 * 完善台：**写前准备 + 写后修订**，一页两类视图。
 *
 * 为什么把它从写作台里分出来：写作台右栏（上下文抽屉）要回答的是「这一章 AI 看到了什么」，
 * 而设定编辑、伏笔回收、质量体检回答的是「这本书整体对不对」——两件事混在一列里，
 * 写作时那 95% 的时间都会被设定表单挤掉（用户反馈：「布局很紧凑」）。
 *
 * 分工：写作台 = 章节 → 场景 → 正文；完善台 = 设定与体检；右栏抽屉只做「看 + 开关 + 跳转」。
 * 标签状态进 URL（`/work/:id/refine/:tab`），刷新、分享链接、从别处跳「去改 →」回来都不丢位置。
 *
 * 标签清单本身在 `./tabs`（纯数据）：路由映射（`shared/lib/workRoutes.ts`）与旧链接重定向
 * 都引用同一份，拼不出不存在的 tab。
 */
export { REFINE_CHECKUP_TABS, REFINE_SETUP_TABS, REFINE_TABS, isRefineTab };
export type { RefineTab };

export function RefinePage({ projectId }: { projectId: string }) {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const active: RefineTab = isRefineTab(tab) ? tab : 'characters';

  const go = useCallback(
    (next: string) => navigate(workRefinePath(projectId, next as RefineTab)),
    [navigate, projectId],
  );

  return (
    <div className="max-w-7xl mx-auto p-5 md:p-6">
      <div className="mb-4">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-ink-50 px-3 py-1 text-xs text-ink-700 dark:bg-ink-950/40 dark:text-ink-300">
          <LayoutList className="h-3.5 w-3.5" />完善台 · 写之前把设定定下来，写之后把问题改回去
        </div>
        <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">完善台</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          设定组：人物 · 世界观 · 大纲 · 伏笔 · 章节列表；体检组：一致性 · AI 味 · 节奏 · 评审 · 批量体检。
          写作台右栏只保留「本章上下文」，这里改完立刻影响下一次生成。
        </p>
      </div>

      <Tabs value={active} onValueChange={go}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-zinc-400">设定</span>
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="bible"><Bookmark className="mr-1 h-3.5 w-3.5" />故事圣经</TabsTrigger>
              <TabsTrigger value="facts"><ListChecks className="mr-1 h-3.5 w-3.5" />事实账本</TabsTrigger>
              <TabsTrigger value="characters"><Users className="mr-1 h-3.5 w-3.5" />人物档案</TabsTrigger>
              <TabsTrigger value="world"><Globe className="mr-1 h-3.5 w-3.5" />世界观</TabsTrigger>
              <TabsTrigger value="outline"><AlignLeft className="mr-1 h-3.5 w-3.5" />章节大纲</TabsTrigger>
              <TabsTrigger value="threads"><Bookmark className="mr-1 h-3.5 w-3.5" />伏笔回收</TabsTrigger>
              <TabsTrigger value="chapters"><LayoutList className="mr-1 h-3.5 w-3.5" />章节列表</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] text-zinc-400">体检</span>
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="issues"><ListChecks className="mr-1 h-3.5 w-3.5" />问题台账</TabsTrigger>
              <TabsTrigger value="conflicts"><ScanSearch className="mr-1 h-3.5 w-3.5" />一致性冲突</TabsTrigger>
              <TabsTrigger value="ai-flavor"><Sparkles className="mr-1 h-3.5 w-3.5" />AI 味体检</TabsTrigger>
              <TabsTrigger value="pacing"><Activity className="mr-1 h-3.5 w-3.5" />节奏曲线</TabsTrigger>
              <TabsTrigger value="review"><Flame className="mr-1 h-3.5 w-3.5" />评审报告</TabsTrigger>
              <TabsTrigger value="batch"><ListChecks className="mr-1 h-3.5 w-3.5" />批量体检</TabsTrigger>
            </TabsList>
          </div>
        </div>

        {(['bible', 'facts', 'radar', 'beat'] as const).map(view => <TabsContent key={view} value={view} className="mt-4"><QualityLab projectId={projectId} view={view} /></TabsContent>)}
        <TabsContent value="characters" className="mt-4">
          <CharacterList projectId={projectId} />
        </TabsContent>
        <TabsContent value="world" className="mt-4">
          <WorldList projectId={projectId} />
        </TabsContent>
        <TabsContent value="outline" className="mt-4">
          <OutlineTree projectId={projectId} />
        </TabsContent>
        <TabsContent value="threads" className="mt-4">
          {/* 三态看板 + 逾期提示；完整增删改折叠在板子底部（ThreadsView 内部已复用 ThreadBoard） */}
          <ThreadsView projectId={projectId} />
        </TabsContent>
        <TabsContent value="chapters" className="mt-4">
          <ChapterList projectId={projectId} />
        </TabsContent>

        <TabsContent value="issues" className="mt-4"><IssuesView projectId={projectId} /></TabsContent>
        <TabsContent value="conflicts" className="mt-4">
          <ConflictsView projectId={projectId} />
        </TabsContent>
        <TabsContent value="ai-flavor" className="mt-4">
          <AiFlavorView projectId={projectId} />
        </TabsContent>
        <TabsContent value="pacing" className="mt-4">
          <PacingView projectId={projectId} />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <QualityLab projectId={projectId} view="review" />
        </TabsContent>
        <TabsContent value="batch" className="mt-4">
          <BatchView projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
