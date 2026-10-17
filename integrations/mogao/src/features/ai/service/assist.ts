/**
 * AI 服务 · 辅助能力：全局一致性检查、任意字段润色、多轮对话、素材扩充
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：transport（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { estimateTokens, recordUsage } from '@/api/tokenTracker';
import { getClient, getSettings, extractUsage, streamChat } from './transport';

export { globalConsistencyCheck } from './consistency';

// ---------- 文字润色（适用于任何字段）----------

export async function polishText(params: {
  text: string;
  fieldLabel: string;
  instruction?: string;
  projectTitle?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { text, fieldLabel, instruction, projectTitle, onChunk } = params;
  if (!text.trim()) return text;

  return streamChat(
    `你是专业的文学编辑${projectTitle ? `，正在润色小说《${projectTitle}》的相关内容` : ''}。直接输出润色后的文字，不加任何前缀说明。`,
    `请对以下「${fieldLabel}」进行润色：

【原文】
${text}

要求：${instruction || '优化语言表达，使文字更加生动准确、富有感染力，保持原有意思和风格不变'}

直接输出润色后的文字。`,
    onChunk,
    Math.max(estimateTokens(text) * 3 + 200, 512)
  );
}

// ---------- AI 对话（多轮） ----------

export async function chatWithAI(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk?: (c: string) => void
): Promise<string> {
  const client = getClient();
  const { model } = getSettings();
  let full = '';
  let gotUsage = false;

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 2048,
    stream: true,
    stream_options: { include_usage: true },
    messages: [
      {
        role: 'system',
        content: '你是一个友善的创作助手，擅长帮助小说作者讨论书名、故事构思、人物设定、情节发展等创作话题。回答简洁有见地，引导作者深入思考。',
      },
      ...messages,
    ],
  });

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) { full += delta; onChunk?.(delta); }
    const usage = extractUsage(chunk);
    if (usage) {
      recordUsage(usage.prompt, usage.completion, model);
      gotUsage = true;
    }
  }

  if (!gotUsage) {
    recordUsage(
      estimateTokens(messages.map(m => m.content).join('')),
      estimateTokens(full),
      model
    );
  }

  return full;
}

// ---------- 素材库 AI 扩充 ----------

export async function expandMaterial(params: {
  title: string;
  rawContent: string;
  category: string;
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<string> {
  const { title, rawContent, category, instruction, onChunk } = params;
  return streamChat(
    '你是专业的小说素材编辑。将作者的粗略灵感扩充为完整、可直接使用的小说素材。直接输出正文，不加任何前缀。',
    `将以下「${category}」类素材扩充完善：

标题：${title}
【原始灵感】\n${rawContent}
${instruction ? `扩充方向：${instruction}\n` : ''}要求：保留原始灵感核心，补充细节与延伸方向，500字以内，语言生动。`,
    onChunk, 1500
  );
}
