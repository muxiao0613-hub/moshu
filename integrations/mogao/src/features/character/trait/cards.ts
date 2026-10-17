/**
 * 人设草稿 → 面板可编辑状态（纯逻辑，不依赖 React）。
 *
 * 与 ../traitDraft 的分工：traitDraft 管「字段该怎么合成」（替换/追加、关系合并、保存补丁），
 * 这里管「草稿摆到界面上长什么样」——素材没体现的字段直接不出现，免得作者以为必须逐项填。
 */
import type { CharacterTraitDraft } from '@/features/ai/aiService';
import type { Character } from '@/shared/types';
import {
  TRAIT_TEXT_FIELDS,
  findCharacterByName,
  relationsToText,
  traitTextForField,
  type TraitTextFieldKey,
} from '../traitDraft';

export interface TraitFieldState {
  key: TraitTextFieldKey;
  label: string;
  mode: 'replace' | 'append';
  value: string;
  enabled: boolean;
  /** 原本已有内容（replace 模式会覆盖，界面上要提醒作者） */
  existing: string;
  evidence?: string;
}

export interface TraitCard {
  key: string;
  draftName: string;
  characterId?: string;
  fields: TraitFieldState[];
  relationsText: string;
  saved: boolean;
  saving: boolean;
}

/**
 * 关系文本：档案里已认得的名字 → 名字；模型给的新关系默认补充同一人的描述；
 * 档案里没有的名字**原样留在文本里**，等作者自己决定是新建人物还是删掉这行。
 */
export function buildRelationsText(draft: CharacterTraitDraft, character: Character | undefined, characters: Character[]): string {
  const lines = relationsToText(character?.relationships ?? [], characters).split('\n').filter(Boolean);
  for (const rel of draft.relationships ?? []) {
    const known = findCharacterByName(rel.target, characters);
    if (!known) {
      if (rel.target || rel.description) lines.push(`${rel.target}：${rel.description}`);
      continue;
    }
    const line = `${known.name}：${rel.description}`;
    const at = lines.findIndex(l => l.startsWith(`${known.name}：`));
    if (at >= 0) {
      if (!lines[at].includes(rel.description)) lines[at] += `；${rel.description}`;
    }
    else lines.push(line);
  }
  return lines.join('\n');
}

export function buildCards(drafts: CharacterTraitDraft[], characters: Character[]): TraitCard[] {
  return drafts.map((draft, i) => {
    const character = findCharacterByName(draft.name, characters);
    const fields: TraitFieldState[] = [];
    for (const def of TRAIT_TEXT_FIELDS) {
      const value = traitTextForField(def, draft, character);
      if (!value) continue; // 素材没体现的字段不摆出来，免得作者以为必须填
      fields.push({
        key: def.key,
        label: def.label,
        mode: def.mode,
        value,
        enabled: true,
        existing: (character?.[def.key] ?? '') as string,
        evidence: draft.evidence?.[def.key],
      });
    }
    return {
      key: `${draft.name}-${i}`,
      draftName: draft.name,
      characterId: character?.id,
      fields,
      relationsText: buildRelationsText(draft, character, characters),
      saved: false,
      saving: false,
    };
  });
}
