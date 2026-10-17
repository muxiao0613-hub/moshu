import {Suspense,useEffect,useState} from 'react';
import type {Ref} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {getCurrentWindow} from '@tauri-apps/api/window';
import type {SearchHit} from '../contracts';
import type {EditorHandle} from './NoteEditor';
import {builtInModulePages} from '../modules/registry';
import type {BuiltInModulePage} from '../modules/registry';
import {command,asAppError} from '../shared/lib/bridge';
import {ErrorMessage} from '../shared/ui/ErrorMessage';
export function ModuleWorkspace({id,editorRef,onBack,onLibrary,onExpandedChange,target,pages=builtInModulePages}:{id:string;editorRef:Ref<EditorHandle|null>;onBack:()=>void;onLibrary?:()=>void;onExpandedChange?:(expanded:boolean)=>void;target?:SearchHit|null;pages?:readonly BuiltInModulePage[]}) {
 const [ready,setReady]=useState(false);const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);const [attempt,setAttempt]=useState(0);
 const [fullscreen,setFullscreen]=useState(false);const [changing,setChanging]=useState(false);
 useEffect(()=>{let active=true;setReady(false);void command('module_access',{id}).then(()=>{if(active)setReady(true);}).catch(e=>{if(active)setError(asAppError(e));});return()=>{active=false;};},[id,attempt]);
 useEffect(()=>{if(!isTauri())return;let active=true;let stop:(()=>void)|undefined;const win=getCurrentWindow();const sync=()=>{void win.isFullscreen().then(value=>{if(active){setFullscreen(value);onExpandedChange?.(value);}}).catch(e=>{if(active)setError(asAppError(e));});};sync();void win.onResized(sync).then(unlisten=>{if(active)stop=unlisten;else unlisten();}).catch(e=>{if(active)setError(asAppError(e));});return()=>{active=false;stop?.();};},[onExpandedChange]);
 async function toggleFullscreen(){if(changing)return;setChanging(true);try{const win=getCurrentWindow();const next=!await win.isFullscreen();await win.setFullscreen(next);const actual=await win.isFullscreen();setFullscreen(actual);onExpandedChange?.(actual);}catch(e){setError(asAppError(e));}finally{setChanging(false);}}
 const page=pages.find(p=>p.id===id);
 return <section className="module-workspace">
  <nav className="module-toolbar" aria-label="模块导航">{onLibrary&&<button onClick={onLibrary}>返回资料库</button>}<button onClick={onBack}>返回模块中心</button><button className="module-fullscreen" disabled={!isTauri()||changing} onClick={()=>{void toggleFullscreen();}}>{fullscreen?'退出全屏':'全屏'}</button></nav>
  <ErrorMessage error={error} retry={()=>{setError(null);setAttempt(v=>v+1);}}/>
  <div className="module-stage">{!page?<p>此模块页面未随当前构建交付，请返回模块中心。</p>:ready?<Suspense fallback={<p role="status">正在载入创作工具…</p>}><page.Component editorRef={editorRef} target={target}/></Suspense>:!error?<p role="status">正在打开模块…</p>:null}</div>
 </section>;
}
