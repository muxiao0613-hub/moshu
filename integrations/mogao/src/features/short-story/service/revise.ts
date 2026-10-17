/**
 * 短篇生成 · 改稿动作：全文精修、选中文字改写、续写
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./transport + ./text + ./prompts（只依赖底层，不反向）。
 */
import { estimateTokens } from '@/api/tokenTracker';
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import { buildPlatformHint, buildPublicationStandard, buildSystemPrompt } from './prompts';
import { cleanStoryText, looksLikeCompleteStory, trunc } from './text';
import { continueUntilComplete, streamChat, streamChatEx } from './transport';

export async function reviseFullShortStory(params: {
  story: ShortStory;
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, instruction } = params;
  const plain = story.content.replace(/<[^>]*>/g, '').trim();
  if (!plain) throw new Error('当前正文为空，无法精修');

  const refineSystem = '你是严苛的中文短篇小说终审编辑，正在做"可发表前"的最后一轮精修。只输出改好的完整正文，不要解释、不要列修改点。';
  const { text: raw, finishReason: refineFinish } = await streamChatEx(
    refineSystem,
    `${buildPlatformHint(story)}
故事核心：${story.premise || '暂无'}
用户额外精修要求：${instruction || '无'}

━━━ 原正文 ━━━
${plain.slice(0, 22000)}

${buildPublicationStandard(story)}

━━━ 六轮精修工序（必须在脑中执行，不要输出过程）━━━
第一轮：开头重压。前三句必须产生悬念、异常、冲突或情绪压力；删除慢启动。
第二轮：冲突线校准。确认"欲望—阻力—代价—选择—后果"完整，缺失处补成具体场景。
第三轮：场景化改写。把总结性段落改成动作、对话、物件、感官细节；每个重要段落都要推动局面变化。
第四轮：人物去标签。给关键人物补动作习惯、说话方式、职业/生活痕迹；避免脸谱化。
第五轮：结尾回声。结尾必须回收前文具体细节，让读者重新理解故事，不用鸡汤句收束。
第六轮：语言去 AI 味。删掉空泛金句、重复句式、过度解释和"突然明白"的心理总结。

硬性限制：
- 不改变主要人称、核心人物关系和故事基本走向。
- 允许重排句子、合并段落、补少量细节，但不能改成另一个故事。
- 字数保持在原文的 85%-115% 之间。
- 输出完整正文，不要标题。`,
    params.onChunk,
    Math.min(Math.max(plain.length * 2, 5000), 16000)
  );
  let finalText = cleanStoryText(raw);
  // 截断自动续写补全
  if (refineFinish === 'length' || (plain.length > 1000 && !looksLikeCompleteStory(finalText))) {
    finalText = cleanStoryText(await continueUntilComplete(refineSystem, finalText, params.onChunk));
  }
  const minAcceptLen = Math.max(500, Math.floor(plain.length * 0.78));
  if (finalText.length < minAcceptLen) {
    throw new Error('AI 精修结果疑似过短，已拒绝覆盖正文。请重试或降低目标字数。');
  }
  if (plain.length > 1000 && !looksLikeCompleteStory(finalText)) {
    throw new Error('AI 精修结果结尾仍不完整（已自动续写多次），请重试或降低目标字数。');
  }
  return finalText;
}

export async function rewriteSelection(params: {
  story: ShortStory;
  selectedText: string;
  contextBefore?: string;
  instruction: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, selectedText, contextBefore, instruction } = params;

  const raw = await streamChat(
    `你是短篇小说改稿编辑，负责把指定段落改得更像成熟作者的文字。直接输出改写后的文字，不要解释，不要标注修改处，不要重复上下文。`,
    `${buildPlatformHint(story)}

${contextBefore ? `━━━ 上文（仅作参考，不要重复）━━━\n${trunc(contextBefore, 400)}\n` : ''}
━━━ 需要改写的段落 ━━━
${selectedText}

━━━ 改写要求 ━━━
${instruction || `提升这段文字的质量：
- 删除空泛感受词，换成动作、物件、对话和感官细节。
- 让人物说话更有潜台词，不要只传递信息。
- 保留原意，但让节奏更紧，画面更具体。
- 保持与上下文的视角、人称、语气一致。`}

直接输出改写后的文字。`,
    params.onChunk,
    Math.max(estimateTokens(selectedText) * 4, 1200)
  );
  return cleanStoryText(raw);
}

export async function continueShortStory(params: {
  story: ShortStory;
  plotPoints: StoryPlotPoint[];
  instruction: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, plotPoints, instruction } = params;
  const currentText = story.content.replace(/<[^>]*>/g, '');
  const recentText = currentText.slice(-1800);
  const remaining = plotPoints.filter(p => p.content && !currentText.includes(p.content.slice(0, 30)));

  const raw = await streamChat(
    buildSystemPrompt(story),
    `${buildPlatformHint(story)}

故事核心：${story.premise || ''}

━━━ 已写内容末尾（直接接续，不要重复） ━━━
${recentText}

${remaining.length > 0 ? `━━━ 接下来必须推进的情节节点（按序展开，不要一口气写完全部）━━━\n${remaining.map(p => `【${p.label}】${p.content}`).join('\n\n')}\n` : ''}
━━━ 续写要求 ━━━
${instruction ? instruction : '自然衔接上文节奏，推进一个明确事件，场景化展开，不要跳跃。'}
- 续写约 ${Math.min(story.targetWords * 0.4, 1400)} 字。
- 开头第一句必须直接接上前文，不要复述。
- 至少出现一次具体动作、一次有潜台词的对话、一个新的风险/疑问/情绪位移。
- 保持人物语言风格与上文一致。

直接续写正文。`,
    params.onChunk,
    3600
  );
  return cleanStoryText(raw);
}

