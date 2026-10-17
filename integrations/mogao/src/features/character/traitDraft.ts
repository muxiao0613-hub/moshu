/**
 * 人设草稿 → 档案字段的纯逻辑（不依赖 React 与网络，可单测）。
 *
 * 所有字段默认追加新特点并保留原档案；作者可在候选卡中修改最终内容，防止提炼覆盖已有设定。
 *
 * 关系只能落到已有角色上（档案里关系存的是 characterId），对不上的名字会作为 unmatched 返回，
 * 由 UI 明确提示，而不是塞一条空 characterId 的假关系。
 */
import type { CharacterTraitDraft, TraitRelationDraft } from '@/features/ai/aiService';
import { matchCharacterByName } from '@/shared/lib/roleplay';
import type { Character, CharacterRelation } from '@/shared/types';

export type TraitTextFieldKey =
  | 'appearance' | 'personality' | 'goals' | 'abilities' | 'arc' | 'background' | 'notes';

export interface TraitTextFieldDef {
  key: TraitTextFieldKey;
  label: string;
  /** 保存语义：替换整段 / 追加到已有内容后面 */
  mode: 'replace' | 'append';
}

export const TRAIT_TEXT_FIELDS: TraitTextFieldDef[] = [
  { key: 'appearance', label: '外貌', mode: 'append' },
  { key: 'personality', label: '性格', mode: 'append' },
  { key: 'goals', label: '目标', mode: 'append' },
  { key: 'abilities', label: '能力', mode: 'append' },
  { key: 'arc', label: '弧线', mode: 'append' },
  { key: 'background', label: '背景（经历与关键事件）', mode: 'append' },
  { key: 'notes', label: '备注（口癖、习惯等零碎特点）', mode: 'append' },
];

function clean(s: string | undefined): string {
  return (s ?? '').replace(/[ \t]+/g, ' ').trim();
}

/**
 * 按姓名或别名找档案里的角色（提炼出来的名字常常只是别名）。
 * 与对白演练共用 @/shared/lib/roleplay 的同一套匹配规则，避免两处口径漂移。
 */
export const findCharacterByName = matchCharacterByName;

/** 某个字段的预填内容：追加模式下把已有内容放在前面，作者改的就是最终值 */
export function traitTextForField(def: TraitTextFieldDef, draft: CharacterTraitDraft, character?: Character): string {
  const ai = clean(draft[def.key]);
  if (!ai) return '';
  if (def.mode === 'replace') return ai;
  const existing = clean(character?.[def.key]);
  if (existing.includes(ai)) return existing;
  return existing ? `${existing}\n${ai}` : ai;
}

/** 把已有关系渲染成「名字：关系描述」多行文本，便于作者直接改 */
export function relationsToText(relations: CharacterRelation[], characters: Character[]): string {
  return (relations ?? [])
    .map(r => {
      const name = characters.find(c => c.id === r.characterId)?.name ?? '';
      const desc = clean(r.relation);
      if (!name && !desc) return '';
      return `${name || '（未知人物）'}：${desc}`;
    })
    .filter(Boolean)
    .join('\n');
}

/** 解析「名字：关系描述」多行文本（中英文冒号都认；没写冒号就当成只有名字） */
export function parseRelationsText(text: string): TraitRelationDraft[] {
  return (text ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const idx = line.search(/[:：]/);
      if (idx === -1) return { target: line, description: '' };
      return { target: line.slice(0, idx).trim(), description: line.slice(idx + 1).trim() };
    })
    .filter(r => r.target);
}

/**
 * 合并关系：按角色 id 覆盖同一条，档案里没提到的人**原样保留**，
 * 找不到对应角色的名字收进 unmatched（UI 要提示作者，别静默丢掉）。
 */
export function mergeRelations(
  existing: CharacterRelation[],
  incoming: TraitRelationDraft[],
  characters: Character[],
): { relations: CharacterRelation[]; unmatched: string[] } {
  const relations = [...(existing ?? [])];
  const unmatched: string[] = [];
  for (const rel of incoming) {
    const target = findCharacterByName(rel.target, characters);
    if (!target) { unmatched.push(rel.target); continue; }
    const at = relations.findIndex(r => r.characterId === target.id);
    if (at >= 0) relations[at] = { characterId: target.id, relation: rel.description };
    else relations.push({ characterId: target.id, relation: rel.description });
  }
  return { relations, unmatched };
}

/**
 * 组装保存用的补丁：只带作者确认过的字段（空值不覆盖已有内容），
 * 关系走合并（清空文本框不会删除已有关系，删除请去人物档案里操作）。
 */
export function buildCharacterPatch(
  character: Character,
  fields: Partial<Record<TraitTextFieldKey, string>>,
  relationsText: string,
  characters: Character[],
): { patch: Partial<Character>; unmatched: string[] } {
  const patch: Partial<Character> = {};
  for (const def of TRAIT_TEXT_FIELDS) {
    const value = clean(fields[def.key]);
    if (value) patch[def.key] = value;
  }
  let unmatched: string[] = [];
  const parsed = parseRelationsText(relationsText);
  if (parsed.length > 0) {
    const merged = mergeRelations(character.relationships ?? [], parsed, characters);
    patch.relationships = merged.relations;
    unmatched = merged.unmatched;
  }
  return { patch, unmatched };
}
