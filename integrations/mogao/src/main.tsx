/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';
import App from './App';
import {loadConfig} from './host/ai';
import {installStorage,flushStorage} from './host/storage';
import {registerHostFlush} from './host/bridge';
import {flushAllDrafts} from './shared/lib/draftFlush';
import {toast} from './shared/ui/toast';
async function flushWorkspace() {
 if(document.querySelector('[data-mogao-dirty="true"]'))throw new Error('表单仍有修改，请先保存或关闭表单。');
 await flushAllDrafts();await flushStorage();
}
registerHostFlush(flushWorkspace);
window.addEventListener('input',event=>{
 const target=event.target as Element|null;
 const dialog=target?.closest('[role="dialog"], [data-mogao-form]');
 if(dialog)dialog.setAttribute('data-mogao-dirty','true');
},true);
window.addEventListener('keydown',event=>{
 if((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='s') {
  event.preventDefault();
  if(event.isComposing)return;
  void flushWorkspace().then(()=>toast.success('已保存到本地')).catch(e=>toast.error(e.message));
 }
},true);
window.addEventListener('moshub-storage-error',() => toast.error('本地恢复稿写入失败，请保留当前页面并重试保存。'));
window.addEventListener('moshub-export-error',e => toast.error((e as CustomEvent<string>).detail));
Promise.all([installStorage(),loadConfig()]).then(() => {if(!location.hash && localStorage.getItem('mogao_studio_location'))location.hash=localStorage.getItem('mogao_studio_location')!;return createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);})
 .catch(() => {document.getElementById('root')!.textContent='墨稿本地数据读取失败，请返回墨枢后重试。';});
