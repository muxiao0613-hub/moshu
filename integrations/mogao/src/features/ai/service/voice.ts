/**
 * AI 服务 · 对白演练（角色扮演聊天）—— 像 C 端聊天一样，作者和角色一来一回地演。
 *
 * 为什么要从「一次生成一整段对白」改成聊天：一次成型的对白里，作者想改的往往是
 * 「他这时候不该这么说」——只能整段重生成，改到最后就放弃了。聊天形态下作者可以
 * 用旁白推进剧情、用某个角色的身份插话，角色一轮一轮地反应，情节和人物特点是在
 * 对话里长出来的，而不是被一次写死。
 *
 * 产物仍然是**语气样本**（`character.voiceSamples`）：聊天结束后作者挑某个角色的
 * 台词，改顺了再存（见 @/shared/lib/voiceSample 与 features/character/drill）。
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：transport（底层）+ shared 的纯函数，不引用上层业务模块。
 */
import { estimateTokens } from '@/api/tokenTracker';
import { characterProfile } from '@/shared/lib/characterProfile';
import { type RoleplayMessage, transcriptOf } from '@/shared/lib/roleplay';
import { trunc } from '@/shared/lib/text';
import { characterVoiceText, MAX_VOICE_CHARS } from '@/shared/lib/voiceSample';
import type { Character, FactLedger, PlotThread, Project, RagChunk, StoryBible } from '@/shared/types';
import { extractUsage, streamChat } from './transport';

export interface RoleplayTurnParams {
  project: Project;
  /** 上场角色（1–3 人：再多就分不清谁在说话了，与语气样本的注入上限一致） */
  characters: Character[];
  /** 情境：一句话交代时间地点与彼此处境 */
  scene: string;
  /** 到目前为止的完整对话（作者发言 + 角色发言原文） */
  history: RoleplayMessage[];
  /** 作者以谁的视角说话：留空 = 旁白/导演；填角色名 = 扮演这个角色与其他人对戏 */
  writerRole?: string;
  instruction?: string;
  /** 可借力的伏笔（给对话找点张力来源） */
  threads?: PlotThread[];
  allCharacters?: Array<Pick<Character, 'id' | 'name'>>;
  sources?: RagChunk[];
  facts?: FactLedger[];
  memoryContext?: Record<string, string>;
  storyBible?: StoryBible;
  conversationMode?: 'author' | 'scene';
  onChunk?: (c: string) => void;
  signal?: AbortSignal;
}

const ROLE_LABEL: Record<Character['role'], string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '次要角色',
};

/** 一个角色的出演说明：性格是抽象词，必须配上动机、身份与「他到底怎么说话」 */
function roleCard(c: Character, characters: Array<Pick<Character, 'id' | 'name'>>, memory?: string): string {
  const parts = [characterProfile({ ...c, arc: '' }, characters, 240, { includeMemory: false }), `角色定位：${ROLE_LABEL[c.role] ?? '配角'}`];
  if (memory) parts.push(memory);
  const existing = characterVoiceText(c);
  if (existing) {
    // 已有样本 → 这一场必须沿用同一种说话方式（演练是「加样本」，不是「改人设」）
    parts.push(`已确认的语气样本（只参考说话方式，台词情节不构成当前经历）：\n${existing}`);
  }
  return parts.join('\n');
}

export function buildRoleplaySystem(project: Project, mode: 'author' | 'scene' = 'author'): string {
  return `你正在和《${project.title}》（${project.genre}类）的作者做「角色对话」。${mode === 'author' ? '作者以本人身份与你交流，询问你在小说里的选择、动机和感受；你以角色本人身份回答，不要把作者的提问当成剧情事实。' : '作者通过旁白或扮演角色与你对戏；这一场是创作探索，尚未成为小说正史。'}

作品简介：${trunc(project.synopsis, 150)}

铁律：
1. 每次回复里，每个角色**各自单独一段**，段落必须以「【角色名】」开头（例如：\`【林砚】我不问你为什么，我只问你什么时候开始。\`），不要在段首写别的字。
2. 只写这个角色会说的话，可以带极短的圆括号动作/神态（例如：\`（他把伞往你那边偏了偏。）\`）。不写旁白解释、不写心理分析、不写小标题、不复述作者刚说过的话。
3. 人物之间说话方式必须能区分：句长、用词、口癖、回避话题的方式各有一套，不能是同一个声音换名字；已有语气样本的角色必须沿用样本里的说话方式。
4. 以已确认档案、故事规则和已确认经历为依据。每个角色只能声称知道自己档案中明确记录的已知信息；其他角色的记忆、作品简介和作者的剧情计划不等于自己已知的事实。引用原文用于核验，不能自动赋予角色全知视角。区分正文里发生的事、角色对此的主观解释、当前聊天新探索的可能性。缺少依据时坦承不知道，不能编造过去发生的事件；作者假设不能自动覆盖已有事实。
5. 称呼、关系、已知事实必须前后一致（用上面的人物卡核对）；档案里没写的细节宁可不提。
6. 一次回复不超过 400 字，可自然反问作者。新习惯、恐惧和动机是待作者确认的候选特点；只有作者明确保存的内容才能成为后续写作依据。`;
}

export function buildRoleplayUser(p: RoleplayTurnParams): string {
  const threadHint = (p.threads ?? [])
    .filter(t => t.status !== 'resolved' && t.status !== 'abandoned')
    .slice(0, 3)
    .map(t => `【${t.title}】${trunc(t.description, 60)}`)
    .join('\n');
  const transcript = transcriptOf(p.history.slice(-40), p.characters).slice(-16000);
  const writer = p.writerRole ? `作者扮演：${p.writerRole}` : p.conversationMode === 'scene' ? '作者身份：旁白 / 导演（当前场景属于创作探索）' : '作者身份：作者本人（直接询问角色，不扮演旁白）';
  const evidence = (p.sources ?? []).map(s => `[第${s.chapterOrder}章《${s.chapterTitle}》] ${s.excerpt}`).join('\n');
  const facts = (p.facts ?? []).map(f => `${f.subject}：${f.fact}`).join('\n');
  const rules = p.storyBible ? [...(p.storyBible.hardRules ?? []), ...(p.storyBible.powerRules ?? []), ...(p.storyBible.taboo ?? []).map(t => `禁止：${t}`)].join('；') : '';
  return `上场角色：
${p.characters.map(c => roleCard(c, p.allCharacters ?? p.characters, p.memoryContext?.[c.id])).join('\n\n')}

【已确认经历中的正文引用】
${evidence || '档案中暂无已确认的正文证据。仅依据人物底色交流，不得编造小说经历。'}
【已确认事实】${facts || '暂无'}
【故事规则】${rules || '暂无'}

情境：${p.scene}
${writer}${threadHint ? `\n作者的创作计划（尚未成为经历，也不代表角色知道）：\n${threadHint}` : ''}${p.instruction ? `\n额外要求：${p.instruction}` : ''}

${transcript ? `对话记录（最新的在后）：\n${transcript}` : '（作者还没开口：请按情境让角色自然开口，先由最有主动性的角色起头。）'}

请接着往下演，按「【角色名】」分段回复。`;
}

/**
 * 演一轮（流式）：作者发言后，让上场角色轮流回应。
 *
 * 返回的只是**候选文本**，要经作者看过再由 UI 存进 `character.voiceSamples`
 * —— 直接入库会把模型的 AI 腔固化成「这个人的说话方式」，比不注入更糟。
 */
export async function roleplayTurn(params: RoleplayTurnParams): Promise<string> {
  const system = buildRoleplaySystem(params.project, params.conversationMode);
  const user = buildRoleplayUser(params);
  // 一轮 400 字以内，但多角色加起来可能长一些；1200 足够且不会让一次回复失控
  const full = await streamChat(system, user, params.onChunk, 1200, { signal: params.signal, temperature: 0.85 });
  // 用量记账已在 transport.streamChat 内完成（服务商不回 usage 时它也按字符估算），此处不再补记：
  // 重复补记会把同一次调用算两遍，而 getClient() 在缺 Key 时是抛错而非返回空，判空没有意义。
  return full;
}

/** 供 UI 估算「存下来会给每次生成加多少 token」（每角色最多 MAX_VOICE_CHARS 字） */
export function estimateVoiceTokens(text: string): number {
  return estimateTokens(text.slice(0, MAX_VOICE_CHARS));
}

/** 重新导出：UI 需要判断流式是否被用户中止（与 transport 同一错误类型，避免两处判断不一致） */
export { AIAbortError } from './transport';
export { extractUsage };
