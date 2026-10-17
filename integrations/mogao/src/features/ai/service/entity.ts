/**
 * AI 服务 · 实体字段与批量生成：人物 / 世界观 / 大纲 / 伏笔 / 时间线
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：drafts / json / prompts / transport（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { trunc } from '@/shared/lib/text';
import type { Character, Outline, PlotThread, Project, TimelineEvent, WorldSetting } from '@/shared/types';
import type { CharacterDraft, OutlineDraft, ThreadDraft, TimelineDraft, WorldDraft } from './drafts';
import { parseJsonFromAI } from './json';
import { buildEntitySystem } from './prompts';
import { streamChat } from './transport';

export async function generateForCharacter(params: {
  project: Project; character: Partial<Character>;
  field: string; fieldLabel: string; instruction: string;
  allChars: Character[]; allWorld: WorldSetting[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, character, fieldLabel, instruction, allChars, allWorld, onChunk } = params;
  const system = buildEntitySystem(project, allChars, allWorld);

  // 只传已知字段的简短概要，不传全量
  const known = [
    character.name && `姓名：${character.name}`,
    character.role && `定位：${character.role === 'protagonist' ? '主角' : character.role === 'antagonist' ? '反派' : '配角'}`,
    character.personality && `性格：${trunc(character.personality, 80)}`,
    character.background && `背景：${trunc(character.background, 80)}`,
  ].filter(Boolean).join('\n');

  return streamChat(system,
    `为人物「${character.name || '（未命名）'}」生成【${fieldLabel}】。\n已知：\n${known || '暂无'}\n${instruction ? `要求：${instruction}` : `生成合理的${fieldLabel}，150字以内。`}\n\n直接输出内容。`,
    onChunk, 512);
}

export async function generateForWorld(params: {
  project: Project; setting: Partial<WorldSetting>; instruction: string;
  allChars: Character[]; allWorld: WorldSetting[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, setting, instruction, allChars, allWorld, onChunk } = params;
  const system = buildEntitySystem(project, allChars, allWorld);

  // 相关已有设定：同分类最多 3 条，只取标题+前80字
  const related = allWorld
    .filter(s => s.category === setting.category && s.id !== setting.id)
    .slice(0, 3)
    .map(s => `${s.title}：${trunc(s.content, 80)}`).join('\n');

  return streamChat(system,
    `为「${setting.title || '（未命名）'}」（${setting.category}）生成详细内容。\n同类已有设定：\n${related || '暂无'}\n${instruction ? `要求：${instruction}` : '300字以内，详细描述特点及与其他设定的关联。'}\n\n直接输出内容。`,
    onChunk, 700);
}

export async function generateForOutline(params: {
  project: Project; outline: Partial<Outline>; field: 'summary' | 'keyEvents';
  instruction: string; allChars: Character[]; allWorld: WorldSetting[];
  siblings: Outline[]; onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, outline, field, instruction, allChars, allWorld, siblings, onChunk } = params;
  const system = buildEntitySystem(project, allChars, allWorld);

  // 前后各 2 个兄弟节点作为参考
  const siblingsCtx = siblings.slice(0, 4).map(s => `${s.title}：${trunc(s.summary, 60)}`).join('\n');

  return streamChat(system,
    `为大纲节点「${outline.title}」（${outline.type === 'volume' ? '卷' : outline.type === 'arc' ? '篇' : '章'}）生成【${field === 'summary' ? '概要' : '关键事件'}】。\n相邻节点：\n${siblingsCtx || '暂无'}\n${instruction ? `要求：${instruction}` : field === 'summary' ? '100字以内概要。' : '3-5个关键情节点，每条20字内，换行分隔。'}\n\n直接输出。`,
    onChunk, 300);
}

export async function generateForThread(params: {
  project: Project; thread: Partial<PlotThread>; field: 'description' | 'notes';
  instruction: string; allChars: Character[]; allWorld: WorldSetting[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, thread, field, instruction, allChars, allWorld, onChunk } = params;
  const system = buildEntitySystem(project, allChars, allWorld);

  return streamChat(system,
    `为伏笔「${thread.title}」生成【${field === 'description' ? '内容描述' : '展开建议'}】。\n重要程度：${thread.importance} | 埋设：${thread.plantedAt || '未定'}\n${instruction ? `要求：${instruction}` : '100字以内。'}\n\n直接输出。`,
    onChunk, 300);
}

export async function generateForTimeline(params: {
  project: Project; event: Partial<TimelineEvent>; instruction: string;
  allChars: Character[]; nearbyEvents: TimelineEvent[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, event, instruction, allChars, nearbyEvents, onChunk } = params;
  // 时间线生成不需要世界观，减少 token
  const system = buildEntitySystem(project, allChars, []);
  const nearby = nearbyEvents.slice(0, 3).map(e => `${e.date} ${e.title}`).join('、');

  return streamChat(system,
    `为事件「${event.title}」（${event.date} | ${event.line}）生成描述。\n邻近事件：${nearby || '无'}\n${instruction ? `要求：${instruction}` : '80字以内。'}\n\n直接输出。`,
    onChunk, 250);
}

// ---------- 批量生成 ----------

export async function batchGenerateCharacters(params: {
  project: Project; instruction: string; count?: number;
  onChunk?: (c: string) => void;
}): Promise<CharacterDraft[]> {
  const { project, instruction, count = 6, onChunk } = params;
  const instructionBlock = instruction ? '\n要求：' + instruction : '';
  const text = await streamChat(
    '你是小说人物设计师。只输出纯 JSON 数组，不含其他文字。',
    '为《' + project.title + '》（' + project.genre + '）设计' + count + '个人物。\n简介：' + trunc(project.synopsis, 200) + instructionBlock +
    '\n\n每个人物需包含：\n' +
    '- name：姓名\n' +
    '- role：protagonist|antagonist|supporting|minor\n' +
    '- appearance：外貌80字内\n' +
    '- personality：性格80字内\n' +
    '- background：背景100字内\n' +
    '- abilities：能力60字内\n' +
    '- arc：命运60字内\n' +
    '- aliases：别名数组\n\n' +
    '只输出JSON数组：\n' +
    '[{"name":"姓名","role":"protagonist|antagonist|supporting|minor","appearance":"外貌80字内","personality":"性格80字内","background":"背景100字内","abilities":"能力60字内","arc":"命运60字内","aliases":[]}]',
    onChunk, Math.max(8000, count * 300), { jsonMode: true }
  );
  const drafts = parseJsonFromAI<CharacterDraft[]>(text).map(d => ({
    ...d,
    relationships: d.relationships || [],
  }));

  return enrichCharacterRelationships(project, drafts, onChunk);
}

export async function batchGenerateWorldSettings(params: {
  project: Project; characters: CharacterDraft[]; instruction: string;
  onChunk?: (c: string) => void;
}): Promise<WorldDraft[]> {
  const { project, characters, instruction, onChunk } = params;
  // 人物信息只传名字+角色，不传全量
  const charNames = characters.slice(0, 8).map(c => c.name).join('、');
  const instructionBlock = instruction ? '\n要求：' + instruction : '';
  const text = await streamChat(
    '你是世界观设定师。只输出纯 JSON 数组，不含其他文字。',
    '为《' + project.title + '》（' + project.genre + '）构建世界观（8-12条）。\n简介：' + trunc(project.synopsis, 200) + '\n主要人物：' + charNames + instructionBlock +
    '\n\n只输出JSON数组：\n[{"category":"分类","title":"标题","content":"详细内容150字内","tags":["关键词"]}]',
    onChunk, 8000, { jsonMode: true }
  );
  return parseJsonFromAI<WorldDraft[]>(text);
}

export async function batchGenerateOutlines(params: {
  project: Project; characters: CharacterDraft[]; instruction: string;
  volumeCount?: number; chaptersPerVolume?: number;
  onChunk?: (c: string) => void;
}): Promise<OutlineDraft[]> {
  const { project, characters, instruction, volumeCount = 3, chaptersPerVolume = 8, onChunk } = params;
  // 只传主角/反派，且只取名字+性格简述
  const mainChars = characters
    .filter(c => c.role === 'protagonist' || c.role === 'antagonist')
    .slice(0, 4)
    .map(c => c.name + '（' + (c.role === 'protagonist' ? '主角' : '反派') + '）：' + trunc(c.personality, 50))
    .join('\n');
  const instructionBlock = instruction ? '\n' + instruction : '';

  const text = await streamChat(
    '你是小说策划师。只输出纯 JSON 数组，不含其他文字。',
    '为《' + project.title + '》（' + project.genre + '）规划' + volumeCount + '卷共约' + (volumeCount * chaptersPerVolume) + '章大纲。\n简介：' + trunc(project.synopsis, 200) + '\n主角：\n' + mainChars + instructionBlock +
    '\n\n必须严格逐章输出，不得把多章合并成一章，不得只写卷级总述。每一章只写一条简述，格式必须一致，章节顺序必须从第1章开始递增。\n\n只输出JSON数组（卷→章两级）：\n' +
    '[{"type":"volume","title":"卷名","summary":"卷级简述80字内","keyEvents":[],"children":[{"type":"chapter","title":"第1章 名","summary":"本章简述60字内，只描述这一章的核心事件","keyEvents":["事件1","事件2","事件3"],"children":[]},{"type":"chapter","title":"第2章 名","summary":"本章简述60字内，只描述这一章的核心事件","keyEvents":["事件1","事件2","事件3"],"children":[]}]}]',
    onChunk, Math.max(12000, chaptersPerVolume * volumeCount * 15), { jsonMode: true }
  );
  return parseJsonFromAI<OutlineDraft[]>(text);
}

export async function batchGenerateThreads(params: {
  project: Project; characters: CharacterDraft[]; outlines: OutlineDraft[];
  instruction: string; onChunk?: (c: string) => void;
}): Promise<ThreadDraft[]> {
  const { project, characters, outlines, instruction, onChunk } = params;
  const charNames = characters.slice(0, 6).map(c => c.name).join('、');
  // 大纲只取卷标题+前几章名
  const chapterTitles = outlines.flatMap(o => o.children || []).slice(0, 12).map(c => c.title).join('、');
  const instructionBlock = instruction ? '\n要求：' + instruction : '';

  const text = await streamChat(
    '你是伏笔设计师。只输出纯 JSON 数组，不含其他文字。',
    '为《' + project.title + '》设计6-8条伏笔。\n简介：' + trunc(project.synopsis, 150) + '\n人物：' + charNames + '\n章节：' + chapterTitles + instructionBlock +
    '\n\n只输出JSON数组：\n[{"title":"标题","description":"描述80字内","importance":"critical|major|minor","status":"planted","plantedAt":"埋设章节","notes":"回收建议60字内"}]',
    onChunk, 6000, { jsonMode: true }
  );
  return parseJsonFromAI<ThreadDraft[]>(text);
}

export async function batchGenerateTimeline(params: {
  project: Project; characters: CharacterDraft[]; outlines: OutlineDraft[];
  instruction: string; onChunk?: (c: string) => void;
}): Promise<TimelineDraft[]> {
  const { project, outlines, instruction, onChunk } = params;
  const chapterList = outlines
    .flatMap(o => o.children || [])
    .slice(0, 20)
    .map(c => c.title + '：' + trunc(c.summary, 50))
    .join('\n');
  const instructionBlock = instruction ? '\n要求：' + instruction : '';

  const text = await streamChat(
    '你是时间线规划师。只输出纯 JSON 数组，不含其他文字。',
    '为《' + project.title + '》设计8-12条时间线事件。\n简介：' + trunc(project.synopsis, 150) + '\n章节（节选）：\n' + chapterList + instructionBlock +
    '\n\n只输出JSON数组：\n[{"title":"事件名","description":"描述60字内","date":"故事时间","line":"主线|支线","type":"event|flashback|foreshadow"}]',
    onChunk, 6000, { jsonMode: true }
  );
  return parseJsonFromAI<TimelineDraft[]>(text);
}

/** 长篇上下文块：整章生成与单场重写共用，保证两条路径看到的设定完全一致 */
// ---------- 人物关系补全 ----------

async function enrichCharacterRelationships(
  project: Project,
  drafts: CharacterDraft[],
  onChunk?: (c: string) => void
): Promise<CharacterDraft[]> {
  if (drafts.length < 2) {
    return drafts.map(d => ({ ...d, relationships: d.relationships || [] }));
  }

  const relationText = await streamChat(
    '你是人物关系设计师。只输出纯 JSON 数组，不含其他文字。',
    `为《${project.title}》的以下人物补充关系，只能基于已给出人物之间建立关系，不要引入新人物。\n\n人物清单：\n${drafts.map((d, i) => `${i + 1}. ${d.name}（${d.role}）：${trunc(d.personality, 40)}`).join('\n')}\n\n要求：\n- 每个人物给出 1 到 3 条关系，宁少勿空。\n- 关系对象必须来自人物清单。\n- 关系描述简短直接，如 兄妹、旧识、师徒、宿敌、同盟、上下级、监视者。\n- 必须覆盖尽量多的人物，避免所有人都互相独立。\n\n只输出JSON数组：\n[{"name":"人物名","relationships":[{"characterName":"对方名字","relation":"朋友"}]}]`,
    onChunk,
    5000,
    { jsonMode: true }
  );

  try {
    const relationDrafts = parseJsonFromAI<Array<{ name: string; relationships?: { characterName: string; relation: string }[] }>>(relationText);
    const relationMap = new Map(relationDrafts.map(item => [item.name, item.relationships || []]));
    return drafts.map(d => ({
      ...d,
      relationships: relationMap.get(d.name) || d.relationships || [],
    }));
  } catch {
    return drafts.map(d => ({ ...d, relationships: d.relationships || [] }));
  }
}
