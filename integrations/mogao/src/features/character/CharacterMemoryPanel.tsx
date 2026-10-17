/** 人物档案的持久经历页；只展示和编排，取数/同步由 memory hook 负责。 */
import { characterMemoryText } from '@/shared/lib/characterMemory';
import type { Character, CharacterProfileChange, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { CharacterMemoryCard } from './memory/CharacterMemoryCard';
import { useCharacterMemory } from './memory/useCharacterMemory';

export function CharacterMemoryPanel(props: {
  character: Character; project: Project; onUpdated: (character: Character, changes?: CharacterProfileChange[]) => void;
}) {
  const { current, busy, message, error, sync, save, stop } = useCharacterMemory(props.character, props.project, props.onUpdated);
  const memories = current.lifeMemories ?? [];
  return <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
    <p className="text-xs text-zinc-500 leading-relaxed">每章只整理一次，正文修订后仅更新受影响的章节。对话直接读取已确认经历与引用，无需重新通读小说。此页操作会立即保存。</p>
    <div className="flex gap-2">
      <Button size="sm" onClick={sync} disabled={busy}>补齐 / 更新经历</Button>
      {busy && <Button size="sm" variant="outline" onClick={stop}>停止整理</Button>}
    </div>
    {message && <p role="status" className="text-xs text-ink-600">{message}</p>}
    {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    <details className="rounded bg-zinc-50 dark:bg-zinc-900 p-3 text-xs">
      <summary>对话与写作将读取的经历概览</summary>
      <p className="whitespace-pre-wrap mt-2">{characterMemoryText(current)}</p>
    </details>
    <p className="text-xs text-zinc-500">已整理 {memories.length} 章 · 已确认 {memories.filter(m => m.status === 'confirmed' && m.claims.length).length} 章</p>
    {[...memories].sort((a, b) => b.chapterOrder - a.chapterOrder).filter(m => m.claims.length || m.profileChanges?.length || m.status === 'stale').map(memory =>
      <CharacterMemoryCard key={`${memory.chapterId}:${memory.generatedAt}:${memory.status}:${memory.confirmedAt ?? ''}`}
        character={current} memory={memory} busy={busy} onSave={save} />)}
    {!memories.length && <p className="text-sm text-zinc-500">还没有小说经历。点击上方按钮整理已保存章节，再逐章确认。</p>}
    {!!current.stateHistory?.length && <details className="text-xs text-zinc-500">
      <summary>旧版状态摘要（未经逐字核验，不作为已确认经历）</summary>
      {current.stateHistory.map((entry, i) => <p key={i} className="mt-2">《{entry.chapterTitle}》：{entry.summary}</p>)}
    </details>}
  </div>;
}
