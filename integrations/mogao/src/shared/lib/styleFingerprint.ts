/**
 * 风格指纹提取器
 * 基于 novel-creator-skill 的 style_fingerprint.py 思路，纯文本分析，无需 AI。
 * 提取：句均长、对话比例、标点密度、叙事视角、高频短语。
 * 生成可注入 AI 系统提示的约束字符串。
 */

export interface StyleFingerprint {
  avgSentenceLength: number;    // 平均句长（字）
  dialogueRatio: number;        // 对话占比 0-1
  punctuationDensity: number;   // 标点密度（标点/总字）
  preferredPOV: '第一人称' | '第三人称' | '混合';
  topPhrases: string[];         // 高频2-3字短语（前10个）
  sampleChapterIds: string[];   // 用于提取的章节 ID
  charCount: number;            // 样本总字数
  createdAt: Date;
}

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

const SENTENCE_ENDINGS = /[。！？!?…]+/g;
const DIALOGUE_RE = /["「『【]([^"」』】\n]{2,80})["」』】]/g;
const PUNCTUATION_RE = /[，。！？、；：""''「」『』【】《》…—～·]/g;
const FIRST_PERSON_RE = /\b(我|我的|我们|咱|咱们)\b/g;
const THIRD_PERSON_RE = /\b(他|她|它|他们|她们|其|其他)\b/g;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

function extractTopPhrases(text: string, n = 10): string[] {
  const freq: Record<string, number> = {};
  // 提取2-4字中文短语（跳过停用词）
  const stopWords = new Set([
    '的', '了', '在', '是', '我', '他', '她', '你', '们', '就', '都', '也',
    '和', '与', '而', '但', '如', '这', '那', '什么', '一个', '没有', '一样',
    '一直', '起来', '下来', '出来', '进去', '回来',
  ]);
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= text.length - len; i++) {
      const phrase = text.slice(i, i + len);
      if (!/[一-龥]{2,}/.test(phrase)) continue;
      if (stopWords.has(phrase)) continue;
      freq[phrase] = (freq[phrase] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([phrase]) => phrase);
}

// ─── 主提取函数 ───────────────────────────────────────────────────────────────

export function extractStyleFingerprint(
  text: string,
  sampleChapterIds: string[] = []
): StyleFingerprint {
  const clean = text.replace(/<[^>]*>/g, '').trim();
  const charCount = clean.length;

  // 平均句长
  const sentences = clean.split(SENTENCE_ENDINGS).filter(s => s.trim().length > 2);
  const avgSentenceLength = sentences.length > 0
    ? Math.round(sentences.reduce((s, sen) => s + sen.length, 0) / sentences.length)
    : 20;

  // 对话比例
  const dialogueMatches = [...clean.matchAll(DIALOGUE_RE)];
  const dialogueChars = dialogueMatches.reduce((s, m) => s + m[0].length, 0);
  const dialogueRatio = charCount > 0 ? dialogueChars / charCount : 0;

  // 标点密度
  const punctuationCount = countMatches(clean, PUNCTUATION_RE);
  const punctuationDensity = charCount > 0 ? punctuationCount / charCount : 0;

  // 叙事视角
  const firstCount = countMatches(clean, FIRST_PERSON_RE);
  const thirdCount = countMatches(clean, THIRD_PERSON_RE);
  let preferredPOV: StyleFingerprint['preferredPOV'];
  if (firstCount > thirdCount * 2) preferredPOV = '第一人称';
  else if (thirdCount > firstCount * 2) preferredPOV = '第三人称';
  else preferredPOV = '混合';

  // 高频短语
  const topPhrases = extractTopPhrases(clean);

  return {
    avgSentenceLength,
    dialogueRatio: parseFloat(dialogueRatio.toFixed(3)),
    punctuationDensity: parseFloat(punctuationDensity.toFixed(3)),
    preferredPOV,
    topPhrases,
    sampleChapterIds,
    charCount,
    createdAt: new Date(),
  };
}

/** 将风格指纹转换为可注入 AI System Prompt 的约束说明 */
export function stylePromptHint(fp: StyleFingerprint): string {
  const parts: string[] = ['【写作风格约束（从样本章节提取，请严格遵守）】'];

  parts.push(`句长：平均每句约${fp.avgSentenceLength}字，${fp.avgSentenceLength < 15 ? '倾向短句，节奏紧凑' : fp.avgSentenceLength > 30 ? '倾向长句，叙述舒展' : '句长适中'}`);

  const dialoguePct = Math.round(fp.dialogueRatio * 100);
  parts.push(`对话比例：约${dialoguePct}%，${dialoguePct > 40 ? '对话频繁，节奏活泼，需保持对话密度' : dialoguePct < 15 ? '以叙述为主，少用对话' : '叙述与对话均衡'}`);

  parts.push(`叙事视角：${fp.preferredPOV}，生成时保持相同视角，不得随意切换`);

  if (fp.topPhrases.length > 0) {
    parts.push(`作者惯用短语（体现个人风格，可适当复用）：${fp.topPhrases.slice(0, 6).join('、')}`);
  }

  parts.push('注意：生成内容须与样本风格保持高度一致，避免语体突变或引入样本中不存在的表达习惯。');

  return parts.join('\n');
}

/** 格式化展示风格指纹摘要 */
export function formatFingerprintSummary(fp: StyleFingerprint): string {
  const dialoguePct = Math.round(fp.dialogueRatio * 100);
  const punctPct = Math.round(fp.punctuationDensity * 100);
  return `句均${fp.avgSentenceLength}字 · 对话占${dialoguePct}% · 标点密度${punctPct}% · ${fp.preferredPOV} · 样本${Math.round(fp.charCount / 1000)}K字`;
}

// ---------------------------------------------------------------------------
// 风格样本（REFACTOR_PLAN.md §6.3「风格样本库」）
//
// 指纹给出的是一串抽象数字（句均 18 字、对话占 32%），模型很难据此模仿一个人；
// 样本是作者自己的原文片段，直接进提示词，语感迁移比任何统计量都准。
// 两者不冲突：指纹管「别跑偏」，样本管「像他写的」。
// ---------------------------------------------------------------------------

/** 最多注入几段样本（多了会挤占剧情上下文） */
export const MAX_STYLE_SAMPLES = 3;
/** 每段样本最多注入多少字 */
export const MAX_STYLE_SAMPLE_CHARS = 400;
/** 短于这个长度的片段不足以体现语感，直接丢弃 */
export const MIN_STYLE_SAMPLE_CHARS = 80;

/** 从一段原文里取一段能代表语感的片段（过长时从偏中前部截取，跳过开头的钩子句） */
function sampleExcerpt(text: string, maxChars = MAX_STYLE_SAMPLE_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length < MIN_STYLE_SAMPLE_CHARS) return '';
  if (clean.length <= maxChars) return clean;
  const start = Math.floor((clean.length - maxChars) / 3);
  return clean.slice(start, start + maxChars).trim();
}

/** 从若干段纯文本（已去标签）中挑出风格样本，最多 `maxSamples` 段 */
export function extractStyleSamples(texts: string[], maxSamples = MAX_STYLE_SAMPLES): string[] {
  const out: string[] = [];
  for (const text of texts) {
    if (out.length >= maxSamples) break;
    const excerpt = sampleExcerpt(text);
    if (excerpt) out.push(excerpt);
  }
  return out;
}

/** 把风格样本转成可注入提示词的段落；没有样本时返回空字符串（不占 token） */
export function styleSampleHint(samples?: string[] | null): string {
  const list = (samples ?? [])
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, MAX_STYLE_SAMPLES);
  if (list.length === 0) return '';
  const parts: string[] = ['【风格样本（作者原文，模仿其语感、句式与用词，不要照抄其中情节）】'];
  list.forEach((s, i) => parts.push(`样本${i + 1}：${s.slice(0, MAX_STYLE_SAMPLE_CHARS)}`));
  parts.push('注意：上面是作者自己写的文字，生成时须与之语感一致，而不是套用通用网文腔。');
  return parts.join('\n');
}
