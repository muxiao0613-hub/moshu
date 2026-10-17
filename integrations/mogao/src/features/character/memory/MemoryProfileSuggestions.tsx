/** 固定人设建议的逐字段确认；展示原值和追加内容，只有作者动作才写入固定字段。 */
import { useState } from 'react';
import { pendingProfileChanges, PROFILE_CHANGE_LABELS } from '@/shared/lib/characterSync';
import type { Character, CharacterLifeMemory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
export function MemoryProfileSuggestions({ character, memory, busy, onSave }: {
  character: Character; memory: CharacterLifeMemory; busy: boolean;
  onSave: (action: 'confirmProfile' | 'dismissProfile', memory: CharacterLifeMemory) => void;
}) {
  const pending = pendingProfileChanges(memory);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  if (!pending.length) return null;
  const chosen = pending.filter(c => selected.includes(c.field)).map(c => ({ ...c, text: texts[c.field] ?? c.text }));
  return <div className="border-t border-zinc-200 dark:border-zinc-700 pt-3 space-y-2">
    <p className="text-xs font-medium">固定人设建议（尚未修改原设定）</p>
    {pending.map(change => <div key={change.field} className="space-y-1 text-xs">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" disabled={busy} checked={selected.includes(change.field)}
          onChange={e => setSelected(v => e.target.checked ? [...v, change.field] : v.filter(f => f !== change.field))} />
        {PROFILE_CHANGE_LABELS[change.field]}
      </label>
      <p className="text-zinc-500 whitespace-pre-wrap">原设定：{character[change.field] || '未填写'}</p>
      <Textarea rows={2} maxLength={200} disabled={busy} value={texts[change.field] ?? change.text}
        onChange={e => setTexts(v => ({ ...v, [change.field]: e.target.value }))} />
      <blockquote className="border-l-2 pl-2 text-zinc-500">依据：{change.quote}</blockquote>
    </div>)}
    <div className="flex gap-2">
      <Button size="sm" disabled={busy || !chosen.length || chosen.some(c => !c.text.trim())}
        onClick={() => onSave('confirmProfile', { ...memory, profileChanges: chosen })}>将所选内容补充到原设定</Button>
      <Button size="sm" variant="outline" disabled={busy || !chosen.length}
        onClick={() => onSave('dismissProfile', { ...memory, profileChanges: chosen })}>忽略所选建议</Button>
    </div>
  </div>;
}
