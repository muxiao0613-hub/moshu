import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Select } from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { AIFieldButton } from '@/features/ai/AIFieldButton';
import { AIPolishButton } from '@/features/ai/AIPolishButton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/shared/ui/tabs';
import { useEditor } from '@/shared/contexts/EditorContext';
import {
  generateForCharacter,
} from '@/features/ai/aiService';
import type { Character, CharacterRelation } from '@/shared/types';
import type { Project, WorldSetting } from '@/shared/types';
import { ProfileHistoryPanel } from './ProfileHistoryPanel';
import { CharacterMemoryPanel } from './CharacterMemoryPanel';

interface CharacterEditorProps {
  character: Character;
  characters: Character[];
  project: Project;
  worldSettings: WorldSetting[];
  onSave: (character: Character) => void;
  onCancel: () => void;
  onMemoryUpdated?: (character: Character) => void;
}

export function CharacterEditor({ character, characters, project, worldSettings, onSave, onCancel, onMemoryUpdated }: CharacterEditorProps) {
  const savedSnapshot = useRef(character);
  const [form, setForm] = useState<Character>({ ...character });
  const [newAlias, setNewAlias] = useState('');
  const [tab, setTab] = useState('basic');
  const { setModuleCtx } = useEditor();

  const update = (field: keyof Character, value: unknown) => {
    // 先计算 next，然后独立调用两个 setter
    // 不能在 setForm updater 里调 setModuleCtx（会触发 render 期间的 setState 警告）
    const next = { ...form, [field]: value };
    setForm(next);
    setModuleCtx({
      type: 'character',
      label: next.name || '人物档案',
      entityId: next.id,
      entitySnapshot: {
        ...next,
        targetField: field,
        targetFieldLabel: FIELD_LABELS[field as string] || field,
      },
      onApplyResult: (result) => {
        setForm(prev => ({ ...prev, [field]: result }));
      },
    });
  };

  // 设置当前 AI 上下文（字段级）
  const focusField = (field: string, label: string) => {
    setModuleCtx({
      type: 'character',
      label: form.name || '人物档案',
      entityId: form.id,
      entitySnapshot: {
        ...form,
        targetField: field,
        targetFieldLabel: label,
      },
      onApplyResult: (result) => {
        setForm(prev => ({ ...prev, [field]: result }));
      },
    });
  };

  const makeAIGenerator = (field: string, label: string) => async () => {
    return generateForCharacter({
      project,
      character: { ...form },
      field,
      fieldLabel: label,
      instruction: '',
      allChars: characters,
      allWorld: worldSettings,
    });
  };

  const addAlias = () => {
    if (!newAlias.trim()) return;
    update('aliases', [...form.aliases, newAlias.trim()]);
    setNewAlias('');
  };
  const removeAlias = (idx: number) => update('aliases', form.aliases.filter((_, i) => i !== idx));

  const addRelation = () => update('relationships', [...form.relationships, { characterId: '', relation: '' }]);
  const updateRelation = (idx: number, field: keyof CharacterRelation, val: string) => {
    const rels = [...form.relationships];
    rels[idx] = { ...rels[idx], [field]: val };
    update('relationships', rels);
  };
  const removeRelation = (idx: number) => update('relationships', form.relationships.filter((_, i) => i !== idx));

  const otherChars = characters.filter(c => c.id !== character.id);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Input
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="人物姓名"
          className="text-lg font-semibold flex-1"
        />
        <Select value={form.role} onChange={e => update('role', e.target.value)} className="w-28">
          <option value="protagonist">主角</option>
          <option value="antagonist">反派</option>
          <option value="supporting">配角</option>
          <option value="minor">次要</option>
        </Select>
      </div>

      {/* Aliases */}
      <div className="mb-4">
        <label className="text-xs font-medium text-zinc-500 block mb-1.5">别名 / 外号</label>
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {form.aliases.map((alias, i) => (
            <Badge key={i} variant="secondary" className="gap-1 pr-1">
              {alias}
              <button onClick={() => removeAlias(i)} className="hover:text-red-500"><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input value={newAlias} onChange={e => setNewAlias(e.target.value)} placeholder="添加别名" className="h-7 text-sm" onKeyDown={e => e.key === 'Enter' && addAlias()} />
          <Button size="sm" variant="outline" onClick={addAlias} className="h-7">添加</Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full mb-3">
          <TabsTrigger value="basic" className="flex-1">人物底色</TabsTrigger>
          <TabsTrigger value="detail" className="flex-1">背景与规划</TabsTrigger>
          <TabsTrigger value="memory" className="flex-1">经历与现状</TabsTrigger>
          <TabsTrigger value="voice" className="flex-1">说话方式</TabsTrigger>
          <TabsTrigger value="history" className="flex-1">底色历史</TabsTrigger>
          <TabsTrigger value="relations" className="flex-1">人物关系</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-3">
          {/* 年龄与性别单独放一行：它们会随人物设定一起进写作 prompt（见 features/context/plan/texts.ts） */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">年龄</label>
              <Input value={form.age ?? ''} onChange={e => update('age', e.target.value)} placeholder="如：二十七 / 十七八岁" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">性别</label>
              <Input value={form.gender ?? ''} onChange={e => update('gender', e.target.value)} placeholder="如：男 / 女 / 不明" />
            </div>
          </div>
          {[
            { field: 'appearance', label: '外貌描写', placeholder: '身高、体型、面容、服饰特征...' },
            { field: 'personality', label: '性格特征', placeholder: '性格特点、行为模式、处事风格...' },
            { field: 'goals', label: '目标 / 动机', placeholder: '他想要什么、为了什么不惜代价——动机比性格更能预测行为...' },
            { field: 'abilities', label: '能力 / 技能', placeholder: '战斗能力、特殊技能、职业...' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-500">{label}</label>
                <div className="flex gap-1">
                  <AIFieldButton
                    onGenerate={makeAIGenerator(field, label)}
                    onResult={result => setForm(prev => ({ ...prev, [field]: result }))}
                    label="AI生成"
                    title={`AI生成${label}`}
                  />
                  <AIPolishButton
                    value={(form[field as keyof Character] as string) || ''}
                    fieldLabel={label}
                    projectTitle={project.title}
                    onApply={result => setForm(prev => ({ ...prev, [field]: result }))}
                  />
                </div>
              </div>
              <Textarea
                value={(form[field as keyof Character] as string) || ''}
                onChange={e => update(field as keyof Character, e.target.value)}
                onFocus={() => focusField(field, label)}
                placeholder={placeholder}
                rows={3}
              />
            </div>
          ))}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1">首次出场</label>
            <Input value={form.firstAppearance} onChange={e => update('firstAppearance', e.target.value)} placeholder="如：第一章 踏上征途" />
          </div>
        </TabsContent>

        <TabsContent value="detail" className="space-y-3">
          {[
            { field: 'background', label: '背景故事', placeholder: '家庭背景、成长经历、重要事件...', rows: 4 },
            { field: 'arc', label: '成长弧线 / 命运走向', placeholder: '人物在故事中的成长变化和最终命运...', rows: 3 },
            { field: 'notes', label: '备注', placeholder: '其他需要记录的信息...', rows: 2 },
          ].map(({ field, label, placeholder, rows }) => (
            <div key={field}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-zinc-500">{label}</label>
                <div className="flex gap-1">
                  <AIFieldButton
                    onGenerate={makeAIGenerator(field, label)}
                    onResult={result => setForm(prev => ({ ...prev, [field]: result }))}
                    label="AI生成"
                    title={`AI生成${label}`}
                  />
                  <AIPolishButton
                    value={(form[field as keyof Character] as string) || ''}
                    fieldLabel={label}
                    projectTitle={project.title}
                    onApply={result => setForm(prev => ({ ...prev, [field]: result }))}
                  />
                </div>
              </div>
              <Textarea
                value={(form[field as keyof Character] as string) || ''}
                onChange={e => update(field as keyof Character, e.target.value)}
                onFocus={() => focusField(field, label)}
                placeholder={placeholder}
                rows={rows}
              />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history"><ProfileHistoryPanel character={form} characters={characters} onChange={patch => setForm(v => ({ ...v, ...patch }))} /></TabsContent>
        <TabsContent value="memory">
          {characters.some(c => c.id === character.id)
            ? <CharacterMemoryPanel character={character} project={project}
              onUpdated={(next, changes) => {
                const before = savedSnapshot.current;
                setForm(previous => {
                  const result = { ...previous, lifeMemories: next.lifeMemories, profileEvidence: next.profileEvidence, profileVersions: next.profileVersions };
                  for (const change of changes ?? []) {
                    const local = previous[change.field] ?? '';
                    result[change.field] = local === (before[change.field] ?? '') ? (next[change.field] ?? '')
                      : local.includes(change.text) ? local : [local.trim(), change.text].filter(Boolean).join('\n');
                  }
                  return result;
                });
                savedSnapshot.current = next;
                onMemoryUpdated?.(next);
              }} />
            : <p className="text-sm text-zinc-500 py-4">先保存人物底色，再从已保存章节补齐经历。</p>}
        </TabsContent>
        <TabsContent value="voice" className="space-y-2">
          <p className="text-xs text-zinc-500">角色对话中确认的语气样本会在这里保留，并用于后续写作。请在角色对话中添加新样本。</p>
          {(form.voiceSamples ?? []).map((sample, i) => <div key={i} className="space-y-1">
            <Textarea value={sample} rows={3} maxLength={300}
              onChange={e => setForm(v => ({ ...v, voiceSamples: v.voiceSamples?.map((s, n) => n === i ? e.target.value : s) }))} />
            <Button size="sm" variant="ghost" onClick={() => setForm(v => ({ ...v, voiceSamples: v.voiceSamples?.filter((_, n) => n !== i) }))}>删除样本</Button>
          </div>)}
          {!form.voiceSamples?.length && <p className="text-sm text-zinc-500">暂无已确认语气样本。</p>}
        </TabsContent>
        <TabsContent value="relations" className="space-y-3">
          <div className="space-y-2">
            {form.relationships.map((rel, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={rel.characterId} onChange={e => updateRelation(i, 'characterId', e.target.value)} className="flex-1">
                  <option value="">选择人物</option>
                  {otherChars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Input value={rel.relation} onChange={e => updateRelation(i, 'relation', e.target.value)} placeholder="关系描述，如：师傅、情敌..." className="flex-1" />
                <Button variant="ghost" size="icon" onClick={() => removeRelation(i)} className="shrink-0 text-zinc-400 hover:text-red-500">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addRelation} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />添加关系
          </Button>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-700">
        <Button variant="outline" onClick={() => { onCancel(); setModuleCtx(null); }}>关闭</Button>
        <Button onClick={() => { onSave(form); setModuleCtx(null); }} disabled={!form.name.trim()}>保存</Button>
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  appearance: '外貌描写',
  personality: '性格特征',
  goals: '目标/动机',
  abilities: '能力/技能',
  background: '背景故事',
  arc: '成长弧线',
  notes: '备注',
};
