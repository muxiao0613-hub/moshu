/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
// 墨枢适配，2026-10-15：保留原语义 API，所有持久化交由 Rust/SQLite。
import axios, {AxiosError} from 'axios';
import {host, type HostError} from '../host/bridge';
const revisions = new Map<string,number>();
function remember(value: unknown) {
 if(!value || typeof value !== 'object') return;
 if(Array.isArray(value)) {value.forEach(remember);return;}
 const v = value as Record<string,unknown>;
 if(typeof v.id === 'string' && typeof v.revision === 'number') revisions.set(v.id,v.revision);
 for(const child of Object.values(v)) if(child && typeof child === 'object') remember(child);
}
export const apiClient = axios.create({adapter: async config => {
 const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
 const path = config.url ?? '';
 const id = data?.id ?? path.split('/').at(-1);
 try {
  const result = await host('api', {method:(config.method ?? 'GET').toUpperCase(),path,data:data ?? null,params:config.params ?? {},baseRevision:revisions.get(id) ?? null});
  remember(result);
  return {data:result,status:200,statusText:'OK',headers:{},config};
 } catch(error) {
  const e = error as HostError;
  const remote = e.details?.remote;
  remember(remote);
  const payload = {message:e.message,code:remote ? 'DRAFT_CONFLICT' : e.code,remote};
  throw new AxiosError(e.message,e.code,config,undefined,{data:payload,status:remote ? 409 : e.code === 'NOT_FOUND' ? 404 : 400,statusText:'',headers:{},config});
 }
}});
export function unwrap<T>(res: {data: unknown}): T {
 const d = res.data;
 return (d && typeof d === 'object' && 'data' in d ? d.data : d) as T;
}
