/**
 * 长篇作品网格：加载态 / 空态 / 封面网格三种形态。
 *
 * 在拆分中的位置：纯展示组件，对外门面是 `features/project/ProjectList.tsx`，
 * 由门面注入数据与动作，自己不取数、不跳转。
 * 依赖方向：`./constants`（封面配色）+ `@/shared/ui/BookCard` →（本文件）→ 门面。
 */
import type { MouseEvent } from 'react';
import { BookOpen, FileText, Loader2, Plus } from 'lucide-react';
import { formatWordCount } from '@/shared/lib/utils';
import type { Project } from '@/shared/types';
import { BookCard } from '@/shared/ui/BookCard';
import { Button } from '@/shared/ui/button';
import { GENRE_COVER } from './constants';

interface NovelGridProps {
  projects: Project[];
  wordCounts: Record<string, number>;
  loading: boolean;
  onCreate: () => void;
  onOpen: (project: Project) => void;
  onPublish: (e: MouseEvent, project: Project) => void;
  onEdit: (e: MouseEvent, project: Project) => void;
  onExport: (e: MouseEvent, project: Project) => void;
  onDelete: (e: MouseEvent, project: Project) => void;
}

export function NovelGrid({
  projects, wordCounts, loading, onCreate, onOpen, onPublish, onEdit, onExport, onDelete,
}: NovelGridProps) {
  return (
    <>
      {loading && (
        <div className="flex items-center justify-center py-20 gap-2 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" /><span>加载中...</span>
        </div>
      )}
      {!loading && projects.length === 0 && (
        <div className="text-center py-20 text-zinc-400">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg mb-2">还没有任何长篇作品</p>
          <p className="text-sm mb-6">点击「新建长篇」开始你的创作之旅</p>
          <Button onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" />新建长篇
          </Button>
        </div>
      )}
      {projects.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {projects.map(project => {
            const cover = GENRE_COVER[project.genre] || GENRE_COVER['其他'];
            return (
              <BookCard
                key={project.id}
                title={project.title}
                meta={formatWordCount(wordCounts[project.id] || 0)}
                onClick={() => onOpen(project)}
                isPublic={project.isPublic}
                onPublish={e => onPublish(e, project)}
                onEdit={e => onEdit(e, project)}
                onDownload={e => onExport(e, project)}
                onDelete={e => onDelete(e, project)}
                coverClassName={cover.bg}
              >
                <div className="absolute inset-0 flex items-center justify-center opacity-20">
                  <BookOpen className="h-10 w-10 text-white" />
                </div>
                <div className="absolute inset-0 flex flex-col justify-between p-2.5">
                  <span className="text-[9px] font-medium text-white/60 uppercase tracking-widest">{project.genre}</span>
                  <p className="text-xs font-bold text-white leading-tight line-clamp-3 drop-shadow-sm">{project.title}</p>
                </div>
              </BookCard>
            );
          })}
        </div>
      )}
    </>
  );
}
