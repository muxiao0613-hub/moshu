/**
 * 人物语气样本（「对白演练」的落点，REFACTOR_PLAN 的写作质量路线）。
 *
 * 为什么需要它：人物档案里的 `personality` 是一串抽象形容词（"外冷内热"），
 * 模型据此只能自由发挥，于是同一个人在第 3 章与第 40 章说话不像同一个人。
 * 对话片段是**语感证据**——和「风格样本」是同一个原理（给原文比给"平均句长 18 字"有效）。
 *
 * 三个约束（写在常量里，UI 与编译器共用同一份口径）：
 * - 一段样本最多 300 字：再长就开始挤占剧情上下文；
 * - 每个角色最多保存 3 段，注入时合并后仍截到 300 字；
 * - 一次生成最多注入 3 个角色的语气（按主角 / 反派 / 配角 / 次要排序取前几个）。
 *
 * 依赖方向：只依赖 @/shared/types（纯函数，无副作用、无 React）。
 */
import type { Character } from '@/shared/types';

/** 每个角色最多保存几段语气样本 */
export const MAX_VOICE_SAMPLES = 3;
/** 每个角色注入时最多多少字（多段合并后仍截到这里） */
export const MAX_VOICE_CHARS = 300;
/** 短于这个长度的片段不足以体现语气，直接丢弃 */
export const MIN_VOICE_SAMPLE_CHARS = 40;
/** 一次生成最多注入几个角色的语气 */
export const MAX_VOICE_CHARACTERS = 3;

/** 角色重要度：数字小的先注入（主角的说话方式最要紧） */
const ROLE_WEIGHT: Record<Character['role'], number> = {
  protagonist: 0,
  antagonist: 1,
  supporting: 2,
  minor: 3,
};

/** 压平空白，便于估算 token 与展示 */
function clean(text: string): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** 按字数上限截断（不补省略号，避免截断符被模型当成文风） */
export function clampVoiceSample(text: string, maxChars = MAX_VOICE_CHARS): string {
  const t = clean(text);
  return t.length <= maxChars ? t : t.slice(0, maxChars).trim();
}

/** 保存前的清洗：太短（没有语感信息量）返回 null，让 UI 明确拒绝而不是静默存进去 */
export function saveableVoiceSample(text: string, maxChars = MAX_VOICE_CHARS): string | null {
  const t = clampVoiceSample(text, maxChars);
  return t.length >= MIN_VOICE_SAMPLE_CHARS ? t : null;
}

/** 该角色所有样本合并后的注入文本（超过 300 字就截断） */
export function characterVoiceText(character: Character): string {
  const samples = (character.voiceSamples ?? []).map(clean).filter(Boolean).slice(-MAX_VOICE_SAMPLES);
  const share = Math.floor((MAX_VOICE_CHARS - Math.max(0, samples.length - 1)) / Math.max(1, samples.length));
  const merged = samples.map(s => s.slice(0, share)).join('\n');
  return clampVoiceSample(merged);
}

/** 该角色是否已经保存过可用样本 */
export function hasVoiceSample(character: Character): boolean {
  return characterVoiceText(character).length >= MIN_VOICE_SAMPLE_CHARS;
}

/**
 * 谁该带上语气样本：本章文本（正文 + 大纲）里被姓名/别名命中的角色，最多 `max` 人。
 *
 * 判定用与「涉及人物」同一套方式（名字/别名出现即算上场），但**只看有样本的人**，
 * 且按角色重要度排序。没有任何命中就返回空——不为了"填满额度"注入无关角色
 * （那会把别人的语气混进这一场戏）。
 */
export function pickVoiceCharacters(
  source: string,
  characters: Character[],
  max = MAX_VOICE_CHARACTERS
): Character[] {
  const text = (source ?? '').toLowerCase();
  if (!text.trim()) return [];
  const hit = characters.filter(c => {
    if (!hasVoiceSample(c)) return false;
    const names = [c.name, ...(c.aliases ?? [])].filter(Boolean).map(n => n.toLowerCase());
    return names.some(n => text.includes(n));
  });
  return hit
    .slice()
    .sort((a, b) => ROLE_WEIGHT[a.role] - ROLE_WEIGHT[b.role])
    .slice(0, max);
}

/** 单个角色一条：自带小标题，所以每条都能独立看懂（也便于在抽屉里逐条开关） */
export function characterVoiceHint(character: Character): string | null {
  const text = characterVoiceText(character);
  if (!text) return null;
  return `【${character.name} 的语气（作者原文，模仿其说话方式、用词与句长，不要照抄其中情节）】\n${text}`;
}

/** 多角色整块（整章生成 / 单场重写用；没有样本时返回空字符串，不占 token） */
export function voiceSampleHint(characters: Character[]): string {
  const blocks = characters
    .map(characterVoiceHint)
    .filter((b): b is string => !!b)
    .slice(0, MAX_VOICE_CHARACTERS);
  if (blocks.length === 0) return '';
  return blocks.join('\n\n');
}
