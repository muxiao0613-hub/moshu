import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { getChapters, getOutlines, saveChapter } from '@/api';
import { onLibraryChanged } from '@/shared/lib/libraryEvents';
import { cn, formatWordCount } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast';
import { workChapterPath } from '@/shared/lib/workRoutes';
import type { Chapter, Outline } from '@/shared/types';

interface ChapterTreeProps {
  projectId: string;
  activeChapterId?: string;
  onNavigate?: () => void;
}

interface Group {
  key: string;
  title: string;
  order: number;
  chapters: Chapter[];
}

/**
 * 状态点：○ 待写 · ● 写作中 · ◐ 已修订 · ✓ 定稿。
 * 「⚠ 待修」需要完善台回写问题标记，第 3 批接入（REFACTOR_PLAN.md §4.2）。
 */
function statusOf(ch: Chapter): { mark: string; label: string; cls: string } {
  if (ch.status === 'final') return { mark: '✓', label: '定稿', cls: 'text-emerald-500' };
  if (ch.status === 'revised') return { mark: '◐', label: '已修订', cls: 'text-amber-500' };
  if ((ch.wordCount || 0) > 0) return { mark: '●', label: '写作中', cls: 'text-sky-500' };
  return { mark: '○', label: '待写', cls: 'text-zinc-400' };
}

/**
 * 写作台左栏：作品 > 卷 > 章 的章节树（取代原来 7 项「按数据类型分」的导航）。
 * 数据就是 `chapters` 列表；卷标题来自大纲里的 `type === 'volume'` 节点，找不到就归入「未分卷」。
 */
export function ChapterTree({ projectId, activeChapterId, onNavigate }: ChapterTreeProps) {
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const [chs, ols] = await Promise.all([getChapters(projectId), getOutlines(projectId)]);
    setChapters(chs);
    setOutlines(ols);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);
  // 切章后回来时刷新字数与状态（编辑页自动保存不经过本组件）
  useEffect(() => { refresh(); }, [activeChapterId, refresh]);
  // 别处改了章节名/状态/顺序，或增删了章节与大纲（卷名）时跟着刷新：
  // 广播点在 `features/chapter/api.ts` 与 `features/outline/api.ts`，正文自动保存不会触发
  useEffect(() => onLibraryChanged(() => { refresh(); }), [refresh]);

  const groups = useMemo<Group[]>(() => {
    if (!chapters) return [];
    const outlineById = new Map(outlines.map(o => [o.id, o]));
    const volumeOf = (chapter: Chapter): { key: string; title: string; order: number } => {
      const node = outlines.find(o => o.chapterId === chapter.id);
      let cur: Outline | undefined = node;
      while (cur) {
        if (cur.type === 'volume') return { key: cur.id, title: cur.title, order: cur.order };
        cur = cur.parentId ? outlineById.get(cur.parentId) : undefined;
      }
      return { key: '__none__', title: '未分卷', order: Number.MAX_SAFE_INTEGER };
    };

    const map = new Map<string, Group>();
    for (const ch of [...chapters].sort((a, b) => a.order - b.order)) {
      const { key, title, order } = volumeOf(ch);
      if (!map.has(key)) map.set(key, { key, title, order, chapters: [] });
      map.get(key)!.chapters.push(ch);
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [chapters, outlines]);

  const stats = useMemo(() => {
    const list = chapters ?? [];
    return {
      total: list.reduce((sum, c) => sum + (c.wordCount || 0), 0),
      count: list.length,
      finalCount: list.filter(c => c.status === 'final').length,
      draftCount: list.filter(c => c.status !== 'final').length,
    };
  }, [chapters]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    try {
      const order = (chapters?.length ?? 0) + 1;
      // 只发明文里有的字段，其余（createdAt/updatedAt）由后端实体默认值负责
      const chapter = await saveChapter({
        projectId, title, order,
        content: '', wordCount: 0, status: 'draft',
        summary: '',
      });
      setNewTitle('');
      setCreating(false);
      await refresh();
      onNavigate?.();
      navigate(workChapterPath(projectId, chapter.id));
    } catch (e) {
      toast.error('新建章节失败：' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (chapters === null) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-zinc-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />加载章节…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">章节</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCreating(v => !v)}
            className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="新建章节"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => refresh()}
            className="p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="刷新"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {creating && (
        <div className="px-3 pb-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreating(false); setNewTitle(''); }
            }}
            placeholder="章节标题，回车创建"
            className="flex-1 min-w-0 px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100 outline-none focus:border-zinc-400"
          />
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
        {chapters.length === 0 && (
          <p className="px-4 py-3 text-xs text-zinc-400 leading-relaxed">
            还没有章节。点上面的 ＋ 新建第一章，或到「完善台 › 章节大纲」把大纲里的章节节点同步过来。
          </p>
        )}

        {groups.map(group => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <div key={group.key} className="mb-1">
              <button
                onClick={() => setCollapsed(prev => {
                  const next = new Set(prev);
                  if (next.has(group.key)) next.delete(group.key); else next.add(group.key);
                  return next;
                })}
                className="w-full flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                <span className="font-medium truncate">{group.title}</span>
                <span className="text-zinc-400 shrink-0">{group.chapters.length}</span>
              </button>

              {!isCollapsed && group.chapters.map(ch => {
                const st = statusOf(ch);
                const active = ch.id === activeChapterId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => { onNavigate?.(); navigate(workChapterPath(projectId, ch.id)); }}
                    title={`${ch.title} · ${st.label} · ${formatWordCount(ch.wordCount || 0)}`}
                    className={cn(
                      'w-full flex items-center gap-2 pl-5 pr-2 py-1.5 text-left text-xs rounded-md transition-colors',
                      active
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 font-medium'
                        : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60',
                    )}
                  >
                    <span className={cn('shrink-0 text-[10px]', st.cls)}>{st.mark}</span>
                    <span className="flex-1 min-w-0 truncate">{ch.title}</span>
                    <span className="shrink-0 text-[10px] text-zinc-400">
                      {(ch.wordCount || 0) > 0 ? formatWordCount(ch.wordCount) : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-400 leading-relaxed">
        <div className="flex items-center gap-1.5">
          <FileText className="h-3 w-3" />
          <span>{formatWordCount(stats.total)} · 共 {stats.count} 章</span>
        </div>
        <div className="mt-0.5">定稿 {stats.finalCount} · 待完成 {stats.draftCount}</div>
      </div>
    </div>
  );
}
