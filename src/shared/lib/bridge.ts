import { invoke, isTauri } from '@tauri-apps/api/core';
import type { AppError, Commands } from '../../contracts';

export function asAppError(value: unknown): AppError {
  if (typeof value === 'object' && value !== null && 'code' in value && 'message' in value
    && 'retryable' in value && 'requestId' in value && typeof value.message === 'string') {
    return value as AppError;
  }
  return { code: 'IO_ERROR', message: '操作未完成，请重试。', retryable: true, requestId: crypto.randomUUID() };
}
export async function command<K extends keyof Commands>(name: K, input: Commands[K]['input']): Promise<Commands[K]['output']> {
  if (!isTauri()) {
    throw { code: 'IO_ERROR', message: '请通过桌面应用使用本地数据。浏览器预览没有数据库连接。',
      retryable: false, requestId: crypto.randomUUID() } satisfies AppError;
  }
  const requestId = crypto.randomUUID();
  try { return await invoke<Commands[K]['output']>(name, { input: { ...input, requestId } }); }
  catch (error) { throw asAppError(error); }
}
