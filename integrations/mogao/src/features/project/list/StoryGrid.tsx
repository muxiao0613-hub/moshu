/**
 * 短篇故事网格：加载态 / 空态（含新手引导文案）/ 封面网格。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `features/project/ProjectList.tsx`，
 * 由门面注入数据与动作，自己不取数、不跳转。
 * 依赖方向：`@/shared/lib/storyRules`（平台/类型配色与 emoji，与 ShortStoryWorkspace 同一份配置）
 *           →（本文件）→ 门面。
 */
import type { MouseEvent } from 'react';
import { Feather, Loader2, Plus } from 'lucide-react';
import { GENRE_CONFIGS, PLATFORM_CONFIGS } from '@/shared/lib/storyRules';
import { formatWordCount } from '@/shared/lib/utils';
import type { ShortStory } from '@/shared/types';
import { BookCard } from '@/shared/ui/BookCard';
import { Button } from '@/shared/ui/button';

interface StoryGridProps {
  stories: ShortStory[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (story: ShortStory) => void;
  onPublish: (e: MouseEvent, story: ShortStory) => void;
  onEdit: (e: MouseEvent, story: ShortStory) => void;
  onExport: (e: MouseEvent, story: ShortStory) => void;
  onDelete: (e: MouseEvent, story: ShortStory) => void;
}

export function StoryGrid({
  stories, loading, onCreate, onOpen, onPublish, onEdit, onExport, onDelete,
}: StoryGridProps) {
  return loading ? (
    <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
      <Loader2 className="h-5 w-5 animate-spin" /><span>加载中...</span>
    </div>
  ) : stories.length === 0 ? (
    <div className="text-center py-20 text-zinc-400">
      <Feather className="h-12 w-12 mx-auto mb-4 opacity-30" />
      <p className="text-lg mb-2">还没有短篇故事</p>
      <p className="text-sm mb-6 text-zinc-400">新手建议：先写一句灵感，进入后直接点「一键自动成稿」</p>
      <Button onClick={onCreate} className="gap-2 bg-rose-600 hover:bg-rose-500">
        <Plus className="h-4 w-4" />新建短篇
      </Button>
    </div>
  ) : (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
      {stories.map(story => {
        const pConfig = PLATFORM_CONFIGS[story.platform];
        const gConfig = GENRE_CONFIGS[story.genre];
        return (
          <BookCard
            key={story.id}
            title={story.title}
            meta={story.wordCount > 0 ? formatWordCount(story.wordCount) : '未开始'}
            onClick={() => onOpen(story)}
            isPublic={story.isPublic}
            onPublish={e => onPublish(e, story)}
            onEdit={e => onEdit(e, story)}
            onDownload={e => onExport(e, story)}
            onDelete={e => onDelete(e, story)}
            coverStyle={{ background: `linear-gradient(135deg, ${pConfig.color}cc, ${pConfig.color}66)` }}
          >
            <div className="absolute inset-0 opacity-10"
              style={{ background: 'radial-gradient(circle at 70% 30%, white, transparent 60%)' }} />
            <div className="absolute inset-0 flex flex-col justify-between p-2.5">
              <span className="text-base">{gConfig.emoji}</span>
              <div>
                <p className="text-[9px] font-medium text-white/60 mb-0.5">{story.platform}</p>
                <p className="text-xs font-bold text-white leading-tight line-clamp-3 drop-shadow-sm">{story.title}</p>
              </div>
            </div>
          </BookCard>
        );
      })}
    </div>
  );
}
