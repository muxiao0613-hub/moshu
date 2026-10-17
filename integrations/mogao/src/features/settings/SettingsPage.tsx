/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {License} from '@/host/License';
import {AIHistory} from '@/host/AIHistory';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {currentConfig,saveConfig,nativeClient} from '@/host/ai';
import {useTheme} from '@/shared/contexts/ThemeContext';
import {StyleSampleSection} from './StyleSampleSection';
import {toast} from '@/shared/ui/toast';
export function SettingsPage(){
 const [config,setConfig]=useState(currentConfig);const [apiKey,setKey]=useState('');const [busy,setBusy]=useState(false);
 const [wordCount,setWords]=useState(localStorage.getItem('mogao_word_count') ?? '3000');const {isDark,toggleTheme}=useTheme();
 const save=async(clear=false)=>{setBusy(true);try{const saved=await saveConfig({...config,apiKey,clear});setConfig(saved);setKey('');toast.success(clear?'密钥已清除':'连接设置已保存');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const test=async()=>{setBusy(true);try{await nativeClient().chat.completions.create({model:config.model,max_tokens:1,messages:[{role:'user',content:'ping'}]});toast.success('连接正常');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}};
 const cls='block w-full border rounded-md px-3 py-2 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700';
 return <div className="h-full overflow-y-auto bg-zinc-50 dark:bg-zinc-900 p-6"><div className="max-w-2xl mx-auto space-y-5 text-sm">
  <Link to="/" className="text-ink-600">← 返回书架</Link><h1 className="text-lg font-semibold">本地写作设置</h1>
  <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-3"><h2 className="font-semibold">AI 连接</h2><p className="text-zinc-500">{config.configured?'密钥已配置':'尚未配置密钥'}。请求由墨枢核心发送；使用你的 OpenAI 兼容接口。</p>
   <label className="block">接口地址<input className={cls} value={config.baseURL} onChange={e=>setConfig({...config,baseURL:e.target.value})}/></label>
   <label className="block">模型名称<input className={cls} value={config.model} onChange={e=>setConfig({...config,model:e.target.value})}/></label>
   <label className="block">API Key<input type="password" autoComplete="off" className={cls} value={apiKey} onChange={e=>setKey(e.target.value)} placeholder="留空保留已有密钥"/></label>
   <label className="flex gap-2"><input type="checkbox" checked={config.persistent} onChange={e=>setConfig({...config,persistent:e.target.checked})}/>保存在系统凭据中（不勾选则仅本次会话）</label>
   <div className="flex gap-3"><button disabled={busy} className="px-3 py-2 border rounded" onClick={()=>void save()}>保存连接</button><button disabled={busy || !config.configured} className="px-3 py-2 border rounded" onClick={()=>void test()}>测试连接（会调用模型）</button><button disabled={busy} className="px-3 py-2 border rounded" onClick={()=>void save(true)}>清除密钥</button></div>
  </section>
  <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-3"><h2 className="font-semibold">写作默认</h2><label>续写字数<input type="number" min="500" max="20000" className={cls} value={wordCount} onChange={e=>setWords(e.target.value)}/></label><button className="px-3 py-2 border rounded" onClick={()=>{localStorage.setItem('mogao_word_count',String(Math.min(20000,Math.max(500,Number(wordCount)||3000))));toast.success('默认字数已保存');}}>保存默认字数</button><button className="px-3 py-2 border rounded ml-3" onClick={toggleTheme}>{isDark?'切换浅色':'切换深色'}</button></section>
  <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-3"><h2 className="font-semibold">风格样本</h2><StyleSampleSection/></section>
  <section className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5"><AIHistory/></section>
  <License/>
 </div></div>;
}
