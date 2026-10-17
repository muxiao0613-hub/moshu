import { v4 as uuidv4 } from 'uuid';
import { estimateTokens } from '@/api/tokenTracker';
import { stripHtml, streamChat } from '@/features/ai/aiService';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { characterProfile } from '@/shared/lib/characterProfile';
import { usableFacts, currentReport } from '@/shared/lib/chapterSources';
import { extractChapterSources } from '@/features/ai/aiService';
import { qualityPolicy } from '@/shared/lib/qualityPolicy';
import { revisionBasis } from '@/shared/lib/revisionBasis';
import type {
  Project, Chapter, Character, WorldSetting, PlotThread,
  TopicCandidate, StoryBible, ChapterBeatCard, FactLedger, QualityReport,
} from '@/shared/types';

function trunc(s: string, max = 180) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[\n；;、,，]/).map(v => v.trim()).filter(Boolean);
  return [];
}

function clampScore(value: unknown, fallback = 70): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function findJsonEnd(s: string, start: number): number {
  const openChar = s[start];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function extractCompleteArrayItems(s: string): string {
  let depth = 0, inString = false, escaped = false, lastCompleteEnd = -1;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 1) lastCompleteEnd = i;
      else if (depth === 0) return s.slice(0, i + 1);
    }
  }
  if (lastCompleteEnd > 0) return s.slice(0, lastCompleteEnd + 1).trimEnd().replace(/,\s*$/, '') + ']';
  return '[]';
}

function parseJsonFromAI<T>(text: string): T {
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = s.search(/[\[{]/);
  if (start === -1) throw new Error('AI 响应中没有找到 JSON，请重试');
  const isArray = s[start] === '[';
  const end = findJsonEnd(s, start);
  let raw: string;
  if (end !== -1) {
    raw = s.slice(start, end + 1);
  } else if (isArray) {
    raw = extractCompleteArrayItems(s.slice(start));
    if (raw === '[]') throw new Error('JSON 格式不完整，请重试');
  } else {
    throw new Error('JSON 格式不完整，请重试');
  }
  const repair = (input: string) => input.replace(/,\s*([}\]])/g, '$1').replace(/}\s*{/g, '},{');
  try { return JSON.parse(raw) as T; } catch { /* fall through */ }
  try { return JSON.parse(repair(raw)) as T; } catch { /* fall through */ }
  throw new Error('JSON 格式不完整，请重试');
}

function buildQualityContext(params: {
  project: Project;
  throughOrder?: number;
  storyBible?: StoryBible | null;
  beatCard?: ChapterBeatCard | null;
  factLedger?: FactLedger[];
  characters?: Character[];
  worldSettings?: WorldSetting[];
  threads?: PlotThread[];
}) {
  const { project, storyBible, beatCard, factLedger = [], characters = [], worldSettings = [], threads = [] } = params;
  return `${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}\n\n作品：《${project.title}》\n类型：${project.genre}\n简介：${trunc(project.synopsis, 300)}\n\n【故事圣经】\n${storyBible ? `核心卖点：${storyBible.coreHook}\n目标读者：${storyBible.targetReader}\n主角欲望：${storyBible.protagonistDesire}\n主线矛盾：${storyBible.mainConflict}\n能力规则：${(storyBible.powerRules ?? []).join('；')}\n硬性设定：${(storyBible.hardRules ?? []).join('；')}\n文风：${storyBible.tone}\n禁忌：${(storyBible.taboo ?? []).join('；')}` : '（暂无）'}\n\n【本章剧情卡】\n${beatCard ? `目标：${beatCard.goal}\n冲突：${beatCard.conflict}\n爽点：${beatCard.coolPoint}\n情绪点：${beatCard.emotionPoint}\n反转：${beatCard.reversal}\n章末钩子：${beatCard.hookEnding}\n必须包含：${(beatCard.mustInclude ?? []).join('；')}\n必须避免：${(beatCard.mustAvoid ?? []).join('；')}` : '（暂无）'}\n\n【事实账本】\n${usableFacts(factLedger, params.throughOrder).slice(0, 30).map(f => `- ${f.subject}：${f.fact}${f.locked ? '（锁定）' : ''}`).join('\n') || '（暂无）'}\n\n【人物】\n${characters.slice(0, 18).map(c => characterProfile(c, characters, 100, { throughOrder: params.throughOrder })).join('\n') || '（暂无）'}\n\n【世界观】\n${worldSettings.slice(0, 12).map(w => `- ${w.title}：${trunc(w.content, 100)}`).join('\n') || '（暂无）'}\n\n【未回收伏笔】\n${threads.filter(t => t.status !== 'resolved' && t.status !== 'abandoned').slice(0, 12).map(t => `- ${t.title}：${trunc(t.description, 80)}`).join('\n') || '（暂无）'}`;
}

export async function generateTopicCandidates(params: {
  project: Project;
  brief: string;
  researchNotes?: string;
  platform?: string;
  count?: number;
  onChunk?: (c: string) => void;
}): Promise<TopicCandidate[]> {
  const { project, brief, researchNotes = '', platform = '番茄/七猫/起点综合', count = 12, onChunk } = params;
  const text = await streamChat(
    `你是小说题材策划编辑。只输出纯 JSON 数组。${qualityPolicy({ platform: project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal })}`,
    `基于作者兴趣和项目方向，生成 ${count} 个可长期连载的高质量小说题材候选。\n\n项目名称：${project.title}\n原始类型：${project.genre}\n项目简介：${project.synopsis || '暂无'}\n作者兴趣/想法：${brief || '希望获得可选择的题材方向'}\n目标平台：${platform}\n全网检索/榜单/热点信息（作者可粘贴，可为空）：\n${researchNotes || '（未提供，请结合通用网文经验，但不要编造具体榜单名次）'}\n\n要求：根据作者目标考虑故事主线、原创度与持续展开的潜力；钩子、爽点与篇幅目标依创作方向选择；不要低质拼凑、无主线、只有噱头不能展开的题材；每个题材都要写明风险。\n\n只输出JSON数组，每项格式：\n[{"title":"题材名","oneLineHook":"一句话卖点","platformFit":["番茄","七猫"],"protagonist":"主角身份","goldenFinger":"金手指/核心能力","mainConflict":"主线矛盾","coolPoints":["爽点1","爽点2"],"firstThreeChapters":["第1章爆点","第2章爆点","第3章爆点"],"longTermArc":"长线主线","innovation":"创新点","risk":"风险","score":85}]`,
    onChunk,
    6000
  );
  const raw = parseJsonFromAI<Array<Partial<TopicCandidate>>>(text);
  return raw.map(item => ({
    id: uuidv4(), projectId: project.id,
    title: String(item.title || '未命名题材').trim(),
    oneLineHook: String(item.oneLineHook || '').trim(),
    platformFit: toStringArray(item.platformFit),
    protagonist: String(item.protagonist || '').trim(),
    goldenFinger: String(item.goldenFinger || '').trim(),
    mainConflict: String(item.mainConflict || '').trim(),
    coolPoints: toStringArray(item.coolPoints),
    firstThreeChapters: toStringArray(item.firstThreeChapters),
    longTermArc: String(item.longTermArc || '').trim(),
    innovation: String(item.innovation || '').trim(),
    risk: String(item.risk || '').trim(),
    score: clampScore(item.score, 75),
    createdAt: new Date(),
  }));
}

export async function generateStoryBible(params: {
  project: Project;
  chosenTopic?: TopicCandidate | null;
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<StoryBible> {
  const { project, chosenTopic, instruction = '', onChunk } = params;
  const text = await streamChat(
    '你是长篇小说总策划，负责建立故事圣经和设定锁。只输出纯 JSON 对象，不要 markdown。',
    `为《${project.title}》（${project.genre}）生成可长期连载使用的故事圣经。\n\n项目简介：${project.synopsis || '暂无'}\n${chosenTopic ? `\n已选题材：${chosenTopic.title}\n一句话卖点：${chosenTopic.oneLineHook}\n主角：${chosenTopic.protagonist}\n金手指：${chosenTopic.goldenFinger}\n主线矛盾：${chosenTopic.mainConflict}\n爽点：${chosenTopic.coolPoints.join('；')}\n长线主线：${chosenTopic.longTermArc}\n风险：${chosenTopic.risk}\n` : ''}\n作者补充要求：${instruction || '希望减少AI幻觉，保证人物、能力、伏笔和世界观稳定'}\n\n输出JSON：{"coreHook":"","targetReader":"","protagonistDesire":"","mainConflict":"","powerRules":[""],"hardRules":[""],"tone":"","taboo":[""]}`,
    onChunk,
    4000
  );
  const raw = parseJsonFromAI<Partial<StoryBible>>(text);
  return {
    id: uuidv4(), projectId: project.id,
    coreHook: String(raw.coreHook || '').trim(),
    targetReader: String(raw.targetReader || '').trim(),
    protagonistDesire: String(raw.protagonistDesire || '').trim(),
    mainConflict: String(raw.mainConflict || '').trim(),
    powerRules: toStringArray(raw.powerRules),
    hardRules: toStringArray(raw.hardRules),
    tone: String(raw.tone || '').trim(),
    taboo: toStringArray(raw.taboo),
    updatedAt: new Date(),
  };
}

export async function generateChapterBeatCard(params: {
  project: Project;
  chapter: Chapter;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  characters?: Character[];
  worldSettings?: WorldSetting[];
  threads?: PlotThread[];
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<ChapterBeatCard> {
  const { project, chapter, storyBible, factLedger = [], characters = [], worldSettings = [], threads = [], instruction = '', onChunk } = params;
  const text = await streamChat(
    '你是尊重作者创作方向的章节策划编辑。只输出纯 JSON 对象，不要 markdown。',
    `${buildQualityContext({ project, throughOrder: chapter.order, storyBible, factLedger, characters, worldSettings, threads })}\n\n当前章节：${chapter.title}\n章节摘要/大纲：${chapter.summary || '暂无'}\n已有正文节选：${trunc(stripHtml(chapter.content), 1800) || '暂无正文'}\n额外要求：${instruction || '生成适合本章叙事意图的剧情卡，结尾形式由创作方向决定'}\n\n输出JSON：{"goal":"本章目标","conflict":"本章冲突","coolPoint":"爽点/爆点","emotionPoint":"情绪点","reversal":"反转","hookEnding":"章末钩子","characterChange":"人物变化","foreshadowing":["本章埋伏笔"],"payoff":["本章回收伏笔"],"mustInclude":["必须包含"],"mustAvoid":["必须避免"]}`,
    onChunk,
    4000
  );
  const raw = parseJsonFromAI<Partial<ChapterBeatCard>>(text);
  return {
    id: uuidv4(), projectId: project.id, chapterId: chapter.id,
    sourceHash: await chapterMemoryHash(chapter.content), status: 'current',
    goal: String(raw.goal || '').trim(),
    conflict: String(raw.conflict || '').trim(),
    coolPoint: String(raw.coolPoint || '').trim(),
    emotionPoint: String(raw.emotionPoint || '').trim(),
    reversal: String(raw.reversal || '').trim(),
    hookEnding: String(raw.hookEnding || '').trim(),
    characterChange: String(raw.characterChange || '').trim(),
    foreshadowing: toStringArray(raw.foreshadowing),
    payoff: toStringArray(raw.payoff),
    mustInclude: toStringArray(raw.mustInclude),
    mustAvoid: toStringArray(raw.mustAvoid),
    updatedAt: new Date(),
  };
}

async function reviewQualitySegment(params: {
  project: Project;
  chapter: Chapter;
  storyBible?: StoryBible | null;
  beatCard?: ChapterBeatCard | null;
  factLedger?: FactLedger[];
  characters?: Character[];
  worldSettings?: WorldSetting[];
  threads?: PlotThread[];
  onChunk?: (c: string) => void;
  signal?: AbortSignal;
}): Promise<QualityReport> {
  const { project, chapter, storyBible, beatCard, factLedger = [], characters = [], worldSettings = [], threads = [], onChunk } = params;
  const text = await streamChat(
    '你是尊重创作方向的小说编辑。只输出纯 JSON 对象，不要 markdown。评分是编辑意见；问题必须落到原文位置或片段，type 标为「事实/交付问题」或「审美建议」。',
    `${buildQualityContext({ project, throughOrder: chapter.order, storyBible, beatCard, factLedger, characters, worldSettings, threads })}\n\n【待评审章节】\n标题：${chapter.title}\n字数：${stripHtml(chapter.content).length}\n正文：\n${stripHtml(chapter.content).slice(0, 9000)}\n\n评审维度：开篇/本章钩子、冲突强度、节奏、爽点密度、人物主动性和对话、原创度、AI味风险、设定一致性。重点识别AI味：大段解释、空泛形容、人物像说明书、心理重复、冲突解决太顺、套话、段落过度工整。\n\n输出JSON的评分口径：所有分数一律使用 0-100 的整数，禁止使用 10 分制。分档参考：90-100 优秀；75-89 良好；60-74 及格；40-59 偏弱；0-39 严重不足。aiFlavorRisk 与 consistencyRisk 是风险分，越低越好，同样为 0-100。\n\n输出JSON：{"totalScore":76,"hookScore":72,"conflictScore":78,"pacingScore":74,"coolPointScore":70,"characterScore":76,"originalityScore":75,"aiFlavorRisk":30,"consistencyRisk":20,"shortVerdict":"一句话总评","strengths":["优点"],"issues":[{"type":"问题类型","location":"大致位置/原文片段","problem":"具体问题","suggestion":"具体修改建议"}]}`,
    onChunk,
    5000, { signal: params.signal }
  );
  const raw = parseJsonFromAI<Partial<QualityReport>>(text);
  const rawIssues = Array.isArray(raw.issues) ? raw.issues : [];

  // 量表归一到 0-100。提示词已明确要求 0-100，但模型偶尔仍按 1-10 输出；
  // 若「总评 + 六个维度分」全部 ≤10，判定为 10 分制并整体 ×10，
  // 避免维度分在界面上恒定显示为「偏弱」（风险分本就是 0-100，不参与归一）。
  const dims = {
    totalScore: clampScore(raw.totalScore, 70),
    hookScore: clampScore(raw.hookScore, 70),
    conflictScore: clampScore(raw.conflictScore, 70),
    pacingScore: clampScore(raw.pacingScore, 70),
    coolPointScore: clampScore(raw.coolPointScore, 70),
    characterScore: clampScore(raw.characterScore, 70),
    originalityScore: clampScore(raw.originalityScore, 70),
  };
  const tenPointScale = Object.values(dims).every(v => v <= 10);
  const norm = (v: number) => (tenPointScale ? Math.max(0, Math.min(100, Math.round(v * 10))) : v);

  return {
    id: uuidv4(), projectId: project.id, chapterId: chapter.id,
    sourceHash: await chapterMemoryHash(chapter.content), status: 'current',
    coverage: '当前分段',
    totalScore: norm(dims.totalScore),
    hookScore: norm(dims.hookScore),
    conflictScore: norm(dims.conflictScore),
    pacingScore: norm(dims.pacingScore),
    coolPointScore: norm(dims.coolPointScore),
    characterScore: norm(dims.characterScore),
    originalityScore: norm(dims.originalityScore),
    aiFlavorRisk: clampScore(raw.aiFlavorRisk, 35),
    consistencyRisk: clampScore(raw.consistencyRisk, 25),
    shortVerdict: String(raw.shortVerdict || '').trim(),
    strengths: toStringArray(raw.strengths),
    issues: rawIssues.map(i => ({
      type: String((i as { type?: unknown }).type || '问题').trim(),
      location: String((i as { location?: unknown }).location || '').trim(),
      problem: String((i as { problem?: unknown }).problem || '').trim(),
      suggestion: String((i as { suggestion?: unknown }).suggestion || '').trim(),
    })),
    createdAt: new Date(),
  };
}

/** 每个分段均实际评审，失败不返回完整报告；分数按正文长度加权，问题保留分段位置。 */
export async function reviewChapterQuality(params: Parameters<typeof reviewQualitySegment>[0]): Promise<QualityReport> {
  const body = stripHtml(params.chapter.content);
  if (!body.trim()) throw new Error('当前章节没有正文');
  const results: Array<{ report: QualityReport; length: number }> = [];
  for (let offset = 0; offset < body.length; offset += 8000) {
    params.signal?.throwIfAborted();
    const part = body.slice(offset, offset + 8000);
    const report = await reviewQualitySegment({ ...params, chapter: { ...params.chapter,
      title: `${params.chapter.title}（第${results.length + 1}段，共${Math.ceil(body.length / 8000)}段）`, content: part } });
    report.issues = report.issues.map(i => ({ ...i, location: `正文第${offset + 1}—${offset + part.length}字：${i.location}` }));
    results.push({ report, length: part.length });
  }
  const keys = ['totalScore', 'hookScore', 'conflictScore', 'pacingScore', 'coolPointScore', 'characterScore', 'originalityScore', 'aiFlavorRisk', 'consistencyRisk'] as const;
  const merged = { ...results[0].report, basisHash: await chapterMemoryHash(revisionBasis(params)), sourceHash: await chapterMemoryHash(params.chapter.content),
    coverage: `已读取全部 ${body.length} 字，${results.length} 个分段；分段评分加权，整章结构仍由作者复核`,
    shortVerdict: results.map((r, i) => `${i + 1}. ${r.report.shortVerdict}`).join('；'),
    strengths: [...new Set(results.flatMap(r => r.report.strengths))], issues: results.flatMap(r => r.report.issues) };
  for (const key of keys) merged[key] = Math.round(results.reduce((n, r) => n + r.report[key] * r.length, 0) / body.length);
  return merged;
}

export async function rewriteChapterByQualityReport(params: {
  project: Project;
  chapter: Chapter;
  report: QualityReport;
  storyBible?: StoryBible | null;
  beatCard?: ChapterBeatCard | null;
  factLedger?: FactLedger[];
  characters?: Character[];
  worldSettings?: WorldSetting[];
  threads?: PlotThread[];
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { project, chapter, report, storyBible, beatCard, factLedger = [], instruction = '', onChunk } = params;
  if (!currentReport(report) || report.sourceHash !== await chapterMemoryHash(chapter.content)) throw new Error('评审依据已过时，请重新评审当前正文');

  const issues = report.issues.map((i, idx) => `${idx + 1}. 【${i.type}】${i.location}\n问题：${i.problem}\n建议：${i.suggestion}`).join('\n');
  const body = stripHtml(chapter.content);
  const parts: string[] = [];
  for (let offset = 0; offset < body.length; offset += 8000) {
    const part = body.slice(offset, offset + 8000);
    const rewritten = await streamChat(
    '你是尊重作者目标的改稿编辑。根据质量报告做局部强化，不改变核心剧情，不整章乱改。直接输出修改后的正文，不要标题，不要解释。',
    `${buildQualityContext({ project, throughOrder: chapter.order, storyBible, beatCard, factLedger, characters: params.characters, worldSettings: params.worldSettings, threads: params.threads })}\n\n原章节：${chapter.title}\n【原文】\n${part}\n本次只修改第${offset + 1}—${offset + part.length}字这一段。前后接续参考（不要输出）：${body.slice(Math.max(0, offset - 250), offset)} / ${body.slice(offset + part.length, offset + part.length + 250)}\n\n【质量报告】\n总评：${report.shortVerdict}\n主要问题：\n${issues || '暂无具体问题，保留作者原有表达'}\n\n改稿要求：保留原有核心事件和人物关系；优先修复有依据的事实和交付问题；审美建议结合作者目标选择采纳；不新增重大未铺垫设定，不推翻故事圣经和事实账本；保留符合创作意图的慢节奏、心理描写、抒情与结尾形式；输出可直接粘贴进编辑器的正文。\n${instruction ? `额外要求：${instruction}` : ''}`,
    onChunk,
    Math.max(estimateTokens(part) * 2 + 1200, 3000)
    );
    if (rewritten.trim().length < part.trim().length * 0.6) throw new Error('改稿疑似截断，原稿仍保留，请重试');
    parts.push(rewritten);
  }
  return parts.join('\n\n');
}

export async function extractFactsFromChapter(params: {
  project: Project;
  chapter: Chapter;
  existingFacts?: FactLedger[];
  onChunk?: (c: string) => void;
}): Promise<FactLedger[]> {
  return (await extractChapterSources(params.project, params.chapter)).facts;
}
