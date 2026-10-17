/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
// 原界面的同步偏好接口由 SQLite 快照提供，写入和恢复稿在离开前等待 Rust 回执。
import {host} from './bridge';
let tail = Promise.resolve();
const retry=new Map<string,string|null>();
export async function installStorage() {
 const initial = await host<Record<string,string>>('api', {method:'GET',path:'/local-state'});
 const values = new Map(Object.entries(initial));
 const enqueue = (key:string, value:string|null) => {
  if (/api_key|access_token|refresh_token/i.test(key)) throw new Error('密钥只能交由系统凭据存储。');
  tail = tail.then(async () => {try {await host('api', {method:'POST',path:'/local-state',data:{key,value}});retry.delete(key);}catch {retry.set(key,value);window.dispatchEvent(new CustomEvent('moshub-storage-error'));}});
 };
 const store: Storage = {
  get length(){ return values.size; }, key: n => [...values.keys()][n] ?? null,
  getItem: k => values.get(k) ?? null,
  setItem(k,v){enqueue(k,String(v));values.set(k,String(v));},
  removeItem(k){values.delete(k);enqueue(k,null);},
  clear(){for(const k of values.keys())enqueue(k,null);values.clear();},
 };
 Object.defineProperty(window,'localStorage',{value:store});
}
export async function flushStorage() {await tail;for(const [key,value] of [...retry]){await host('api',{method:'POST',path:'/local-state',data:{key,value}});if(retry.get(key)===value)retry.delete(key);}await tail;}
