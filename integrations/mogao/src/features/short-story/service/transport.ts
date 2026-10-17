/**
 * 短篇生成 · 模型传输层：流式对话、token 用量记录、长度截断后的自动续写补全
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./text（正文清洗与成篇判断）+ @/api/tokenTracker + @/features/ai/aiService；不含业务语义。
 */
import { estimateTokens, recordUsage } from '@/api/tokenTracker';
import { getClient, getSettings } from '@/features/ai/aiService';
import { cleanStoryText, looksLikeCompleteStory } from './text';

export async function streamChat(
  system: string,
  user: string,
  onChunk?: (c: string) => void,
  maxTokens = 4096
): Promise<string> {
  return (await streamChatEx(system, user, onChunk, maxTokens)).text;
}

// 同 streamChat，但额外返回 finish_reason（用于判断是否因长度被截断）
export async function streamChatEx(
  system: string,
  user: string,
  onChunk?: (c: string) => void,
  maxTokens = 4096
): Promise<{ text: string; finishReason: string | null }> {
  const client = getClient();
  const { model, mode } = getSettings();
  let full = '';
  let gotUsage = false;
  let finishReason: string | null = null;
  const stream = await client.chat.completions.create({
    model,
    max_tokens: mode === 'managed' ? Math.min(maxTokens, 16000) : maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    temperature: maxTokens <= 300 ? 0.65 : 0.86,
    top_p: 0.92,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) { full += delta; onChunk?.(delta); }
    if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
    const usage = (chunk as unknown as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
    if (usage) { recordUsage(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0, model); gotUsage = true; }
  }
  if (!gotUsage) recordUsage(estimateTokens(system + user), estimateTokens(full), model);
  return { text: full, finishReason };
}

// 续写补全：当输出因长度截断/结尾不完整时，让 AI 接着把结尾写完
export async function continueUntilComplete(
  system: string,
  current: string,
  onChunk?: (c: string) => void,
  maxRounds = 6,
): Promise<string> {
  let text = current;
  for (let i = 0; i < maxRounds; i++) {
    if (looksLikeCompleteStory(text)) break;
    const tail = text.slice(-1800);
    const { text: more, finishReason } = await streamChatEx(
      system,
      `下面是一篇短篇小说**已写好的部分**，但结尾被截断了。请**直接接着最后一句往下写**，把故事自然写完并收束结尾。\n` +
      `要求：不要重复已有内容、不要加标题或任何说明、不要从头复述，只输出**续写的后续文字**。\n\n` +
      `━━━ 已有结尾（接着往下写）━━━\n${tail}`,
      onChunk,
      8000,
    );
    const add = cleanStoryText(more);
    if (!add) break;
    // 衔接：去掉续写开头可能与已有结尾重复的部分
    text = (text + (text.endsWith('\n') ? '' : '\n') + add).trim();
    if (finishReason !== 'length') break; // 这一轮没被截断，说明写完了
  }
  return text;
}
