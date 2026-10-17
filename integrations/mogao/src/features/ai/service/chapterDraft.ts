/**
 * AI 服务 · 章级辅助：剧情骨架、骨架 → 正文、字数扩写、章节完成后的人物状态提取
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：json / transport（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { stripHtml } from '@/shared/lib/contentFormat';
import { qualityPolicy } from '@/shared/lib/qualityPolicy';
import { trunc } from '@/shared/lib/text';
import type {
  Chapter,
  FactLedger,
  Character,
  Project,
  RagChunk,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';
import { parseJsonFromAI } from './json';
import { buildLongFormContext } from './prompts';
import { streamChat } from './transport';

// ---------- 分层写作：先生成剧情骨架，再生成正文 ----------

export interface PlotPoint {
  scene: string;   // 场景/情境描述
  action: string;  // 核心动作/事件
  emotion: string; // 情绪节拍
  hook: string;    // 段末悬念/推进
}

/**
 * 第一层：生成章节剧情骨架（4-6个场景节拍）
 * 比直接生成正文质量更高，结构更清晰，不容易跑偏。
 */
export async function generateChapterPlotPoints(params: {
  project: Project;
  chapter: Chapter;
  outlineSummary: string;
  keyEvents: string[];
  characters: Character[];
  worldSettings?: WorldSetting[];
  prevSummary: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  ragChunks?: RagChunk[];
  onChunk?: (c: string) => void;
}): Promise<PlotPoint[]> {
  const { project, chapter, outlineSummary, keyEvents, characters, prevSummary, storyBible, ragChunks = [], onChunk } = params;

  const ctx = buildLongFormContext({ project, chapter, throughOrder: chapter.order - 1, outlineSummary, keyEvents,
    characters, worldSettings: params.worldSettings || [], prevSummary, targetWordCount: 0, instruction: '', storyBible, factLedger: params.factLedger, ragChunks });
  const charCtx = ctx.charsCtx, bibleHint = ctx.bibleCtx + ctx.factsCtx, ragHint = ctx.ragHint;

  const raw = await streamChat(
    `你是尊重作者创作方向的小说章节策划编辑。只输出纯 JSON 数组，不含 markdown。\n${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}`,
    `为《${project.title}》第${chapter.order}章《${chapter.title}》规划 4-6 个场景节拍（剧情骨架）。

大纲：${trunc(outlineSummary, 150)}
关键事件：${keyEvents.slice(0, 5).join('；')}
上章结尾：${ctx.prevSummary}
主要人物：\n${charCtx || '暂无'}
世界观：${ctx.worldCtx || '暂无'}\n${bibleHint}${ragHint}

要求：
- 每个节拍是一个独立可写的场景，有冲突和推进
- 节拍之间有承接关系，服务本章叙事意图
- 最后一个节拍可留悬念、余韵或完整收束，遵循作者目标

只输出JSON数组：
[{"scene":"场景描述（地点/时间/氛围）","action":"本段核心动作或事件（50字内）","emotion":"人物情绪节拍（20字内）","hook":"段末推进或悬念（20字内）"}]`,
    onChunk,
    2000,
    { jsonMode: true }
  );

  try {
    return parseJsonFromAI<PlotPoint[]>(raw).filter(p => p.action);
  } catch {
    return [];
  }
}

/**
 * 第二层：从剧情骨架生成完整章节正文
 * 每个 PlotPoint 对应约 target/plotPoints.length 字的段落。
 */
export async function generateChapterFromPlotPoints(params: {
  project: Project;
  chapter: Chapter;
  plotPoints: PlotPoint[];
  characters: Character[];
  worldSettings: WorldSetting[];
  prevSummary: string;
  targetWordCount: number;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, chapter, plotPoints, characters, worldSettings, prevSummary, targetWordCount, storyBible, styleFingerprint, ragChunks = [], onChunk } = params;

  const ctx = buildLongFormContext({ project, chapter, throughOrder: chapter.order - 1,
    outlineSummary: plotPoints.map(p => `${p.scene} ${p.action}`).join(' '), keyEvents: plotPoints.map(p => p.action), characters,
    worldSettings, prevSummary, targetWordCount, instruction: '', storyBible, factLedger: params.factLedger, styleFingerprint, ragChunks });
  const charsCtx = ctx.charsCtx, worldCtx = ctx.worldCtx, bibleCtx = ctx.bibleCtx + ctx.factsCtx, fpHint = ctx.fingerprintHint, ragHint = ctx.ragHint;

  const plotCtx = plotPoints.map((p, i) =>
    `场景${i + 1}：${p.scene}\n行动：${p.action}\n情绪：${p.emotion}\n推进：${p.hook}`
  ).join('\n\n');

  const system = `你是专业的小说写作助手，为《${project.title}》（${project.genre}）创作第${chapter.order}章《${chapter.title}》正文。
${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}
规则：
- 严格按场景顺序依次展开，每个场景对应约${Math.round(targetWordCount / plotPoints.length)}字
- 不要遗漏任何场景，场景之间自然过渡
- 最后一个场景按作者意图选择悬念、余韵或完整收束
- 不要输出标题或场景序号，直接输出正文${bibleCtx}${fpHint}`;

  return streamChat(system,
    `涉及人物：\n${charsCtx || '暂无'}
世界观：\n${worldCtx || '暂无'}
上章结尾情境：${ctx.prevSummary}${ragHint}

【剧情骨架（按顺序展开）】
${plotCtx}

总目标字数：约${targetWordCount}字。不要输出章节标题，直接输出正文。`,
    onChunk,
    Math.max(targetWordCount * 6, 3000)
  );
}

// ---------- 字数扩写 ----------

/**
 * 对已生成的章节正文进行扩写，直到达到目标字数。
 * 适用于批量生成后字数不足 80% 的章节。
 */
export async function expandChapterContent(params: {
  project: Project;
  chapter: Chapter;
  currentContent: string;
  targetWordCount: number;
  characters?: Character[];
  worldSettings?: WorldSetting[];
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, chapter, currentContent, targetWordCount, onChunk } = params;
  const currentText = stripHtml(currentContent);
  const currentCount = currentText.length;
  const needed = targetWordCount - currentCount;
  const ctx = buildLongFormContext({ project, chapter, throughOrder: chapter.order - 1, characters: params.characters || [],
    worldSettings: params.worldSettings || [], storyBible: params.storyBible, factLedger: params.factLedger, styleFingerprint: params.styleFingerprint,
    ragChunks: params.ragChunks, outlineSummary: currentText, keyEvents: [], instruction: '', targetWordCount, prevSummary: '' });

  return streamChat(
    `你是专业的小说续写编辑，负责对已有章节进行扩充增写。\n${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}\n已确认人物档案：\n${ctx.charsCtx}\n世界观：${ctx.worldCtx}${ctx.bibleCtx}${ctx.factsCtx}${ctx.fingerprintHint}${ctx.ragHint}\n要求：\n- 在已有内容末尾自然延续，不要重复已有内容\n- 保持原有文风、视角和人物性格\n- 直接输出续写正文，无任何前缀或解释`,
    `《${project.title}》第${chapter.order}章《${chapter.title}》需要扩写约${needed}字（目标总字数${targetWordCount}字，当前${currentCount}字）。

【已有正文末尾（最近1000字）】
${currentText.slice(-1000)}

请从上述内容结尾处自然续写约${needed}字的正文，不要重复已有内容，直接输出续写内容。`,
    onChunk,
    Math.max(needed * 6, 2000)
  );
}

// ---------- 章节完成后人物状态提取 ----------

export interface CharacterChangeItem {
  characterName: string;
  summary: string;   // 本章该人物的状态/关系变化摘要
}

/**
 * 从章节正文中提取各人物的状态变化，用于追加到人物档案的状态历史。
 * 仅在章节标记为"定稿"时调用，避免频繁触发。
 */
export async function extractCharacterChanges(params: {
  project: Project;
  chapter: Chapter;
  characters: Character[];
}): Promise<CharacterChangeItem[]> {
  const { project, chapter, characters } = params;
  if (!chapter.content || characters.length === 0) return [];

  const charNames = characters
    .filter(c => c.role === 'protagonist' || c.role === 'antagonist' || c.role === 'supporting')
    .slice(0, 10)
    .map(c => c.name)
    .join('、');

  const text = stripHtml(chapter.content).slice(0, 6000);

  const raw = await streamChat(
    '你是小说人物状态追踪员。只输出纯 JSON 数组，不含 markdown 或解释。',
    `从《${project.title}》第${chapter.order}章《${chapter.title}》中，提取以下人物在本章的状态/关系/能力变化。
只提取有实质性变化的人物，没有变化的不要出现。每条不超过60字。

需要关注的人物：${charNames}

章节正文：
${text}

只输出JSON数组：[{"characterName":"人物名","summary":"本章变化摘要（60字内）"}]`,
    undefined,
    1500
  );

  try {
    const parsed = parseJsonFromAI<CharacterChangeItem[]>(raw);
    return parsed.filter(item => item.characterName && item.summary);
  } catch {
    return [];
  }
}
