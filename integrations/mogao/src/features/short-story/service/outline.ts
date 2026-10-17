/**
 * 短篇生成 · 骨架与内核：情节骨架生成、故事内核补强、标题生成、自动场景分段规划
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./transport + ./text + ./prompts（只依赖底层，不反向）。
 */
import { v4 as uuidv4 } from 'uuid';
import type { ShortStory, StoryPlotPoint } from '@/shared/types';
import { buildPlatformHint } from './prompts';
import { parseJsonFromAI } from './text';
import { streamChat } from './transport';

// ─── 1. 生成故事骨架 ─────────────────────────────────────────────────────────

export async function generateStoryStructure(params: {
  story: ShortStory;
  templateLabels: string[];
  onChunk?: (c: string) => void;
}): Promise<StoryPlotPoint[]> {
  const { story, templateLabels } = params;

  const raw = await streamChat(
    `你是顶级短篇小说策划编辑，擅长把模糊灵感拆成可直接成文的情节工程。只输出纯 JSON 数组，不含 markdown 或任何解释。`,
    `请为以下短篇设计"可直接写成正文"的高质量情节骨架。

故事核心：${story.premise || '暂无，请根据平台和类型自行构思一个有张力的核心'}
${buildPlatformHint(story)}

━━━ 先在脑中完成，但不要输出的设计 ━━━
- 主角：具体身份、显性欲望、隐藏伤口/误信念
- 对立力量：人、制度、秘密、时间压力或自我矛盾
- 核心代价：如果失败，主角会失去什么
- 关键意象/物件：一个贯穿开头和结尾的具体细节
- 反转逻辑：反转必须来自前文线索，不得凭空出现

━━━ 每个节点必须包含 ━━━
1. 具体场景：时间 + 地点 + 场面状态
2. 具体行动：谁做了什么，不用概括词
3. 具体细节：物件/声音/气味/动作/一句台词中至少一个
4. 情绪位移：人物的认知或关系发生了什么变化
5. 钩子功能：本节点留下什么疑问、压力或期待

节点字数：每节点 140-240 字。
禁止概括：不要写"主角陷入低谷、开始反思、两人逐渐熟悉"这类空话。

需要填写的骨架节点（按顺序）：
${templateLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}

输出 JSON 数组，格式必须严格如下：
[{"label":"节点名","content":"具体情节内容，包含场景/行动/细节/情绪位移/钩子"}]`,
    params.onChunk,
    4500
  );

  try {
    const parsed = parseJsonFromAI<Array<{ label: string; content: string }>>(raw);
    return parsed.map((item, i) => ({
      id: uuidv4(),
      label: item.label || templateLabels[i] || `节点${i + 1}`,
      hint: '',
      content: item.content || '',
      order: i + 1,
    }));
  } catch {
    return templateLabels.map((label, i) => ({
      id: uuidv4(), label, hint: '', content: '', order: i + 1,
    }));
  }
}

// ─── 1.5 一键深化故事内核 ───────────────────────────────────────────────────

export async function enhanceStoryPremise(params: {
  story: ShortStory;
  onChunk?: (c: string) => void;
}): Promise<{ premise: string; styleConstraint: string; editorNote: string }> {
  const { story } = params;
  const raw = await streamChat(
    '你是短篇小说开发编辑，擅长把普通灵感升级为可写、可读、有冲突、有余韵的故事内核。只输出纯 JSON 对象，不含 markdown。',
    `${buildPlatformHint(story)}

用户当前灵感/简介：${story.premise || '暂无'}
用户当前风格约束：${story.styleConstraint || '暂无'}

请把它补强为更适合短篇成稿的"故事内核"。注意：你的任务是补充和加固，不是换题重写；必须保留用户原始核心一句话中的主角关系、核心事件、中心冲突和情绪方向。

必须完成的编辑判断：
1. 主角是谁：身份要具体，不要只有"女孩/男人/学生"。
2. 主角想要什么：必须是可行动目标，不是抽象愿望。
3. 为什么现在必须行动：加入时间压力、关系压力或秘密暴露压力。
4. 阻力是什么：外部阻力 + 内部误信念各一个。
5. 失败代价是什么：具体可感知，不能只写"会很痛苦"。
6. 回声物件是什么：一个能贯穿开头和结尾的物件/动作/台词。
7. 结尾余韵是什么：不直接讲道理，而是让前文细节变意义。

输出 JSON：
{
  "premise": "一段 120-220 字的补强版故事核心，必须忠于用户原始核心一句话，只能补充主角、欲望、阻力、代价、反转/余韵方向，不能换题",
  "styleConstraint": "适合直接放入系统风格约束栏的写作要求，80-160 字",
  "editorNote": "给作者看的 1-2 句编辑提示，指出这篇最该写好的地方"
}`,
    params.onChunk,
    2200
  );

  try {
    const parsed = parseJsonFromAI<Partial<{ premise: string; styleConstraint: string; editorNote: string }>>(raw);
    return {
      premise: String(parsed.premise || story.premise || '').trim(),
      styleConstraint: String(parsed.styleConstraint || story.styleConstraint || '').trim(),
      editorNote: String(parsed.editorNote || '').trim(),
    };
  } catch {
    throw new Error('故事内核深化返回格式异常，请重试');
  }
}

// 按目标字数推算应拆几个场景（每段约 1500-1800 字），并给默认场景标签
export function autoSceneLabels(targetWords: number): string[] {
  const n = Math.max(3, Math.min(8, Math.round(targetWords / 1600)));
  const base = ['开场钩子', '建立困境', '冲突升级', '关键转折', '高潮对决', '收束回声'];
  if (n <= 6) return base.slice(0, n);
  // 更长则在中段加推进节点
  const extra = ['再起波澜', '代价显现'];
  return [...base.slice(0, 4), ...extra.slice(0, n - 6), ...base.slice(4)];
}

// ─── 生成故事标题 ────────────────────────────────────────────────────────────

export async function generateStoryTitle(params: {
  story: ShortStory;
  content: string;
}): Promise<string> {
  const { story, content } = params;
  const excerpt = content.replace(/<[^>]*>/g, '').slice(0, 1200);
  const raw = await streamChat(
    '你是专业的中文故事命名师。直接输出一个标题，不超过15字，不加任何标点、引号、书名号、序号或解释。标题要具体、有悬念、有情绪，不要泛泛而谈。',
    `平台：${story.platform}　类型：${story.genre}
故事核心：${story.premise || '无'}
正文/骨架节选：${excerpt}

现在输出标题：`,
    undefined, 180
  );
  return raw.trim().replace(/^[《「"'【\s]+|[》」"'】\s]+$/g, '').trim();
}

