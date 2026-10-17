/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 同一稿件的写入按调用顺序执行；前一个失败不能阻塞后续重试。依赖方向：纯 Promise 工具。 */
const PENDING = new Map<string, Promise<unknown>>();

export function serializeSave<T>(key: string, save: () => Promise<T>): Promise<T> {
  const previous = PENDING.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(save);
  PENDING.set(key, next);
  void next.finally(() => {
    if (PENDING.get(key) === next) PENDING.delete(key);
  }).catch(() => undefined);
  return next;
}

export async function flushSaveQueue():Promise<void>{while(PENDING.size)await Promise.all([...PENDING.values()]);}
