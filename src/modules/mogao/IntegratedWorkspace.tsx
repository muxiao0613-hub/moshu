import {useEffect,useImperativeHandle,useRef,useState} from 'react';
import type {Ref} from 'react';
import {Channel,invoke,isTauri} from '@tauri-apps/api/core';
import type {SearchHit} from '../../contracts';
import type {EditorHandle} from '../../platform/NoteEditor';
import {MogaoWorkspace} from './MogaoWorkspace';

const CHANNEL='moshub-mogao';
export function IntegratedWorkspace({editorRef,target}:{editorRef:Ref<EditorHandle|null>;target?:SearchHit|null}) {
 const [legacy,setLegacy]=useState(!!target && !target.kind.startsWith('mogao-studio-'));
 const [session]=useState(()=>crypto.randomUUID());
 const tabs:Record<string,string>={'mogao-studio-characters':'characters','mogao-studio-world-settings':'world','mogao-studio-outlines':'outline','mogao-studio-plot-threads':'threads','mogao-studio-timeline-events':'threads'};
 const route=target?.kind.startsWith('mogao-studio-') ? (target.kind==='mogao-studio-short-stories'?`/short/${target.id}`:target.kind==='mogao-studio-materials'?'/materials':`/work/${target.workId ?? target.id}${target.kind==='mogao-studio-chapters'?`/chapter/${target.id}`:target.kind==='mogao-studio-projects'?'': `/refine/${tabs[target.kind] ?? 'characters'}`}`):'';
 const frame=useRef<HTMLIFrameElement>(null);
 const inner=useRef<EditorHandle|null>(null);
 const flushers=useRef(new Map<string,(ok:boolean)=>void>());
 const active=useRef(new Map<string,Promise<unknown>>());
 const [error,setError]=useState('');
 useEffect(()=>{
  const receive=async (event:MessageEvent) => {
   const child=frame.current?.contentWindow;
   if(!child || event.source!==child || event.origin!==location.origin || event.data?.channel!==CHANNEL || event.data.token!==session) return;
   const {id,op,input}=event.data as {id:string;op:string;input:Record<string,unknown>};
   if(op==='flushed') {flushers.current.get(id)?.(event.data.ok===true);flushers.current.delete(id);return;}
   const reply=(result?:unknown,error?:unknown)=>{if(frame.current?.contentWindow===child) child.postMessage({channel:CHANNEL,token:session,id,result,error},location.origin);};
   try {
    if(!isTauri()) throw new Error('请从桌面应用使用本地创作数据。');
    const requestId=crypto.randomUUID();
    let result:unknown;
    switch(op) {
     case 'api':result=await invoke('mogao_studio_request',{input:{...input,requestId}});break;
     case 'export':result=await invoke('mogao_studio_export',{input});break;
     case 'ai-settings':result=await invoke('mogao_studio_ai_settings',{input});break;
     case 'ai': {
      const chunks=new Channel<unknown>();
      chunks.onmessage=value=>child.postMessage({channel:CHANNEL,token:session,id,chunk:value},location.origin);
      const task=invoke('mogao_studio_ai',{input:{payload:input.payload,requestId:id},onChunk:chunks});
      active.current.set(id,task);try{result=await task;}finally{active.current.delete(id);}break;
     }
     case 'ai-cancel':result=await invoke('mogao_studio_ai_cancel',{input});break;
     default:throw new Error('不支持的墨稿操作。');
    }
    reply(result);
   } catch(e) {const value=e as {message?:string;code?:string;details?:unknown};reply(undefined,{message:value.message ?? '墨稿操作失败，请重试。',code:value.code,details:value.details});}
  };
  window.addEventListener('message',receive);
  return()=>{window.removeEventListener('message',receive);for(const resolve of flushers.current.values())resolve(false);flushers.current.clear();};
 },[session]);
 const flush=async ():Promise<boolean>=>{
  if(legacy)return await inner.current?.flush() ?? true;
  for(const id of active.current.keys()) await invoke('mogao_studio_ai_cancel',{input:{id}});
  await Promise.allSettled([...active.current.values()]);
  const child=frame.current?.contentWindow;if(!child)return true;
  const id=crypto.randomUUID();
  const ok=await new Promise<boolean>(resolve=>{
   const timeout=window.setTimeout(()=>{flushers.current.delete(id);resolve(false);},20000);
   flushers.current.set(id,ok=>{clearTimeout(timeout);resolve(ok);});
   child.postMessage({channel:CHANNEL,token:session,id,op:'flush'},location.origin);
  });
  if(!ok)setError('墨稿仍有未保存内容或正在输入，请完成输入并保存后重试。');else setError('');return ok;
 };
 useImperativeHandle(editorRef,()=>({flush,checkpoint:flush}));
 const switchMode=async()=>{if(await flush())setLegacy(v=>!v);};
 return <div className="mogao-integrated">
  <div className="mogao-mode-bar"><strong>墨稿 · {legacy?'此前手动版':'写作台'}</strong><button onClick={()=>void switchMode()}>{legacy?'进入现有墨稿写作台':'打开此前手动版作品'}</button></div>
  {error&&<p role="alert">{error}</p>}
  {legacy?<MogaoWorkspace editorRef={inner} target={target}/>:<iframe ref={frame} title="墨稿写作台" src={`./mogao/index.html?session=${session}#${route}`} sandbox="allow-scripts allow-same-origin allow-modals"/>}
 </div>;
}
