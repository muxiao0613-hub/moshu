/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
// 墨枢适配，2026-10-15：只接受嵌入宿主的受控消息，不直接联网或调用磁盘。
export interface HostError {message: string; code?: string; details?: Record<string, unknown>}
const token = new URLSearchParams(location.search).get('session');
if (!token || window.parent === window) throw new Error('请从墨枢打开墨稿。');
const pending = new Map<string, {resolve: (v: unknown) => void; reject: (e: unknown) => void}>();
let flush: () => Promise<void> = async () => {};
export function registerHostFlush(callback: () => Promise<void>) { flush = callback; }
const chunks = new Map<string,(v: unknown)=>void>();
export function host<T>(op: string, input: unknown = {}, options: {id?:string;chunk?:(v:unknown)=>void} = {}): Promise<T> {
 const id = options.id ?? crypto.randomUUID();
 if(options.chunk)chunks.set(id,options.chunk);
 return new Promise((resolve, reject) => {
  pending.set(id, {resolve: v => resolve(v as T), reject});
  parent.postMessage({channel:'moshub-mogao', token, id, op, input}, location.origin);
 });
}
window.addEventListener('message', async event => {
 if(event.source !== parent || event.origin !== location.origin || event.data?.channel !== 'moshub-mogao' || event.data.token !== token) return;
 const msg = event.data;
 if(msg.op === 'flush') {
  try { await flush(); parent.postMessage({...msg, op:'flushed', ok:true}, location.origin); }
  catch { parent.postMessage({...msg, op:'flushed', ok:false}, location.origin); }
  return;
 }
 if ('chunk' in msg) {chunks.get(msg.id)?.(msg.chunk);return;}
 chunks.delete(msg.id);
 const entry = pending.get(msg.id); if(!entry) return; pending.delete(msg.id);
 if(msg.error) entry.reject(Object.assign(new Error(msg.error.message), msg.error)); else entry.resolve(msg.result);
});
