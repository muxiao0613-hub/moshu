import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`;
  }
  return `${count}字`;
}

/**
 * 错误的形状不确定（axios 错误 / OpenAI SDK APIError / 原生 throw 的字符串都可能），
 * 所以这里先把 unknown 收窄成「可能带这些字段的对象」，再逐字段判类型。
 */
interface ErrorLike {
  message?: unknown;
  status?: unknown;
  response?: { status?: unknown; data?: { message?: unknown } };
}

/** 把一个 unknown 错误收窄成可安全取字段的形状（非对象时返回空对象）。 */
function asErrorLike(err: unknown): ErrorLike {
  return typeof err === 'object' && err !== null ? (err as ErrorLike) : {};
}

function readMessage(err: unknown): string {
  const { message } = asErrorLike(err);
  return typeof message === 'string' ? message : '';
}

function readStatus(err: unknown): number | undefined {
  const { status } = asErrorLike(err);
  return typeof status === 'number' ? status : undefined;
}

/** 将 AI 服务（OpenAI SDK）错误转成对用户友好的中文提示。 */
export function getAIErrorMessage(err: unknown, fallback = '操作失败，请重试'): string {
  const msg = readMessage(err);

  // aiService.ts 自己抛的用户友好消息，直接透传
  if (
    msg.startsWith('请先点击') ||
    msg.startsWith('响应中未找到') ||
    msg.startsWith('JSON 格式不完整')
  ) return msg;

  // OpenAI SDK APIError 有 .status 属性
  const status = readStatus(err);

  if (status === 401 || /401|Unauthorized|Authentication|invalid.?api.?key/i.test(msg)) {
    return 'API Key 无效或已过期，请在「设置」中重新填写';
  }
  if (status === 402 || /402|insufficient.?balance|quota.?exceeded|out.?of.?credit|余额不足/i.test(msg)) {
    return '账户余额不足：托管模式请充值平台余额，自带 Key 模式请检查服务商账户余额';
  }
  if (status === 429 || /429|rate.?limit|too.?many.?request/i.test(msg)) {
    return '请求频率超限，请稍等几秒后再试';
  }
  if ((status && status >= 500) || /5\d\d|internal.?server/i.test(msg)) {
    return 'AI 服务异常，请稍后重试';
  }
  if (/network|Failed to fetch|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return '网络连接失败，请检查网络或 Base URL 是否正确';
  }

  return msg || fallback;
}

/** 将 axios 错误转成对用户友好的中文提示，避免把服务器 5xx 误报为"密码错误"。 */
export function getHttpErrorMessage(
  err: unknown,
  fallbacks: { auth?: string; server?: string; network?: string; default?: string } = {},
): string {
  const { response } = asErrorLike(err);
  const status = typeof response?.status === 'number' ? response.status : undefined;
  // 优先使用后端返回的 message，但 5xx 时不信任（服务器可能返回堆栈等无意义内容）
  const rawServerMsg = status && status < 500 ? response?.data?.message : undefined;
  const serverMsg = typeof rawServerMsg === 'string' ? rawServerMsg : undefined;
  if (serverMsg) return serverMsg;

  if (!status) return fallbacks.network ?? '网络连接失败，请检查网络后重试';
  if (status >= 500) return fallbacks.server ?? '服务器异常，请稍后重试';
  return fallbacks.auth ?? fallbacks.default ?? '操作失败，请稍后重试';
}
