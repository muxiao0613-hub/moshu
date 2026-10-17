/**
 * AI 服务 · 各模块的「AI 续写」：在已有内容之后继续产出人物 / 世界观 / 伏笔 / 时间线 / 大纲
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：drafts / json / transport（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { trunc } from '@/shared/lib/text';
import type { Character, Outline, PlotThread, Project, TimelineEvent, WorldSetting } from '@/shared/types';
import type { CharacterDraft, OutlineDraft, ThreadDraft, TimelineDraft, WorldDraft } from './drafts';
import { parseJsonFromAI } from './json';
import { streamChat } from './transport';

// ---------- 大纲续写 ----------

export type OutlineContinuationDraft = OutlineDraft & { parentId?: string };

// ================================================================
// 各模块 AI 续写（严格遵循已有设定，不偏离）
// ================================================================

/** 人物续写：补充新人物，不与已有人物重复或矛盾 */
export async function generateCharactersContinuation(params: {
  project: Project;
  existingChars: Character[];
  existingWorld: WorldSetting[];
  instruction: string;
  count: number;
  onChunk?: (c: string) => void;
}): Promise<CharacterDraft[]> {
  const { project, existingChars, existingWorld, instruction, count, onChunk } = params;

  const charList = existingChars.map(c =>
    `- ${c.name}（${c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}）：${trunc(c.personality, 50)}；能力：${trunc(c.abilities, 40)}`
  ).join('\n');

  const worldList = existingWorld.slice(0, 6).map(s => `${s.title}（${s.category}）`).join('、');

  const text = await streamChat(
    '你是小说人物设计师。只输出纯 JSON 数组，不含其他文字。',
    `为小说《${project.title}》（${project.genre}）续写 ${count} 个新人物。

作品简介：${trunc(project.synopsis, 150)}
世界观：${worldList || '暂无'}

已有人物（必须参考，不得重名或功能重叠）：
${charList || '（暂无）'}

续写要求：
- 新人物须与已有人物有合理关联（如师徒、对手、盟友等）
- 能力/背景必须符合现有世界观设定
- 角色定位与已有人物互补，不重复
${instruction ? `- 额外要求：${instruction}` : ''}

只输出 JSON 数组：
[{"name":"姓名","role":"protagonist|antagonist|supporting|minor","appearance":"外貌80字内","personality":"性格80字内","background":"背景100字内","abilities":"能力60字内","arc":"命运60字内","aliases":[]}]`,
    onChunk, Math.min(count * 250 + 400, 3000), { jsonMode: true }
  );
  try { return parseJsonFromAI<CharacterDraft[]>(text); } catch { return []; }
}

/** 世界观续写：补充新设定，不与已有设定矛盾 */
export async function generateWorldContinuation(params: {
  project: Project;
  existingWorld: WorldSetting[];
  existingChars: Character[];
  instruction: string;
  count: number;
  onChunk?: (c: string) => void;
}): Promise<WorldDraft[]> {
  const { project, existingWorld, existingChars, instruction, count, onChunk } = params;

  const worldList = existingWorld.map(s =>
    `- 【${s.category}】${s.title}：${trunc(s.content, 80)}`
  ).join('\n');

  const charNames = existingChars.slice(0, 8).map(c => c.name).join('、');

  // 统计已有分类，优先补充空缺的
  const coveredCats = new Set(existingWorld.map(s => s.category));
  const ALL_CATS = ['地理', '修炼体系', '魔法体系', '势力', '历史', '种族', '道具', '规则', '文化'];
  const missingCats = ALL_CATS.filter(c => !coveredCats.has(c));

  const text = await streamChat(
    '你是世界观设定师。只输出纯 JSON 数组，不含其他文字。',
    `为小说《${project.title}》（${project.genre}）续写 ${count} 条世界观设定。

作品简介：${trunc(project.synopsis, 150)}
主要人物：${charNames || '暂无'}

已有设定（必须参考，所有新内容须与此自洽）：
${worldList || '（暂无）'}

续写要求：
- 绝对不能与已有设定产生逻辑矛盾
- 优先补充尚未涉及的分类（推荐：${missingCats.slice(0, 4).join('、') || '任意'}）
- 细化或扩展现有设定的未描述方面
${instruction ? `- 额外要求：${instruction}` : ''}

只输出 JSON 数组：
[{"category":"分类","title":"标题","content":"详细内容150字内","tags":["关键词"]}]`,
    onChunk, Math.min(count * 250 + 400, 3000), { jsonMode: true }
  );
  try { return parseJsonFromAI<WorldDraft[]>(text); } catch { return []; }
}

/** 伏笔续写：添加新伏笔，与已有伏笔形成关联网络 */
export async function generateThreadsContinuation(params: {
  project: Project;
  existingThreads: PlotThread[];
  existingChars: Character[];
  existingOutlines: Outline[];
  instruction: string;
  count: number;
  onChunk?: (c: string) => void;
}): Promise<ThreadDraft[]> {
  const { project, existingThreads, existingChars, existingOutlines, instruction, count, onChunk } = params;

  const threadList = existingThreads.map(t =>
    `- 【${t.importance}/${t.status}】${t.title}：${trunc(t.description, 60)}（埋于${t.plantedAt}）`
  ).join('\n');

  const chapterTitles = existingOutlines
    .filter(o => o.type === 'chapter')
    .slice(0, 15).map(o => o.title).join('、');

  const charNames = existingChars.slice(0, 8).map(c => c.name).join('、');

  const text = await streamChat(
    '你是伏笔设计师。只输出纯 JSON 数组，不含其他文字。',
    `为小说《${project.title}》续写 ${count} 条新伏笔/线索。

作品简介：${trunc(project.synopsis, 150)}
人物：${charNames || '暂无'}
章节（节选）：${chapterTitles || '暂无'}

已有伏笔（必须参考，新伏笔须与此呼应、不矛盾）：
${threadList || '（暂无）'}

续写要求：
- 新伏笔应与已有伏笔形成因果、呼应或对比关系
- 不得与已回收/废弃的伏笔重复
- 埋设章节须晚于或平行于已有伏笔的埋设位置
${instruction ? `- 额外要求：${instruction}` : ''}

只输出 JSON 数组：
[{"title":"标题","description":"描述80字内","importance":"critical|major|minor","status":"planted","plantedAt":"埋设章节","notes":"展开与回收建议60字内"}]`,
    onChunk, Math.min(count * 200 + 300, 2000), { jsonMode: true }
  );
  try { return parseJsonFromAI<ThreadDraft[]>(text); } catch { return []; }
}

/** 时间线续写：填补空白或延续末尾，严格遵守时间顺序 */
export async function generateTimelineContinuation(params: {
  project: Project;
  existingEvents: TimelineEvent[];
  existingChars: Character[];
  instruction: string;
  count: number;
  onChunk?: (c: string) => void;
}): Promise<TimelineDraft[]> {
  const { project, existingEvents, existingChars, instruction, count, onChunk } = params;

  // 按 order 排序后列出
  const sorted = [...existingEvents].sort((a, b) => a.order - b.order);
  const eventList = sorted.map((e, i) =>
    `${i + 1}. [${e.line}][${e.type}] ${e.date} ${e.title}：${trunc(e.description, 60)}`
  ).join('\n');

  const charNames = existingChars.slice(0, 8).map(c => c.name).join('、');

  const text = await streamChat(
    '你是时间线规划师。只输出纯 JSON 数组，不含其他文字。',
    `为小说《${project.title}》续写 ${count} 条时间线事件。

作品简介：${trunc(project.synopsis, 150)}
人物：${charNames || '暂无'}

已有时间线（严格参考，新事件不得与已有事件产生因果矛盾）：
${eventList || '（暂无）'}

续写要求：
- 新事件须填补上述事件之间的空白，或延续最后一个事件
- 严守已有事件确立的时间顺序，不能出现时序矛盾
- 与已有事件的人物行为保持一致
${instruction ? `- 额外要求：${instruction}` : ''}

只输出 JSON 数组：
[{"title":"事件名","description":"描述60字内","date":"故事时间（与已有格式一致）","line":"主线|支线","type":"event|flashback|foreshadow"}]`,
    onChunk, Math.min(count * 200 + 300, 2000), { jsonMode: true }
  );
  try { return parseJsonFromAI<TimelineDraft[]>(text); } catch { return []; }
}

export async function generateOutlineContinuation(params: {
  project: Project;
  existingOutlines: Outline[];
  characters: Character[];
  instruction: string;
  count: number;          // 续写几章
  onChunk?: (c: string) => void;
}): Promise<OutlineContinuationDraft[]> {
  const { project, existingOutlines, characters, instruction, count, onChunk } = params;

  // 找最后一个卷/顶层节点，续写挂载到它下面
  const lastVolume = [...existingOutlines]
    .reverse()
    .find(o => o.type === 'volume' && !o.parentId);

  const existingChapters = existingOutlines
    .filter(o => o.type === 'chapter')
    .sort((a, b) => a.order - b.order)
    .slice(-10) // 只传最近10章作参考
    .map(o => `《${o.title}》：${trunc(o.summary, 60)}`)
    .join('\n');

  const charSummary = characters
    .filter(c => c.role === 'protagonist' || c.role === 'antagonist')
    .slice(0, 4)
    .map(c => `${c.name}：${trunc(c.personality, 40)}`)
    .join('；');

  const text = await streamChat(
    '你是专业的小说策划师。只输出纯 JSON 数组，不含其他文字或 markdown。',
    `为小说《${project.title}》（${project.genre}）续写 ${count} 个章节大纲。

作品简介：${trunc(project.synopsis, 150)}
主要人物：${charSummary || '暂无'}
已有末尾章节（参考）：
${existingChapters || '（暂无已有章节）'}
${instruction ? `续写要求：${instruction}` : '请自然延续已有剧情走向'}

${lastVolume ? `挂载到卷《${lastVolume.title}》下` : '作为独立章节'}

只输出 JSON 数组：
[{"type":"chapter","title":"第X章 章名","summary":"本章概要80字内","keyEvents":["事件1","事件2","事件3"]}]`,
    onChunk,
    Math.min(count * 300 + 500, 4000),
    { jsonMode: true }
  );

  try {
    const drafts = parseJsonFromAI<OutlineContinuationDraft[]>(text);
    return drafts.map(d => ({
      ...d,
      parentId: lastVolume?.id,
      keyEvents: d.keyEvents || [],
      children: [],
    }));
  } catch {
    return [];
  }
}
