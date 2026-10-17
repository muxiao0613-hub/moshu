/**
 * 短篇生成 · 多版本开头与结尾：3 种风格各异的开头、3 种结尾
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./transport + ./text + ./prompts（只依赖底层，不反向）。
 */
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import { buildPlatformHint } from './prompts';
import { cleanStoryText, parseJsonFromAI, trunc } from './text';
import { streamChat } from './transport';

export async function generateMultipleOpenings(params: {
  story: ShortStory;
  plotPoints: StoryPlotPoint[];
  onChunk?: (c: string) => void;
}): Promise<string[]> {
  const { story, plotPoints } = params;
  const structureSummary = plotPoints
    .filter(p => p.content)
    .map(p => `【${p.label}】${trunc(p.content, 120)}`)
    .join('\n');

  const platformOpeningTips: Record<string, string> = {
    '小红书故事': '第一句必须能截图传播：反常、冲突、秘密或情绪爆点；第一人称；短段落。',
    '知乎盐选': '前两段建立真实人物质感和持续疑问，不能像营销号，细节要落地。',
    '公众号': '前 100 字内给核心悬念或情绪触发点，句子干净，节奏快。',
    '纯文学': '可以意象化或冷静叙事，但必须有暗涌，不能空泛。',
    '自由创作': '三种开头风格各异，均要具备故事发动机。',
  };

  const raw = await streamChat(
    `你是短篇小说开篇专家，熟悉「${story.platform}」平台读者口味。只输出纯 JSON 数组，不含 markdown。`,
    `为这篇故事生成 3 种截然不同的开头。每种 180-320 字，必须能直接作为正文第一段使用。

故事核心：${story.premise || '暂无'}
${buildPlatformHint(story)}

故事骨架概览：
${structureSummary || '暂无骨架'}

平台开头要点：${platformOpeningTips[story.platform] || ''}

三种开头方式：
1. 直入冲突型：第一句就是危机、冲突或异常动作；不解释背景。
2. 反常陈述型：第一句提出违反常识的判断，随后立刻给出具体场景支撑。
3. 物件/场景型：从一个可触摸的物件、声音或场景开始，让它暗示核心矛盾。

每种开头都必须包含：具体人物、具体关系、具体场景、一个未解问题。
禁止：空泛抒情、背景设定大段说明、只有概念没有事件。

只输出 JSON 数组（3个字符串）：["开头一正文","开头二正文","开头三正文"]`,
    params.onChunk,
    4500
  );

  try {
    return parseJsonFromAI<string[]>(raw).map(cleanStoryText).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
}

export async function generateMultipleEndings(params: {
  story: ShortStory;
  currentContent: string;
  onChunk?: (c: string) => void;
}): Promise<string[]> {
  const { story, currentContent } = params;
  const bodyText = currentContent.replace(/<[^>]*>/g, '').slice(-3000);

  const raw = await streamChat(
    `你是短篇小说结尾专家，熟悉「${story.platform}」平台的结尾偏好。只输出纯 JSON 数组，不含 markdown。`,
    `为这篇故事生成 3 种不同结尾（各 180-320 字），每种风格截然不同，但都必须自然衔接前文。

${buildPlatformHint(story)}

━━━ 故事主体末尾（接着写）━━━
${bodyText}

三种结尾风格：
1. 反转收尾：揭示读者没想到但前文已有线索支持的信息。
2. 情感留白：用一个具体动作、物件或沉默结束，不解释情感。
3. 情绪余震：回收前文意象/台词，让读者意识到人物已经改变。

硬性要求：不得凭空引入新人物/新设定；不得用鸡汤句总结；必须有具体细节。

只输出 JSON 数组（3个字符串）：["结尾一","结尾二","结尾三"]`,
    params.onChunk,
    3000
  );

  try {
    return parseJsonFromAI<string[]>(raw).map(cleanStoryText).filter(Boolean).slice(0, 3);
  } catch {
    return [];
  }
}

