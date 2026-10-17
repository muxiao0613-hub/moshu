/**
 * 角色扮演页 · 左栏（上场角色名单）。
 *
 * 只做「谁能上场」这一件事：默认按主角 → 反派 → 配角 → 次要角色排序，因为作者要拉进来聊天的
 * 一般是主角团；已选中的排最前，方便边聊边换人。选满 3 人后其余置灰（再多模型就分不清谁在说话）。
 * 作品还没有角色时，这里直接把作者送去人物档案 —— 空名单上写「没有数据」帮不上任何忙。
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Sparkles, UserRound } from 'lucide-react';
import { trunc } from '@/shared/lib/text';
import { cn } from '@/shared/lib/utils';
import { MAX_VOICE_SAMPLES } from '@/shared/lib/voiceSample';
import { workRefinePath } from '@/shared/lib/workRoutes';
import type { Character } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Input } from '@/shared/ui/input';

const ROLE_ORDER: Record<Character['role'], number> = {
  protagonist: 0, antagonist: 1, supporting: 2, minor: 3,
};

const ROLE_LABEL: Record<Character['role'], string> = {
  protagonist: '主角', antagonist: '反派', supporting: '配角', minor: '次要角色',
};

interface CharacterRailProps {
  projectId: string;
  characters: Character[];
  castIds: string[];
  onToggle: (id: string) => void;
  /** 一次最多上场几个（再多就分不清谁在说话了） */
  maxCast: number;
  loading?: boolean;
  className?: string;
  /** 桌面端拖出来的宽度（手机端是覆盖抽屉，仍受 max-w 限制） */
  width?: number;
}

export function CharacterRail({
  projectId, characters, castIds, onToggle, maxCast, loading = false, className, width,
}: CharacterRailProps) {
  const [keyword, setKeyword] = useState('');

  const list = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    const hit = k
      ? characters.filter(c =>
        (c.name ?? '').toLowerCase().includes(k)
        || (c.aliases ?? []).some(a => (a ?? '').toLowerCase().includes(k)))
      : characters;
    return [...hit].sort((a, b) => {
      const selected = Number(castIds.includes(b.id)) - Number(castIds.includes(a.id));
      if (selected !== 0) return selected;
      return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
    });
  }, [characters, keyword, castIds]);

  return (
    <aside
      style={width ? { width, maxWidth: '70vw' } : undefined}
      className={cn(
        'w-60 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900',
        className
      )}
    >
      <div className="space-y-2 border-b border-zinc-100 dark:border-zinc-800 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500">
            角色（上场 {castIds.length}/{maxCast}）
          </span>
          {castIds.length === 0 && characters.length > 0 && (
            <span className="text-[11px] text-zinc-400">点一下即上场</span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <Input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜名字或别名"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {loading && [0, 1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg bg-zinc-100/70 dark:bg-zinc-800/60 animate-pulse" />
        ))}

        {!loading && characters.length === 0 && (
          <div className="space-y-2 p-2">
            <p className="text-xs text-zinc-500 leading-relaxed">
              这部作品还没有人物档案。角色的性格与说话方式是聊天的基础，
              先建几个角色再回来。
            </p>
            <Link
              to={workRefinePath(projectId, 'characters')}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink-500/40 px-2.5 py-1.5 text-[11px] text-ink-600 hover:bg-ink-600/10 dark:text-ink-400"
            >
              <Sparkles className="h-3 w-3" />去人物档案建角色
            </Link>
          </div>
        )}

        {!loading && characters.length > 0 && list.length === 0 && (
          <p className="p-2 text-xs text-zinc-400">没有匹配「{keyword}」的角色。</p>
        )}

        {!loading && list.map(c => {
          const active = castIds.includes(c.id);
          const blocked = !active && castIds.length >= maxCast;
          const samples = c.voiceSamples?.length ?? 0;
          return (
            <button
              key={c.id}
              onClick={() => onToggle(c.id)}
              disabled={blocked}
              title={blocked ? `最多 ${maxCast} 个角色同时上场` : `点一下${active ? '让他下场' : '拉他上场'}`}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                active
                  ? 'bg-ink-600/10 dark:bg-ink-500/15 ring-1 ring-ink-500/40'
                  : 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
                blocked && 'cursor-not-allowed opacity-40'
              )}
            >
              <UserRound className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', active ? 'text-ink-500' : 'text-zinc-400')} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">{c.name || '未命名'}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{ROLE_LABEL[c.role] ?? '配角'}</Badge>
                </span>
                <span className="block truncate text-[11px] text-zinc-400">
                  {c.personality?.trim() ? trunc(c.personality, 24) : '（还没写性格）'}
                </span>
                {samples > 0 && (
                  <span className="block text-[11px] text-ink-500">语气样本 {samples}/{MAX_VOICE_SAMPLES} 段</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
