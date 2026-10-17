/** 固定底色历史的对照与恢复；恢复只是编辑草稿，保存后追加新版本。 */
import { useState } from 'react';
import { normalizeCharacter } from '@/shared/lib/normalizeCharacter';
import type { Character } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
const FIELDS = { name: '姓名', aliases: '别名', age: '年龄', gender: '性别', appearance: '外貌', personality: '性格', background: '背景',
  goals: '目标与动机', abilities: '能力', arc: '人物弧线', firstAppearance: '首次出场', notes: '补充备注', voiceSamples: '语气样本' } as const;
const ROLES = { protagonist: '主角', antagonist: '反派', supporting: '配角', minor: '次要人物' };
export function ProfileHistoryPanel({ character, characters = [], onChange }: {
  character: Character; characters?: Character[]; onChange: (patch: Partial<Character>) => void;
}) {
  const [selected, setSelected] = useState('');
  const version = character.profileVersions?.find(v => v.id === selected);
  return <div className="space-y-3 text-sm">
    <label className="block">本次修改从第几章生效（0 表示全书底色修订）
      <Input type="number" min="0" value={character.profileEffectiveOrder ?? 0} onChange={e => onChange({ profileEffectiveOrder: Math.max(0, Number(e.target.value) || 0) })} /></label>
    <p className="text-xs text-zinc-500">角色对话及后续写作按截止章读取当时的底色。旧档案只能以已有内容建立历史起点，不能追溯没有保存过的版本。</p>
    <Select value={selected} onChange={e => setSelected(e.target.value)}><option value="">选择历史底色查看</option>
      {(character.profileVersions ?? []).map(v => <option key={v.id} value={v.id}>{v.label} · 从第{v.effectiveOrder}章 · {new Date(v.createdAt).toLocaleString()}</option>)}</Select>
    {version && <><dl className="text-xs space-y-2 max-h-64 overflow-auto">
      {Object.entries(FIELDS).map(([key, label]) => {
        const value = version.fields[key as keyof typeof FIELDS];
        return <div key={key}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap text-zinc-500">{(Array.isArray(value) ? value.join(' / ') : value) || '未记录'}</dd></div>;
      })}
      <div><dt className="font-medium">身份</dt><dd>{version.fields.role ? ROLES[version.fields.role] || '未记录' : '未记录'}</dd></div>
      <div><dt className="font-medium">人物关系</dt><dd>{version.fields.relationships?.map(r => `${characters.find(c => c.id === r.characterId)?.name || '已删除或未加载的人物'}：${r.relation}`).join('；') || '未记录'}</dd></div>
    </dl>
      {!!version.fields.profileEvidence?.length && <details><summary>已确认来源（{version.fields.profileEvidence.length}）</summary>{version.fields.profileEvidence.map(e => <blockquote key={e.id} className="text-xs text-zinc-500 whitespace-pre-wrap">{e.sourceLabel}：{e.sourceExcerpt}</blockquote>)}</details>}
      <Button size="sm" variant="outline" onClick={() => onChange(normalizeCharacter({ ...character, ...version.fields }))}>载入为编辑草稿（保存后生效）</Button></>}
  </div>;
}
