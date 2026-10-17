/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * AI 服务 · AI 传输层：设置读取、客户端构造、streamChat（token 追踪 / 中断 / 重试 / JSON 模式）与错误类型
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：（无：最底层）（只允许上层业务模块 → 底层模块，不产生环）。
 */
import type OpenAI from 'openai';
import {currentConfig,nativeClient,saveConfig} from '@/host/ai';
import { estimateTokens, recordUsage } from '@/api/tokenTracker';
import { getRecentContent, trunc } from '@/shared/lib/text';

// ---------- 设置 ----------

export function getSettings() {
  return {
    apiKey: '',
    baseURL: currentConfig().baseURL,
    model: currentConfig().model,
    mode: 'byok' as 'byok' | 'managed',
    defaultWordCount: parseInt(localStorage.getItem('mogao_word_count') || localStorage.getItem('mogao_word_count_default') || '3000'),
  };
}

export function getClient() {
 if(!currentConfig().configured)throw new Error('请先在墨稿设置中配置 AI 连接。');
 return nativeClient();
}
export async function testAIConnection(opts: {apiKey:string;baseURL:string;model:string}):Promise<void> {
 if(opts.apiKey)await saveConfig({...currentConfig(),...opts,persistent:false});
 await nativeClient().chat.completions.create({model:opts.model,max_tokens:1,messages:[{role:'user',content:'ping'}]});
}

// ---------- 工具函数 ----------
// `getRecentContent` / `trunc` / `matchRelevant*` 已上移到 @/shared/lib/text，
// 供上下文编译器（features/context/contextPlan.ts）与这里共用同一份实现。

// ---------- 核心 streamChat（含 token 追踪 / 中断 / 重试 / JSON 模式）----------

/** 用户主动中断时抛出，UI 可据此区分"取消"与"真正的错误" */
export class AIAbortError extends Error {
  constructor(public partial = '') { super('已停止生成'); this.name = 'AIAbortError'; }
}

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  const name = (err as { name?: string })?.name;
  return name === 'AbortError' || name === 'APIUserAbortError' || err instanceof AIAbortError;
}

/** 网络抖动 / 限流 / 服务端 5xx 等可重试的瞬时错误 */
function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true;
  const msg = ((err as { message?: string })?.message || '').toLowerCase();
  return /network|failed to fetch|econnreset|etimedout|timeout|socket hang up/.test(msg);
}

/** 服务商不支持 response_format / stream_options 等扩展参数（多为 400），用于降级重试 */
function isUnsupportedParamError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = ((err as { message?: string })?.message || '').toLowerCase();
  return status === 400 && /response_format|stream_options|unsupported|not support|invalid.*param|json/.test(msg);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** 流式 chunk 里可能带的用量字段（仅在 stream_options.include_usage 打开时出现在末个 chunk） */
interface UsageChunk {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * 从流式 chunk 里取用量。末个 chunk 只带 usage、choices 为空，且各服务商字段可能缺失，
 * 因此这里做一次运行时判断，而不是 `(chunk as any).usage`（丢了类型后拼写错误也不会报错）。
 */
export function extractUsage(chunk: unknown): { prompt: number; completion: number } | null {
  if (typeof chunk !== 'object' || chunk === null) return null;
  const usage = (chunk as UsageChunk).usage;
  if (!usage) return null;
  return { prompt: usage.prompt_tokens ?? 0, completion: usage.completion_tokens ?? 0 };
}

export interface StreamOpts {
  signal?: AbortSignal;
  /** 期望返回 JSON 时开启，启用 response_format 提升解析成功率；不支持的服务商会自动降级 */
  jsonMode?: boolean;
  /** 采样温度；不传则用模型默认。正文宜高(0.85-0.95)，结构/质检宜低(0.2-0.4) */
  temperature?: number;
}

export async function streamChat(
  system: string,
  user: string,
  onChunk?: (c: string) => void,
  maxTokens = 4096,
  opts: StreamOpts = {}
): Promise<string> {
  const { signal, jsonMode, temperature } = opts;
  const client = getClient();
  const { model } = getSettings();
  const managed = getSettings().mode === 'managed';
  const requestId = crypto.randomUUID();

  // 显式声明为「流式请求参数」，这样 create() 会命中流式重载、直接拿到 AsyncIterable，
  // 不再需要把参数和返回值都断言成 any（断言会同时丢掉 stream 的类型检查）
  const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model,
    max_tokens: managed ? Math.min(maxTokens, 16000) : maxTokens,
    ...(temperature != null ? { temperature } : {}),
    stream: true,
    // 显式请求用量统计：OpenAI 兼容接口需此项才会在末个 chunk 返回真实 usage
    stream_options: { include_usage: true },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (jsonMode) params.response_format = { type: 'json_object' };

  let full = '';
  let gotUsage = false;
  let emitted = false;
  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; ; attempt++) {
    try {
      const stream = await client.chat.completions.create(params, { signal, ...(managed ? { headers: { 'Idempotency-Key': requestId } } : {}) });
      for await (const chunk of stream) {
        // 末个仅含 usage 的 chunk 其 choices 可能为空，需防御性访问
        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; emitted = true; onChunk?.(delta); }
        const usage = extractUsage(chunk);
        if (usage) {
          recordUsage(usage.prompt, usage.completion, model);
          gotUsage = true;
        }
      }
      break; // 成功
    } catch (err) {
      // 用户主动停止：已产出的部分照常记账并随 AIAbortError 上抛供 UI 静默处理
      if (isAbort(err, signal)) {
        if (!gotUsage && emitted) recordUsage(estimateTokens(system + user), estimateTokens(full), model);
        throw new AIAbortError(full);
      }
      // 服务商不支持扩展参数 → 去掉 response_format / stream_options 再试（最多降级一次）
      if (!managed && (params.response_format || params.stream_options) && isUnsupportedParamError(err)) {
        delete params.response_format;
        delete params.stream_options; // 失去精确用量，回退到字符估算，但保证可用
        continue;
      }
      // 已经流式输出了部分内容，无法安全续传，直接上抛
      if (emitted) throw err;
      // 瞬时错误且仍有重试机会：指数退避
      if (!managed && attempt < MAX_ATTEMPTS && isRetryable(err)) {
        await sleep(400 * 2 ** (attempt - 1) + Math.random() * 200);
        continue;
      }
      throw err;
    }
  }

  // 服务商不支持 include_usage 时，用字符数估算（粗略但不为 0）
  if (!gotUsage) {
    recordUsage(estimateTokens(system + user), estimateTokens(full), model);
  }

  return full;
}
