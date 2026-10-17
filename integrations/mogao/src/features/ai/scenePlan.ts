import type { ChapterBeatCard, Character, SceneBeat, SceneCard } from '@/shared/types';

/**
 * 场景层（第 2 批）：把「整章一次写完」拆成「先排场景 → 逐场景写 → 场景间滚动状态」
 *
 * 背景：节拍卡里早就有 `beats: [{ scene, tension, pace, purpose }]`，
 * 但正文生成是**一次 streamChat 写完整章**——蓝图里的场景划分被丢掉了，
 * 结果就是 REWRITE_PLAN 里 R2/R3：粒度太粗、没有场景级记忆。
 *
 * 本模块只放**纯函数**（无网络、无 UI），因此可以脱离浏览器直接跑测试：
 *   planScenes            节拍卡 → 每场的目标字数（按 pace/tension 加权）
 *   extractSceneState     写完一场后本地提取状态（出场人物/末句/未落实项，零额外 token）
 *   buildSceneContinuity  把「已写场景 + 上一场原文尾巴 + 状态」拼成下一场的衔接块
 *   buildSceneUserPrompt  单场请求的 user 提示词（与整章共用 system 提示词）
 */

/**
 * 场景卡（持久化结构见 shared/types 的 SceneCard，此处只是别名，
 * 保证「内存里的规划」与「存进节拍卡的场景卡」是同一个形状）。
 */
export type ScenePlan = SceneCard;

export interface SceneState {
  /** 上一场最后一句（用于衔接语气） */
  lastLine: string;
  /** 本场出现过的人物名 */
  appeared: string[];
  /** 本章必须包含、但至今**尚未**明显出现的项（按前 8 字宽松匹配） */
  missingMustInclude: string[];
}

export const PACE_WEIGHT: Record<string, number> = { '快': 0.8, '中': 1, '慢': 1.3 };
export const TENSION_WEIGHT: Record<string, number> = { '高': 1.15, '中': 1, '低': 0.9 };

const MAX_SCENES = 6;
const MIN_SCENES = 2;
const MIN_SCENE_WORDS = 180;

const stripTags = (s: string) => (s || '').replace(/<[^>]*>/g, '');
const squash = (s: string) => stripTags(s).replace(/\s+/g, ' ').trim();

/** 取文本最后一句（按中英文句读切分），用于「上一场停在哪里」 */
export function lastSentence(text: string, max = 120): string {
  const clean = squash(text);
  if (!clean) return '';
  const parts = clean.split(/(?<=[。！？!?…；;"'」』）)])/).filter(Boolean);
  const tail = (parts.length > 0 ? parts[parts.length - 1] : clean).trim();
  return tail.length > max ? '…' + tail.slice(-max) : tail;
}

interface SceneSeed { scene: string; tension: string; pace: string; purpose: string }

/** 节拍卡不给 beats（或只有 1 条）时，用章级字段兜一个最小可用的四段结构 */
function synthesizeSeeds(beat: ChapterBeatCard | null): SceneSeed[] {
  const goal = String(beat?.goal || '').trim();
  const conflict = String(beat?.conflict || '').trim();
  const reversal = String(beat?.reversal || '').trim();
  const hook = String(beat?.hookEnding || '').trim();
  const emotion = String(beat?.emotionPoint || '').trim();
  return [
    { scene: '起：承接上文情境，进入本章目标', tension: '低', pace: '中', purpose: goal || '交代处境与目标' },
    { scene: '承：冲突展开与升级', tension: '中', pace: '中', purpose: conflict || '推进主要冲突' },
    { scene: '转：转折点', tension: '高', pace: '快', purpose: reversal || '制造转折' },
    { scene: '合：收束并留钩子', tension: '中', pace: '快', purpose: emotion || hook || '收束并掐断' },
  ];
}

/**
 * 节拍卡 → 场景计划。
 * 用了 beats 就按 beats；不足 2 场时用章级字段兜底（而不是退回一次写完）。
 * 字数按 pace/tension 加权分配，并保证每场不低于 MIN_SCENE_WORDS，总数贴近 targetWordCount。
 */
export function planScenes(beat: ChapterBeatCard | null, targetWordCount: number): ScenePlan[] {
  const target = Math.max(600, Math.round(targetWordCount || 0));
  const rawBeats = Array.isArray(beat?.beats)
    ? beat.beats.filter((b: SceneBeat) => b && typeof b.scene === 'string' && b.scene.trim())
    : [];

  const seeds: SceneSeed[] = rawBeats.length >= MIN_SCENES
    ? rawBeats.slice(0, MAX_SCENES).map((b: SceneBeat) => ({
      scene: String(b.scene).trim(),
      tension: String(b.tension || '中').trim(),
      pace: String(b.pace || '中').trim(),
      purpose: String(b.purpose || '').trim(),
    }))
    : synthesizeSeeds(beat);

  const weights = seeds.map(s => (PACE_WEIGHT[s.pace] ?? 1) * (TENSION_WEIGHT[s.tension] ?? 1));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;

  const floor = Math.min(MIN_SCENE_WORDS, Math.floor(target / seeds.length));
  let budgets = weights.map(w => Math.max(floor, Math.round((target * w) / sum)));

  // 校正：多退少补，全部记到最长的那一场上，避免出现 50 字的小场
  const over = budgets.reduce((a, b) => a + b, 0) - target;
  if (over !== 0) {
    let idx = 0;
    budgets.forEach((b, i) => { if (b > budgets[idx]) idx = i; });
    budgets[idx] = Math.max(floor, budgets[idx] - over);
  }

  return seeds.map((s, i) => ({ index: i + 1, ...s, wordBudget: budgets[i] }));
}

/** 本地提取场景状态：零额外 AI 调用，因此不会为「记忆」多花 token */
export function extractSceneState(p: {
  text: string;
  characters: Character[];
  mustInclude?: string[];
  /** 到此为止的全部正文（用于判断「必须包含项」是否已出现） */
  accumulated?: string;
}): SceneState {
  const clean = squash(p.text);
  const hay = squash(p.accumulated ?? p.text);
  const appeared = p.characters
    .filter(c => clean.includes(c.name) || (c.aliases ?? []).some(a => a && clean.includes(a)))
    .map(c => c.name);
  const missingMustInclude = (p.mustInclude ?? [])
    .map(m => squash(m))
    .filter(m => m && !hay.includes(m.slice(0, 8)));
  return { lastLine: lastSentence(clean), appeared, missingMustInclude };
}

/** 「已写场景 + 上一场尾巴 + 滚动状态」——下一场必须与这些衔接 */
export function buildSceneContinuity(p: {
  plans: ScenePlan[];
  /** 已经写完的场数 */
  writtenCount: number;
  /** 上一场结尾的原文（建议 500-800 字） */
  prevTail: string;
  state?: SceneState | null;
}): string {
  const { plans, writtenCount, prevTail, state } = p;
  if (writtenCount <= 0) return '';
  const done = plans.slice(0, writtenCount)
    .map(s => `· 第${s.index}场（${s.tension}/${s.pace}）${s.purpose || s.scene}`)
    .join('\n');
  const lines = [`【已写场景（本场是第 ${writtenCount + 1} 场）】`, done];
  if (prevTail) lines.push('', '【上一场结尾原文（从这里往下接，不要重述它）】', prevTail);
  if (state) {
    if (state.appeared.length) lines.push('', `【已经出场的人物】${state.appeared.join('、')}`);
    if (state.missingMustInclude.length) {
      lines.push(`【本章要求必须出现、但至今尚未明显写到的内容】${state.missingMustInclude.join('；')}`);
    }
  }
  return '\n' + lines.join('\n') + '\n';
}

/** 单场请求的 user 提示词（system 提示词与整章生成共用 buildChapterProseSystem） */
export function buildSceneUserPrompt(p: {
  chapterTitle: string;
  scene: ScenePlan;
  sceneTotal: number;
  targetWordCount: number;
  platformGuide: string;
  prevSummary: string;
  outlineSummary: string;
  keyEvents: string[];
  charsCtx: string;
  worldCtx: string;
  bibleCtx: string;
  factsCtx: string;
  ragHint: string;
  fingerprintHint: string;
  beatBlueprint: string;
  instructionBlock: string;
  continuity: string;
}): string {
  const {
    chapterTitle, scene, sceneTotal, targetWordCount, platformGuide, prevSummary,
    outlineSummary, keyEvents, charsCtx, worldCtx, bibleCtx, factsCtx, ragHint,
    fingerprintHint, beatBlueprint, instructionBlock, continuity,
  } = p;

  const isFirst = scene.index === 1;
  const isLast = scene.index === sceneTotal;

  return `你正在写《${chapterTitle}》的第 ${scene.index}/${sceneTotal} 场，**只写这一场**（目标约 ${scene.wordBudget} 字，全章目标 ${targetWordCount} 字）。

【本场任务】${scene.scene}
${scene.purpose ? `本场目的：${scene.purpose}` : ''}
本场张力：${scene.tension}　本场节奏：${scene.pace}
${isFirst
    ? `【开场要求】从本章正文的第一个字开始，不要标题、不要前缀，先自然承住上一章的结尾：\n${prevSummary || '（本章为开篇，需要在此建立处境）'}`
    : '【接续要求】直接接住"上一场结尾原文"的最后一句话往下写，不要重述已写内容，不要重起炉灶。'}
${isLast
    ? '【收尾要求】本场是本章最后一场：章末必须在关键处掐断（一个动作没完成／一句话没说完／一个东西刚出现），不要把悬念点破。'
    : '【收尾要求】本场不结章，结尾停在推动下一场的具体动作或对话上，不要收束全章。'}
${continuity}
${platformGuide}
【本章整体结构（供你确认本场在全局的位置）】
大纲：${outlineSummary || '（无）'}
关键事件：${keyEvents.slice(0, 6).join('；') || '（无）'}
涉及人物（保持声口一致）：\n${charsCtx || '暂无'}
世界观：\n${worldCtx || '暂无'}${bibleCtx}${factsCtx}${ragHint}${fingerprintHint}${beatBlueprint}${instructionBlock}

只输出本场正文，不要小节标题、不要解释、不要总结本场写了什么。`;
}

/** 进度文案（直接展示给用户，因此写清场次与张力） */
export function sceneProgressLabel(scene: ScenePlan, total: number): string {
  return `② 第 ${scene.index}/${total} 场：${squash(scene.scene).slice(0, 18)}（${scene.tension}/${scene.pace}）`;
}

/**
 * 把场景卡按顺序拼回本章正文（每场一个段落，段间空行）。
 * 只有全部场景都有正文时才返回非空——否则说明还有场次没生成，
 * 拼接出来会缺内容，宁可不拼。
 */
export function assembleSceneContent(scenes: SceneCard[]): string {
  if (!scenes || scenes.length === 0) return '';
  if (scenes.some(s => !s.text || !s.text.trim())) return '';
  return scenes
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(s => {
      const body = (s.text || '').trim();
      if (!body) return '';
      // 逐场生成的是纯文本，存进 content 时补成段落，编辑器才能正常分段
      return body.startsWith('<') ? body : `<p>${body.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

/** 已完成正文的场数 / 总场数 */
export function sceneWrittenCount(scenes: SceneCard[]): { written: number; total: number } {
  const list = scenes || [];
  return { written: list.filter(s => !!s.text && !!s.text.trim()).length, total: list.length };
}

