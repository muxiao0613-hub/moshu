/**
 * 角色扮演页 · 作品切换（页头那个按钮 + 弹出列表）。
 *
 * 原来直接用原生 <select>：看不到作品简介、分不清哪部是上次聊的，切换时也没有「正在聊这部」的反馈。
 * 换成按钮 + 轻量弹出面板：标题 / 类型 / 简介一行看全，上次聊过的排最前，正在聊的打勾；
 * 点面板外面或按 Esc 关掉。
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Library } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { trunc } from '@/shared/lib/text';
import { cn } from '@/shared/lib/utils';
import type { Project } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';

interface ProjectSwitcherProps {
  project: Project | null;
  projectId: string;
  projects: Project[];
  /** 上次聊过的那部，排最前并打标记 */
  lastProjectId: string | null;
  onSelect: (id: string) => void;
}

export function ProjectSwitcher({ project, projectId, projects, lastProjectId, onSelect }: ProjectSwitcherProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const sorted = [...projects].sort((a, b) => {
    if (a.id === b.id) return 0;
    if (a.id === lastProjectId) return -1;
    if (b.id === lastProjectId) return 1;
    return 0;
  });

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'h-8 flex items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
          'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800',
          open && 'bg-zinc-100 dark:bg-zinc-800'
        )}
        title="切换作品"
      >
        <span className="max-w-[9rem] truncate">{project?.title ?? '选择作品'}</span>
        {project?.genre && <span className="text-[11px] text-zinc-400">{project.genre}</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 shadow-xl">
          <p className="px-2 py-1.5 text-[11px] text-zinc-400">
            切换作品 · 对话是临时的，切走不会留着（想留下就先存成语气样本）
          </p>
          <div className="max-h-80 overflow-y-auto">
            {sorted.map(p => (
              <button
                key={p.id}
                onClick={() => {
                  setOpen(false);
                  if (p.id !== projectId) onSelect(p.id);
                }}
                className={cn(
                  'w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  p.id === projectId
                    ? 'bg-ink-600/10 dark:bg-ink-500/15'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                )}
              >
                <Check className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', p.id === projectId ? 'text-ink-500' : 'opacity-0')} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1">
                    <span className="text-sm text-zinc-800 dark:text-zinc-100 truncate">{p.title}</span>
                    {p.id === lastProjectId && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">上次聊过</Badge>
                    )}
                  </span>
                  <span className="block text-[11px] text-zinc-400 truncate">
                    {p.genre}{p.synopsis ? ` · ${trunc(p.synopsis, 40)}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-zinc-100 dark:border-zinc-800 pt-1">
            <button
              onClick={() => navigate('/')}
              className="w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <Library className="h-3.5 w-3.5" />打开书架（新建 / 管理作品）
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
