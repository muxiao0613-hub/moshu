/**
 * AI 批量生成 · 「保存选中」的落库分派（人物 / 世界观 / 大纲 / 伏笔 / 时间线 / 章节）。
 *
 * 位置：./batch 的落库层，被 useBatchGenerate 的 handleSaveStep 与 handleSaveAll 调用；
 * 只做「按步骤 key 选对应仓储」的分派，失败直接抛出由 hook 统一 toast。
 * 依赖方向：@/api + @/features/ai/aiService（草稿类型）→ ./batchUtils（大纲展开）、./types；不引用展示组件。
 */
import { v4 as uuidv4 } from 'uuid';

import { synchronizeChapter } from '@/features/chapter/writeback';
import type { CharacterSyncPreferences } from '@/shared/types';
import type {
  CharacterDraft,
  OutlineDraft,
  ThreadDraft,
  TimelineDraft,
  WorldDraft,
} from '@/features/ai/aiService';
import {
  countWords,
  getCharacters,
  getTimelineEvents,
  saveChapter,
  saveCharacter,
  saveOutline,
  saveThread,
  saveTimelineEvent,
  saveWorldSetting,
} from '@/api';

import { flattenOutlines } from './batchUtils';
import type { ChapterBatchItem, StepKey } from './types';

export interface SaveStepParams {
  projectId: string;
  characterSyncPreferences?: CharacterSyncPreferences;
  /** 该步骤的完整产出（未筛选） */
  data: unknown[];
  /** 勾选下标集合 */
  selected: Set<number>;
}

export async function saveStep(key: StepKey, p: SaveStepParams): Promise<void> {
  const { projectId, data, selected } = p;
  if (data.length === 0) return;
  const toSave = data.filter((_, i) => selected.has(i));

  if (key === 'characters') {
    // 第一步：保存所有人物，记录 name -> id 映射
    const nameToId: Record<string, string> = Object.fromEntries((await getCharacters(projectId)).map(c => [c.name, c.id]));
    const charIds: string[] = [];
    for (const d of toSave as CharacterDraft[]) {
      const cid = uuidv4();
      charIds.push(cid);
      nameToId[d.name] = cid;
      await saveCharacter({
        id: cid, projectId,
        name: d.name, role: d.role,
        aliases: d.aliases || [],
        appearance: d.appearance || '',
        personality: d.personality || '',
        background: d.background || '',
        abilities: d.abilities || '',
        arc: d.arc || '',
        relationships: [],
        firstAppearance: '',
        notes: '',
      });
    }
    // 第二步：更新 relationships，将 characterName 映射为 characterId
    for (let i = 0; i < (toSave as CharacterDraft[]).length; i++) {
      const d = (toSave as CharacterDraft[])[i];
      const cid = charIds[i];
      const relationships = (d.relationships || []).map(r => ({
        characterId: nameToId[r.characterName] || r.characterName,
        relation: r.relation,
      })).filter(r => Object.values(nameToId).includes(r.characterId));

      if (relationships.length > 0) {
        const char = (await getCharacters(projectId)).find(c => c.id === cid);
        if (char) {
          await saveCharacter({ ...char, relationships });
        }
      }
    }
  } else if (key === 'world') {
    for (const d of toSave as WorldDraft[]) {
      await saveWorldSetting({ id: uuidv4(), projectId, ...d });
    }
  } else if (key === 'outlines') {
    // 展开嵌套结构
    const flat = flattenOutlines(toSave as OutlineDraft[], projectId);
    for (const o of flat) await saveOutline(o);
  } else if (key === 'threads') {
    for (const d of toSave as ThreadDraft[]) {
      await saveThread({
        id: uuidv4(), projectId,
        title: d.title, description: d.description,
        importance: d.importance, status: d.status,
        plantedAt: d.plantedAt || '', notes: d.notes || '',
        relatedChapters: [], relatedCharacters: [],
      });
    }
  } else if (key === 'timeline') {
    // 获取现有最大 order，为新事件计算递增的 order 值
    const existingTimeline = await getTimelineEvents(projectId);
    let maxOrder = existingTimeline?.length > 0 ? Math.max(...existingTimeline.map(e => e.order)) : -1;
    for (const d of toSave as TimelineDraft[]) {
      maxOrder++;
      await saveTimelineEvent({
        id: uuidv4(), projectId,
        title: d.title, description: d.description,
        date: d.date, line: d.line,
        type: d.type, characters: [],
        order: maxOrder,
      });
    }
  } else if (key === 'chapters') {
    for (const { chapter, content } of (toSave as ChapterBatchItem[])) {
      const saved = await saveChapter({
        id: chapter.id,
        projectId,
        content,
        wordCount: countWords(content),
        updatedAt: new Date(),
      });
      const report = await synchronizeChapter(saved, p.characterSyncPreferences);
      if (report.errors.length) throw new Error('正文已保存，部分人物档案更新失败，可重试同步');
    }
  }
}
