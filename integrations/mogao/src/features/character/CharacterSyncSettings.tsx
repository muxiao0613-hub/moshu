/** 正文生成/采用时选择怎样更新哪些人物；不修改人物底色。 */
import type { Character, CharacterSyncPreferences } from '@/shared/types';
import { Select } from '@/shared/ui/select';
export function CharacterSyncSettings({ characters, value, onChange, disabled = false }: {
  characters: Character[]; value: CharacterSyncPreferences;
  onChange: (next: CharacterSyncPreferences) => void; disabled?: boolean;
}) {
  return <div className="rounded border border-zinc-200 dark:border-zinc-700 p-3 space-y-2 text-xs">
    <p className="font-medium">正文保存后更新人物档案</p>
    <Select value={value.mode} disabled={disabled} onChange={e => onChange({ ...value, mode: e.target.value as CharacterSyncPreferences['mode'] })}>
      <option value="auto">自动同步正文事实，固定设定待确认</option>
      <option value="review">全部作为待确认建议</option>
      <option value="off">本次不更新档案</option>
    </Select>
    {value.mode !== 'off' && <>
      <Select value={value.scope} disabled={disabled} onChange={e => onChange({ ...value, scope: e.target.value as CharacterSyncPreferences['scope'] })}>
        <option value="involved">只更新正文涉及且有新信息的角色</option>
        <option value="selected">只更新我选择的角色</option>
      </Select>
      {value.scope === 'selected' && <div className="flex flex-wrap gap-x-3 gap-y-2 max-h-28 overflow-y-auto">
        {characters.map(c => <label key={c.id} className="flex items-center gap-1">
          <input type="checkbox" disabled={disabled} checked={value.characterIds.includes(c.id)}
            onChange={e => onChange({ ...value, characterIds: e.target.checked
              ? [...value.characterIds, c.id] : value.characterIds.filter(id => id !== c.id) })} />{c.name}
        </label>)}
        {!characters.length && <span>先保存人物档案，再选择角色。</span>}
      </div>}
      {value.scope === 'selected' && !value.characterIds.length && <p className="text-amber-600">尚未选择角色，本次不会更新任何人物档案。</p>}
      <p className="text-zinc-500">仅依据已保存正文更新经历、状态、知情与关系变化。性格等固定设定保留原值，由你确认补充。</p>
    </>}
  </div>;
}
