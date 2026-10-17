/** 单章经历提取；只读这章原文，长章节分段覆盖，不重新通读小说。通过 aiService 门面导出。 */
import { characterProfile } from '@/shared/lib/characterProfile';
import { PROFILE_CHANGE_LABELS } from '@/shared/lib/characterSync';
import { stripHtml } from '@/shared/lib/contentFormat';
import type { Chapter, Character, CharacterMemoryClaim, CharacterProfileChange, Project } from '@/shared/types';
import { parseJsonFromAI } from './json';
import { streamChat } from './transport';

const CHUNK_SIZE = 6000;
const CHUNK_OVERLAP = 400;
export interface ChapterMemoryDraft { characterId: string; claims: CharacterMemoryClaim[]; profileChanges?: CharacterProfileChange[] }
export function parseChapterMemoryDrafts(raw: string, source: string, characters: Character[]): ChapterMemoryDraft[] {
  const parsed = parseJsonFromAI<unknown>(raw);
  if (!Array.isArray(parsed)) throw new Error('模型未返回经历列表，请重试');
  const result = parsed.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('经历格式不正确，请重试');
    const row = item as Record<string, unknown>;
    if (typeof row.characterId !== 'string' || !characters.some(c => c.id === row.characterId) || !Array.isArray(row.claims)) {
      throw new Error('模型返回了未指定的角色或无效经历，请重试');
    }
    const claims = row.claims.map((value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('经历缺少正文依据，请重试');
      const c = value as CharacterMemoryClaim;
      if (!['experience', 'knowledge', 'state', 'relationship'].includes(c.kind) || typeof c.text !== 'string'
        || !c.text.trim() || c.text.length > 200 || typeof c.quote !== 'string' || !c.quote.trim()
        || c.quote.length > 400 || !source.includes(c.quote.trim())) throw new Error('经历引用不在原文中，请重新提取');
      return { kind: c.kind, text: c.text.trim(), quote: c.quote.trim() };
    });
    if (row.profileChanges !== undefined && !Array.isArray(row.profileChanges)) throw new Error('固定设定建议格式不正确');
    const profileChanges = ((row.profileChanges ?? []) as unknown[]).map(value => {
      if (!value || typeof value !== 'object') throw new Error('固定设定建议缺少正文依据');
      const change = value as CharacterProfileChange;
      if (!Object.keys(PROFILE_CHANGE_LABELS).includes(change.field) || typeof change.text !== 'string' || !change.text.trim()
        || change.text.length > 200 || typeof change.quote !== 'string' || !change.quote.trim()
        || change.quote.length > 400 || !source.includes(change.quote.trim())) throw new Error('固定设定建议引用不在原文中');
      return { field: change.field, text: change.text.trim(), quote: change.quote.trim(), status: 'pending' as const };
    });
    return { characterId: row.characterId, claims, profileChanges };
  });
  if (result.length !== characters.length || new Set(result.map(d => d.characterId)).size !== characters.length) {
    throw new Error('模型遗漏或重复了指定角色，请重新提取');
  }
  return result;
}
export async function extractChapterMemories(params: {
  project: Project; chapter: Chapter; characters: Character[]; signal?: AbortSignal;
}): Promise<ChapterMemoryDraft[]> {
  const { project, chapter, characters, signal } = params;
  const text = stripHtml(chapter.content);
  const profileUpdates = new Map(characters.map(c => [c.id, new Map<string, CharacterProfileChange>()]));
  const combined = new Map(characters.map(c => [c.id, new Map<string, CharacterMemoryClaim>()]));
  const system = `你为《${project.title}》维护人物的章节经历档案。对照已有档案，只记录当前原文带来的新信息。单纯提及名字、沿用已有状态且没有新事件的角色返回空列表。输出 JSON 数组。
每条记录是 {"characterId":"给定ID","claims":[{"kind":"experience|knowledge|state|relationship","text":"概述","quote":"逐字原文"}],"profileChanges":[{"field":"appearance|personality|goals|background|abilities|notes","text":"新增的固定设定","quote":"逐字原文"}]}。
experience 是角色亲历的行动与选择；knowledge 只能是角色本人已经看到、听到、得知的信息，不能把旁白或他人的秘密变成该角色的知识；state 是本段明确的处境、情绪、目标；relationship 是角色之间已发生的关系变化。
概述最多200字，引用最多400字，每条必须提供当前原文的逐字依据。不要把作者计划、未来剧情或猜测写成已发生的经历。所有指定角色必须各返回一次，无信息的角色 claims 为空。每个角色每段最多4条，不重复同一件事。已有档案只用于比较，不能作为本章依据。profileChanges 仅写正文新揭示的稳定特点、长期动机、能力或背景，每字段最多一条；一时情绪与短期目标写入 state，不改固定性格。没有依据就为空数组。`;
  for (let start = 0; start < text.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
    const source = text.slice(start, start + CHUNK_SIZE);
    // 原文是唯一证据；既有档案仅作差异比较，近期状态按章节范围裁剪。
    for (let i = 0; i < characters.length; i += 6) {
      const batch = characters.slice(i, i + 6);
      const baseline = batch.map(c => {
        const dynamic = (c.lifeMemories ?? []).filter(m => m.status === 'confirmed' && m.chapterOrder < chapter.order)
          .sort((a, b) => a.chapterOrder - b.chapterOrder).slice(-3).flatMap(m => m.claims).filter(claim => claim.kind !== 'experience').map(claim => claim.text).join('；').slice(-800);
        return `${c.id}：${characterProfile(c, batch, 80, { includeMemory: false })}\n已记录的近期状态与知识：${dynamic || '暂无'}`;
      }).join('\n');
      const user = `第${chapter.order}章《${chapter.title}》，正文片段${Math.floor(start / (CHUNK_SIZE - CHUNK_OVERLAP)) + 1}。
已有档案（仅用于比较，不能作为本章证据）：
${baseline}
指定角色：${batch.map(c => `${c.id}：${c.name}（${(c.aliases ?? []).join('、')}）`).join('；')}
原文：
${source}`;
      const raw = await streamChat(system, user, undefined, Math.min(8000, 600 + batch.length * 1400), { signal, jsonMode: true, temperature: 0.2 });
      for (const draft of parseChapterMemoryDrafts(raw, source, batch)) {
        const entries = combined.get(draft.characterId)!;
        for (const change of draft.profileChanges ?? []) profileUpdates.get(draft.characterId)!.set(change.field, change);
        for (const claim of draft.claims) entries.set(`${claim.kind}:${claim.quote}`, claim);
      }
    }
  }
  return characters.map(c => {
    const claims = [...combined.get(c.id)!.values()];
    // 不静默截掉长章信息；作者可拆章，或改用档案里的单章重试。
    if (claims.length > 12) throw new Error(`${c.name}在本章的经历超过12条，请拆分章节后重新整理`);
    return { characterId: c.id, claims, profileChanges: [...profileUpdates.get(c.id)!.values()] };
  });
}
