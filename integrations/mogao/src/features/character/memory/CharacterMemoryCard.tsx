/** 单章经历候选的编辑与核验展示；写入由上层 hook 完成。 */
import { useState } from 'react';
import { MEMORY_KIND_LABELS } from '@/shared/lib/characterMemory';
import type { Character, CharacterLifeMemory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { MemoryProfileSuggestions } from './MemoryProfileSuggestions';

export function CharacterMemoryCard({ character, memory, busy, onSave }: {
  character: Character; memory: CharacterLifeMemory; busy: boolean;
  onSave: (action: 'confirm' | 'remove' | 'confirmProfile' | 'dismissProfile', memory: CharacterLifeMemory) => void;
}) {
  const [claims, setClaims] = useState(memory.claims);
  const stale = memory.status === 'stale';
  return <article className="rounded border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
    <div className="flex justify-between gap-2 text-xs">
      <strong>第{memory.chapterOrder}章《{memory.chapterTitle}》</strong>
      <span>{stale ? '正文已变更 · 待更新' : memory.status === 'pending' ? '待作者确认' : memory.confirmation === 'generated' ? '正文事实已同步' : '已确认'}</span>
    </div>
    {memory.sourceStatus && memory.sourceStatus !== 'final' && <p className="text-xs text-zinc-500">依据来自已保存的生成稿；正文修订后对应记录会失效。</p>}
    {claims.map((claim, i) => <div key={i} className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{MEMORY_KIND_LABELS[claim.kind]}</span>
        <button disabled={busy || stale} onClick={() => setClaims(v => v.filter((_, n) => n !== i))}>舍弃这条</button>
      </div>
      <Textarea rows={2} maxLength={200} value={claim.text} disabled={busy || stale}
        onChange={e => setClaims(v => v.map((c, n) => n === i ? { ...c, text: e.target.value } : c))} />
      <blockquote className="text-xs text-zinc-500 border-l-2 pl-2">依据：{claim.quote}</blockquote>
    </div>)}
    {!claims.length && <p className="text-xs text-zinc-500">不记录本章的角色经历。</p>}
    {stale ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onSave('remove', memory)}>移除失效记录</Button>
      : <Button size="sm" disabled={busy || claims.some(c => !c.text.trim())}
        onClick={() => onSave('confirm', { ...memory, claims })}>{claims.length ? '确认并保存本章经历' : '确认忽略本章'}</Button>}
    {!stale && <MemoryProfileSuggestions character={character} memory={memory} busy={busy} onSave={onSave} />}
  </article>;
}
