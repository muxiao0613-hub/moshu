/**
 * AI 服务 · 提示词组装：续写系统提示、长文上下文、节拍蓝图、实体字段系统提示、平台硬约束
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：（无：纯字符串拼装）（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { buildContextPlan, type ContextGroupKey, type ContextPlan } from '@/features/context/contextPlan';
import { loadContextPrefs, type ContextPrefs } from '@/features/context/contextPrefs';
import { PLATFORM_CONFIGS, type PlatformConfig } from '@/shared/lib/storyRules';
import { trunc } from '@/shared/lib/text';
import { qualityPolicy } from '@/shared/lib/qualityPolicy';
import type {
  AIContextInfo,
  Chapter,
  ChapterBeatCard,
  Character,
  FactLedger,
  Outline,
  PlotThread,
  Project,
  RagChunk,
  SceneBeat,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';

// ---------- 章节 AI ----------

/**
 * 构建章节 system prompt。
 *
 * 上下文的选择 / 截断 / 开关 / 固定 / token 预算全部由 `buildContextPlan()`
 * 决定（features/context/contextPlan.ts），这里只负责套模板拼装。
 * 右栏「上下文」抽屉读的是同一个 plan，所以面板上看到的就是真正喂进去的。
 */
export function buildChapterSystemPrompt(params: {
  project: Project;
  chapter?: Chapter | null;
  /** 全量候选，相关性筛选由上下文编译器负责 */
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  prevChapterSummary: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  prefs?: ContextPrefs | null;
}): { prompt: string; contextInfo: AIContextInfo; plan: ContextPlan } {
  const {
    project, chapter, characters, worldSettings, outlines, threads,
    storyBible, factLedger = [], styleFingerprint, ragChunks = [], prefs,
    prevChapterSummary: rawPrevSummary = '',
  } = params;

  const plan = buildContextPlan({
    project,
    chapter,
    characters,
    worldSettings,
    outlines,
    threads,
    storyBible,
    factLedger,
    styleFingerprint,
    // 风格样本与指纹同源（都挂在作品上），这里直接从 project 取，避免每个调用点都要透传
    styleSamples: project?.styleSamples,
    ragChunks,
    prevChapterSummary: rawPrevSummary,
    prefs,
  });
  const { contextInfo, sections } = plan;
  const isInjected = (key: ContextGroupKey) =>
    plan.groups.find(g => g.key === key)?.items.some(i => i.injected) ?? false;

  const charsCtx = sections.characters || '（暂无）';
  const worldCtx = sections.world || '（暂无）';
  const outlineCtx = sections.outline || '（暂无）';
  const threadsCtx = sections.threads || '（暂无）';
  const bibleCtx = sections.bible || null;
  const factsCtx = sections.facts || null;
  const fingerprintCtx = sections.fingerprint || null;
  // sections 里存的是样本原文（逐条可开关），标题在这里补，文案与 styleSampleHint 保持一致
  const styleSamplesCtx = sections.styleSamples
    ? `【风格样本（作者原文，模仿其语感、句式与用词，不要照抄其中情节）】\n${sections.styleSamples}`
    : null;
  const ragCtx = sections.rag || null;
  // 人物语气样本：每条自带「【某某的语气…】」标题（见 shared/lib/voiceSample.ts），这里不再补组头
  const voiceCtx = sections.voiceSamples || null;
  // 被关掉的分组在模板里也要消失（模板保持原样，这里给空值）
  const prevChapterSummary = isInjected('prevSummary') ? rawPrevSummary : '';
  const recentContent = sections.recentContent ?? '';

  const prompt = `你是专业的小说写作助手，协助创作《${project.title}》（${project.genre}类）。

${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}
作品简介：${trunc(project.synopsis, 200)}
${bibleCtx ? `\n【故事圣经（最高优先级，必须严格遵守）】\n${bibleCtx}\n` : ''}${factsCtx ? `\n【事实账本（已确立事实，不得推翻）】\n${factsCtx}\n` : ''}${ragCtx ? `\n【相关历史章节（RAG检索，供参考前后文一致性）】\n${ragCtx}\n` : ''}${fingerprintCtx ? `\n${fingerprintCtx}\n` : ''}${styleSamplesCtx ? `\n${styleSamplesCtx}\n` : ''}${voiceCtx ? `\n${voiceCtx}\n` : ''}
【涉及人物】
${charsCtx}

【世界观设定】
${worldCtx}

【本章大纲】${outlineCtx}

【未回收重要伏笔】
${threadsCtx}

【上章摘要】${trunc(prevChapterSummary, 200)}

【本章已有内容（最近2000字）】
${recentContent || '（本章尚无内容）'}

要求：文风/视角/人称一致；严守人物性格；注意伏笔呼应；不要输出章节标题或"第X章"等标题行；直接输出正文内容，无任何前缀。`;

  return { prompt, contextInfo, plan };
}

// ---------- 实体字段 AI ----------

/**
 * 构建实体生成的 system prompt。
 * 限制：最多 10 个人物（只取名/角色/性格简述），最多 6 条世界观（只取标题+分类）。
 */
export function buildEntitySystem(project: Project, allChars: Character[], allWorld: WorldSetting[]): string {
  // 限制数量 + 截断内容
  const charsSummary = allChars.slice(0, 10).map(c =>
    `${c.name}（${c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : '配角'}）：${trunc(c.personality, 50)}`
  ).join('\n');

  const worldSummary = allWorld.slice(0, 6).map(s => `${s.title}（${s.category}）`).join('、');

  return `你是专业的小说策划助手，协助完善《${project.title}》（${project.genre}类）。

作品简介：${trunc(project.synopsis, 150)}
现有人物：${charsSummary || '暂无'}
世界观：${worldSummary || '暂无'}

要求：内容与已有设定一致；符合${project.genre}风格；直接输出内容，无前缀。`;
}

export interface LongFormContext {
  platformGuide: string;
  outlineSummary: string;
  keyEvents: string[];
  charsCtx: string;
  worldCtx: string;
  bibleCtx: string;
  factsCtx: string;
  ragHint: string;
  /** 语感约束：风格指纹 + 作者风格样本 + 本章上场人物的语气样本（三段拼在一起进 prompt） */
  fingerprintHint: string;
  instructionBlock: string;
  prevSummary: string;
  targetWordCount: number;
}

export function buildLongFormContext(p: {
  project: Project;
  throughOrder?: number;
  chapter?: Chapter;
  outlineSummary: string;
  keyEvents: string[];
  characters: Character[];
  worldSettings: WorldSetting[];
  prevSummary: string;
  targetWordCount: number;
  instruction: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  /** 写作台选定的平台（覆盖作品的 targetPlatform；为空则用作品自己的） */
  platform?: string;
}): LongFormContext {
  const source = [p.outlineSummary, ...p.keyEvents, p.prevSummary, p.instruction].join('\n');
  const chapter: Chapter = { id: p.chapter?.id || 'planning', projectId: p.project.id, title: p.chapter?.title || '本章',
    order: (p.throughOrder ?? -1) + 1, content: source, wordCount: source.length, status: 'draft', summary: p.outlineSummary,
    createdAt: new Date(), updatedAt: new Date() };
  const { sections } = buildContextPlan({ project: p.project, chapter, characters: p.characters,
    worldSettings: p.worldSettings, outlines: [], threads: [], storyBible: p.storyBible, factLedger: p.factLedger,
    styleFingerprint: p.styleFingerprint, styleSamples: p.project.styleSamples, ragChunks: p.ragChunks,
    prevChapterSummary: p.prevSummary, prefs: loadContextPrefs(p.project.id) });
  return {
    platformGuide: longNovelPlatformGuide(p.platform || p.project.targetPlatform), outlineSummary: p.outlineSummary,
    keyEvents: p.keyEvents, charsCtx: sections.characters || '', worldCtx: sections.world || '',
    bibleCtx: sections.bible ? `\n【故事圣经】\n${sections.bible}` : '',
    factsCtx: sections.facts ? `\n【已确认事实】\n${sections.facts}` : '',
    fingerprintHint: [sections.fingerprint, sections.styleSamples ? `【作者语感样本，勿抄情节】\n${sections.styleSamples}` : '', sections.voiceSamples].filter(Boolean).join('\n'),
    ragHint: sections.rag ? `\n【相关历史原文】\n${sections.rag}` : '',
    instructionBlock: p.instruction ? '\n' + p.instruction : '', prevSummary: sections.prevSummary || '', targetWordCount: p.targetWordCount,
  };
}

/** 节拍卡 → 蓝图文本（整章生成与单场重写共用） */
export function buildBeatBlueprint(beat: ChapterBeatCard | null | undefined): string {
  if (!beat) return '';
  return `
【本章蓝图（来自节拍卡，必须落实）】
目标：${beat.goal || ''}　冲突：${beat.conflict || ''}　情绪转折：${beat.emotionPoint || ''}
转折点：${beat.reversal || ''}　人物变化：${beat.characterChange || ''}（用行为体现，不靠旁白宣布）
要回收的伏笔：${(beat.payoff || []).join('；') || '无'}　要埋设的伏笔：${(beat.foreshadowing || []).join('；') || '无'}
节奏曲线（按此推进，注意快慢起伏）：${(beat.beats || []).map((b: SceneBeat) => `[${b.tension || '中'}/${b.pace || '中'}] ${b.scene || ''}`).join(' → ') || '自行规划，须有张力起伏'}
章末钩子：${beat.hookEnding || '按章节意图收束或留余韵'}
必须包含：${(beat.mustInclude || []).join('；') || '无'}　必须避免：${(beat.mustAvoid || []).join('；') || '无'}`;
}

/** 生成单章完整正文 */
const LONG_NOVEL_PLATFORM_GUIDE: Record<string, string> = {
  '番茄': '重视早期阅读动力、人物目标和回报；可使用高光与悬念，允许喘息和完整收束，按作者目标调节节奏。',
  '起点': '爽文向可关注人物目标、回报与阅读动力，按章意图安排悬念或收束；言情向：情绪线与关系张力优先，对白潜台词重，细腻不滥情。',
  '晋江': '情绪线与关系张力优先；对白潜台词重；细腻感受但不滥情；误会与拉扯节制使用。',
  '知乎': '可关注开篇吸引力、代入感和信息推进；反转、第一人称与快节奏按故事需要选用。',
  '公众号': '第一人称、口语化、生活质感；结尾留余味，不强行反转。',
  '纯文学': '留白、意象、克制；不追爽点；信任读者、少解释；允许开放结尾。',
};
export function longNovelPlatformGuide(platform?: string | null): string {
  if (!platform) return '';
  const key = Object.keys(LONG_NOVEL_PLATFORM_GUIDE).find(k => platform.includes(k));
  const novel = key ? `\n【目标平台「${platform}」编辑建议（作者目标优先）】${LONG_NOVEL_PLATFORM_GUIDE[key]}\n` : '';
  // 写作台格式体检条里选的是短篇平台配置（小红书/知乎盐选/公众号…）时，
  // 把该平台的口味、字数区间、硬规则、禁忌一并压进提示词——
  // 选平台不只是给提示条上色，模型收到的约束随之一致。
  const cfg = (PLATFORM_CONFIGS as Record<string, PlatformConfig>)[platform];
  if (!cfg) return novel;
  const rules = cfg.rules.length ? cfg.rules.map(r => `- ${r}`).join('\n') : '';
  const forbidden = cfg.forbidden.length ? `避免：${cfg.forbidden.join('、')}` : '';
  return `${novel}
【平台「${platform}」编辑建议（作者目标优先）】${cfg.tone}
平台常见字数区间：${cfg.wordRange[0]}-${cfg.wordRange[1]} 字，长篇章节以作者本次目标为准
${rules}${rules ? '\n' : ''}${forbidden}
`;
}

// 长篇章节正文 system 提示词（迁移短篇强约束 + 长篇承上启下/反 AI 腔）
export function buildChapterProseSystem(project: Project, chapter: Chapter): string {
  return `你是中文连载小说的资深执笔，同时是挑剔的责编。你为《${project.title}》（${project.genre}）写《${chapter.title}》正文。
${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}
目标：保持人物、设定和作者文风一致，让本章实现自己的叙事意图。

【写作建议，按叙事意图选择使用】
① 展示与叙述配合：关键行动宜具体，允许有意的心理描写与叙述。
   ✗ 他很愤怒。  ✓ 他把茶杯按在桌上，瓷底磨出一声短响，手没松。
② 具身细节：关键场景可加入适量具体感官（声音/气味/触感/温度/光线/物件），细节须专属此场景，不是通用空镜。
③ 对话有潜台词：人物说出口的，和真正想要的，不能完全重合；允许答非所问、转移话题、沉默。
④ 动词推进：靠精准动作和具体名词带情绪，不靠形容词副词堆砌。
⑤ 节奏起伏：不要每段一样长一样密；冲突处短句快切，喘息处可舒展。
⑥ 人物有声口：主要人物说话方式可区分——句长、用词、口头禅、回避什么、强调什么各不相同。

【避免无意义的重复与套话，保留作者有意的修辞】
- 避免泛泛的格言/金句总结；人物有依据的感悟可以保留。
- 避免重复解释已经写清的情绪；有独立信息或文风价值的心理描写保留。
- 禁止悬浮空镜当过渡："阳光正好""微风拂过""不知过了多久"——除非与人物当下处境直接相关。
- 禁止机械过渡词扎堆：然而、与此同时、就这样、渐渐地，能不用就不用。
- 避免机械重复的排比对仗；有意的节奏修辞可以保留。

【收尾】按章节意图选择悬念、余韵、开放结尾或完整收束，不强制掐断。
直接从正文第一个字开始，不要输出"第X章"、任何标题、前缀或解说。`;
}

// 第1步：生成章节节拍卡（含节奏曲线 beats）
