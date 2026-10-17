/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {host} from './bridge';
import {flushAllDrafts} from '../shared/lib/draftFlush';
import {flushStorage} from './storage';
export async function saveAs(data: Blob | string, filename = '墨稿导出.txt'): Promise<void> {
 if(typeof data === 'string') throw new Error('不支持外部下载地址。');
 await flushAllDrafts(); await flushStorage();
 let safe=filename.replace(/[\\/\0]/g,'_');
 const dot=safe.lastIndexOf('.'),ext=dot>=0?safe.slice(dot):'.txt';let stem=dot>=0?safe.slice(0,dot):safe;
 while(new TextEncoder().encode(stem+ext).length>220)stem=stem.slice(0,-1);
 safe=(stem||'墨稿导出')+ext;
 await host('export', {filename:safe, bytes:Array.from(new Uint8Array(await data.arrayBuffer()))});
}
export default saveAs;
