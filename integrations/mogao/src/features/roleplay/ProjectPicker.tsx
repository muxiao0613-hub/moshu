/**
 * 角色扮演页 · 还没选作品时的作品选择屏。
 *
 * 上一版是一串朴素卡片，看不出「上次聊到哪儿」。这里把上次聊过的那部排最前并标出来，
 * 其余每张卡带上类型与简介，鼠标悬停有一点点反馈；作品多的时候顶部给搜索框。
 * 一句话说明放在最上面：这个页面是干什么的、聊出来的东西会去哪儿。
 */
import { useMemo, useState } from 'react';
import { MessagesSquare, Search, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trunc } from '@/shared/lib/text';
import { cn } from '@/shared/lib/utils';
import type { Project } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';

interface ProjectPickerProps {
  projects: Project[];
  loaded: boolean;
  lastProjectId: string | null;
  onOpen: (id: string) => void;
}

export function ProjectPicker({ projects, loaded, lastProjectId, onOpen }: ProjectPickerProps) {
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const hit = k
      ? projects.filter(p =>
        p.title.toLowerCase().includes(k)
        || (p.genre ?? '').toLowerCase().includes(k)
        || (p.synopsis ?? '').toLowerCase().includes(k))
      : projects;
    return [...hit].sort((a, b) => {
      if (a.id === b.id) return 0;
      if (a.id === lastProjectId) return -1;
      if (b.id === lastProjectId) return 1;
      return 0;
    });
  }, [projects, keyword, lastProjectId]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5 text-ink-500" />
            <h1 className="text-base font-medium text-zinc-800 dark:text-zinc-100">角色扮演</h1>
          </div>
          <p className="text-xs text-zinc-500 leading-relaxed">
            和作品里的角色闲聊或对戏：你用旁白推进剧情，也可以扮演某个角色插话。
            聊出来的<strong className="font-medium text-zinc-600 dark:text-zinc-300">说话方式</strong>可以存成语气样本，
            聊出来的<strong className="font-medium text-zinc-600 dark:text-zinc-300">性格、目标、经历与关系</strong>可以一键写回人物档案 ——
            下次写这一章时会用上。先挑一部作品：
          </p>
        </header>

        {projects.length > 5 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder="搜作品名、类型或简介"
              className="h-8 pl-8 text-xs"
            />
          </div>
        )}

        {!loaded && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl border border-zinc-200 dark:border-zinc-700 animate-pulse bg-zinc-100/60 dark:bg-zinc-800/60" />
            ))}
          </div>
        )}

        {loaded && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">还没有作品</p>
            <p className="text-xs text-zinc-400">
              角色扮演要有角色才演得起来 —— 先去书架新建一部作品，再建几个角色。
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-md bg-ink-600 px-3 py-1.5 text-xs text-white hover:bg-ink-700"
            >
              <Sparkles className="h-3.5 w-3.5" />去书架
            </Link>
          </div>
        )}

        {loaded && projects.length > 0 && list.length === 0 && (
          <p className="text-xs text-zinc-400">没有匹配「{keyword}」的作品。</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {list.map(p => {
            const isLast = p.id === lastProjectId;
            return (
              <button
                key={p.id}
                onClick={() => onOpen(p.id)}
                className={cn(
                  'group text-left rounded-xl border p-3.5 transition-all',
                  'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/60',
                  'hover:border-ink-400 hover:shadow-md hover:-translate-y-0.5'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-800 dark:text-zinc-100 truncate">{p.title}</span>
                  {isLast && <Badge variant="secondary" className="text-[10px] shrink-0">上次聊过</Badge>}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">{p.genre || '未设类型'}</p>
                {p.synopsis && (
                  <p className="mt-1.5 text-[11px] text-zinc-500 line-clamp-2 leading-relaxed">
                    {trunc(p.synopsis, 80)}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-ink-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  进去和他们聊聊 →
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
