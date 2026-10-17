/**
 * 短篇生成 · 成稿流程：一次成稿 / 分段（逐场景）成稿 / 字数补足 / 精修前置的初稿润色
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./transport + ./text + ./prompts + ./outline（上层编排，不反向；本模块为 .service 内的最高层之一）。
 */
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import { autoSceneLabels, generateStoryStructure } from './outline';
import { buildPlatformHint, buildPublicationStandard, buildStoryContract, buildSystemPrompt } from './prompts';
import { cleanStoryText, getTargetWordBand, looksLikeCompleteStory, trunc } from './text';
import { continueUntilComplete, streamChat, streamChatEx } from './transport';

export async function polishStoryDraft(story: ShortStory, draft: string): Promise<string> {
  const text = cleanStoryText(draft);
  if (!text || text.length > 18000 || story.targetWords > 8000) return text;

  try {
    const polished = await streamChat(
      `你是中文文学编辑，专门清除 AI 写作痕迹。只做删除和具体化，不做发散式重写润色。只输出改好的完整正文，不要解释。`,
      `${buildPlatformHint(story)}

在【不改动主线情节、人物、对白内容、人物关系、结尾含义】的前提下，逐句清理以下问题，输出清理后的完整正文：
1. 删除所有格言/金句式收尾句（"或许……""有些……注定……""在那一刻他明白……"）。
2. 删除动作后的情绪解说赘句（保留动作，删掉"心中涌起……""一种说不出的……"）。
3. 把总结性叙述改写成具体动作/物件/对话/场景细节（"他们聊了很久"→ 写一两句实际对话）。
4. 删减副词，尤其"静静地/缓缓地/轻轻地/淡淡地"，除非不可替代。
5. 打散过于工整的排比对仗，让句子长短不齐。
6. 删除与情节无关的悬浮空镜过渡。
7. 强化开头三句的钩子；结尾改成对前文具体细节的掐断式回收，不要点破。
8. 对话像真人，避免"我知道了/你误会了/其实我是为了你好"等模板句。
重要：宁可句子"不那么漂亮"，也绝不要 AI 式圆滑工整；保留具体、留白和不完美。字数大致保持 ${Math.round(story.targetWords * 0.85)}-${Math.round(story.targetWords * 1.15)} 字。

━━━ 初稿 ━━━
${text}

现在输出清理后的完整正文：`,
      undefined,
      Math.min(Math.max(story.targetWords * 4, 4000), 8000)
    );
    const finalText = cleanStoryText(polished);
    const minAcceptLen = Math.max(600, Math.floor(text.length * 0.72));
    if (finalText.length < minAcceptLen) return text;
    if (text.length > 1200 && !looksLikeCompleteStory(finalText)) return text;
    return finalText.length > 200 ? finalText : text;
  } catch {
    return text;
  }
}

export async function generateFullShortStory(params: {
  story: ShortStory;
  plotPoints: StoryPlotPoint[];
  chosenOpening?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const filled = params.plotPoints.filter(p => p.content);
  const target = params.story.targetWords;

  // 目标稍大但没填骨架 → 先自动规划场景，走可靠的「分段生成」而非「一口气写」（flash 单遍严重偷工）
  if (filled.length === 0 && target > 1800) {
    params.onChunk?.('【规划场景结构…】\n');
    const auto = await generateStoryStructure({
      story: params.story, templateLabels: autoSceneLabels(target),
    }).catch(() => [] as StoryPlotPoint[]);
    if (auto.filter(p => p.content).length >= 3) {
      params.onChunk?.('【开始分段成文…】\n\n');
      const draft = await generateSegmentedStory({ ...params, plotPoints: auto });
      return finalizeStory(params.story, draft, params.onChunk);
    }
  }

  const draft = target <= 1800 || filled.length === 0
    ? await generateOneShotStory(params)
    : await generateSegmentedStory(params);
  return finalizeStory(params.story, draft, params.onChunk);
}

// 字数安全网：成稿明显短于目标时自动补足，再精修
export async function finalizeStory(story: ShortStory, draft: string, onChunk?: (c: string) => void): Promise<string> {
  let text = cleanStoryText(draft);
  const charCount = (t: string) => t.replace(/<[^>]*>/g, '').replace(/\s/g, '').length;
  // 不足目标 78% 时补足（最多两轮），避免 flash 偷工只写一千多字
  for (let i = 0; i < 2 && charCount(text) < story.targetWords * 0.78; i++) {
    onChunk?.(`\n【字数不足（${charCount(text)}/${story.targetWords}），自动补足…】\n`);
    try {
      const extended = await completeShortStoryToTarget({ story: { ...story, content: text }, onChunk });
      if (charCount(extended) > charCount(text)) text = cleanStoryText(extended); else break;
    } catch { break; }
  }
  return polishStoryDraft(story, text);
}

export async function generateOneShotStory(params: {
  story: ShortStory;
  plotPoints: StoryPlotPoint[];
  chosenOpening?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, plotPoints, chosenOpening } = params;
  const { filled, perNode, structureGuide } = buildStoryContract(story, plotPoints);

  const raw = await streamChat(
    buildSystemPrompt(story),
    `${buildPlatformHint(story)}

故事核心：${story.premise || '请自由发挥，但必须有明确人物欲望、阻力和代价'}

━━━ 情节骨架 ━━━
${structureGuide}

${chosenOpening ? `━━━ 已选定开头（必须照用，之后自然续写，不要重写开头）━━━\n${chosenOpening}\n` : ''}

━━━ 成稿协议 ━━━
${buildPublicationStandard(story)}
- 全文目标：${story.targetWords} 字，允许上下浮动 15%，但不得明显短篇化敷衍。
- 骨架节点数：${filled.length || '由你自行规划'}；每个已给节点展开不少于 ${perNode} 字。
- 正文要有完整短篇闭环：开头钩子 → 具体困境 → 冲突升级 → 关键选择/揭示 → 余韵收束。
- 每个节点至少写成一个具体场景，包含动作、对话、感官细节；不能用总结句跳过。
- 结尾必须回收前文一个具体物件/动作/台词。
- 输出格式：只输出正文，不加标题、小结、创作说明。

现在开始写正文：`,
    params.onChunk,
    Math.min(Math.max(story.targetWords * 6, 5000), 16000)
  );

  return cleanStoryText(raw);
}

export async function generateSegmentedStory(params: {
  story: ShortStory;
  plotPoints: StoryPlotPoint[];
  chosenOpening?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, plotPoints, chosenOpening, onChunk } = params;
  const filled = plotPoints.filter(p => p.content);
  const wordsPerSeg = Math.ceil(story.targetWords / filled.length);
  const globalStructure = filled.map((p, i) => `${i + 1}. ${p.label}：${trunc(p.content, 180)}`).join('\n');

  let fullText = '';
  let continuityMemo = '';

  for (let i = 0; i < filled.length; i++) {
    const pt = filled[i];
    const isFirst = i === 0;
    const isLast = i === filled.length - 1;
    const target = wordsPerSeg;
    const remaining = filled.slice(i + 1).map((p, j) => `${i + j + 2}. ${p.label}`).join('、');
    const prevSnippet = fullText.slice(-900);

    const rawSeg = await streamChat(
      buildSystemPrompt(story),
      `${buildPlatformHint(story)}

故事核心：${story.premise || ''}

━━━ 全文骨架概览（用于控制全局节奏，不要提前写后续节点）━━━
${globalStructure}

${continuityMemo ? `━━━ 连续性备忘（必须保持一致）━━━\n${continuityMemo}\n` : ''}
${isFirst && chosenOpening ? `━━━ 已选定开头（必须照用，从这里开始）━━━\n${chosenOpening}\n` : ''}
${!isFirst && prevSnippet ? `━━━ 前文末尾（直接衔接，不重复）━━━\n${prevSnippet}\n` : ''}

━━━ 本段节点（第 ${i + 1}/${filled.length} 段）━━━
【${pt.label}】
${pt.content}

${!isLast ? `后续节点（本段只能埋钩子，不能直接写完）：${remaining}` : ''}

━━━ 本段成稿要求 ━━━
${buildPublicationStandard(story)}
- 本段目标约 ${target} 字，最低不少于 ${Math.round(target * 0.75)} 字。
- ${isFirst ? '直接从故事第一句开始，不加章节标题或序号。' : '自然衔接前文，不重复已有内容，不另起章节标题。'}
- ${isLast ? '结尾段必须回收前文细节，有余韵或反转，干净收尾。' : '本段结尾必须留下未完成的情绪、疑问或风险，引出下一段。'}
- 至少包含：一个具体场景、一组有潜台词的对话、一个可感知细节、一次人物认知/关系变化。
- 禁止总结式推进，禁止提前解释主题。

直接输出本段正文：`,
      (c) => onChunk?.(c),
      Math.min(Math.max(target * 6, 3200), 12000)
    );

    const seg = cleanStoryText(rawSeg);
    fullText += (isFirst ? '' : '\n\n') + seg;

    continuityMemo = await buildContinuityMemo(story, fullText, continuityMemo);
  }

  return cleanStoryText(fullText);
}

export async function buildContinuityMemo(story: ShortStory, fullText: string, oldMemo: string): Promise<string> {
  if (!fullText || fullText.length < 600) return oldMemo;
  try {
    const raw = await streamChat(
      '你是小说连续性编辑。只输出简短备忘，不要解释。',
      `请根据已写正文，提炼后续写作必须保持一致的连续性备忘，最多 8 条，每条不超过 30 字。包括：人物关系、已揭示信息、未回收伏笔、关键物件、叙事口吻。

平台：${story.platform} 类型：${story.genre}
旧备忘：${oldMemo || '无'}

已写正文末尾与关键信息：
${fullText.slice(-3500)}

输出格式：每条以"- "开头。`,
      undefined,
      800
    );
    return raw.trim().split('\n').filter(Boolean).slice(0, 8).join('\n');
  } catch {
    return oldMemo;
  }
}

export async function completeShortStoryToTarget(params: {
  story: ShortStory;
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { story, instruction } = params;
  const plain = story.content.replace(/<[^>]*>/g, '').trim();
  if (!plain) throw new Error('当前正文为空，无法补足');
  const { min, ideal, max } = getTargetWordBand(story);
  const system = buildSystemPrompt(story);
  const { text: raw, finishReason } = await streamChatEx(
    system,
    `${buildPlatformHint(story)}
${buildPublicationStandard(story)}
用户补足要求：${instruction || '无'}

━━━ 当前正文（必须在此基础上续补/整合，不要推翻重写）━━━
${plain.slice(0, 22000)}

━━━ 补足任务 ━━━
- 如果当前正文低于 ${min} 字：在不换题的前提下补足关键场景、对话、代价和结尾回收。
- 如果当前正文已经接近目标：只做轻量修补，重点补结尾余韵和前后照应。
- 最终输出一篇完整正文，目标 ${ideal} 字，尽量不超过 ${max} 字。
- 不要输出标题、说明、修改理由。

现在输出补足后的完整正文：`,
    params.onChunk,
    // DeepSeek 等单次输出上限约 8K，超额无意义
    Math.min(Math.max(story.targetWords * 5, 5000), 16000)
  );
  let finalText = cleanStoryText(raw);

  // 截断自动续写：因长度截断或结尾不完整时，让 AI 接着写完
  if (finishReason === 'length' || (finalText.length > 1000 && !looksLikeCompleteStory(finalText))) {
    finalText = cleanStoryText(await continueUntilComplete(system, finalText, params.onChunk));
  }

  if (finalText.length < Math.max(500, Math.floor(plain.length * 0.9))) {
    throw new Error('AI 补足结果疑似不完整，已拒绝覆盖正文。请重试或降低目标字数。');
  }
  if (finalText.length > 1000 && !looksLikeCompleteStory(finalText)) {
    throw new Error('AI 补足结果结尾仍不完整（已自动续写多次），请重试或降低目标字数。');
  }
  return finalText;
}

