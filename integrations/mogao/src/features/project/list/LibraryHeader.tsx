/**
 * 作品库顶栏：长篇/短篇 tab 切换 + 右侧新建入口（长篇入口带新手引导锚点）。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `features/project/ProjectList.tsx`，
 * 数量与动作都由门面注入。
 * 依赖方向：`./types` + `@/shared/layout/GuideTarget` →（本文件）→ 门面。
 */
import { BookOpen, Feather, Plus } from 'lucide-react';
import { GuideTarget } from '@/shared/layout/GuideTarget';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import type { LibraryTab } from './types';

interface LibraryHeaderProps {
  tab: LibraryTab;
  novelCount: number;
  storyCount: number;
  onChangeTab: (tab: LibraryTab) => void;
  onCreateNovel: () => void;
  onCreateStory: () => void;
}

export function LibraryHeader({
  tab, novelCount, storyCount, onChangeTab, onCreateNovel, onCreateStory,
}: LibraryHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl p-1">
        <button
          onClick={() => onChangeTab('novels')}
          className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            tab === 'novels' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          )}
        >
          <BookOpen className="h-4 w-4" />长篇小说
          {novelCount > 0 && <span className="text-xs text-zinc-400">{novelCount}</span>}
        </button>
        <button
          onClick={() => onChangeTab('stories')}
          className={cn('flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
            tab === 'stories' ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          )}
        >
          <Feather className="h-4 w-4" />短篇故事
          {storyCount > 0 && <span className="text-xs text-zinc-400">{storyCount}</span>}
        </button>
      </div>
      {tab === 'novels' ? (
        <GuideTarget targetStep={0} message="第一步：创建你的小说" detail="点击「新建项目」，填写书名、类型和简介，开始你的创作之旅。" side="bottom">
          <Button onClick={onCreateNovel} className="gap-2">
            <Plus className="h-4 w-4" />新建长篇
          </Button>
        </GuideTarget>
      ) : (
        <Button onClick={onCreateStory} className="gap-2 bg-rose-600 hover:bg-rose-500">
          <Plus className="h-4 w-4" />新建短篇
        </Button>
      )}
    </div>
  );
}
