import {useEffect,useState} from 'react';
import type {ModuleInfo} from '../contracts';
import {command,asAppError} from '../shared/lib/bridge';
import {ErrorMessage} from '../shared/ui/ErrorMessage';
export function ModuleEntries({onOpen,activeId,disabled=false,refreshKey='',navigation=false,onManage}:{onOpen:(id:string)=>Promise<void>;activeId?:string|null;disabled?:boolean;refreshKey?:string;navigation?:boolean;onManage?:()=>void}) {
 const [items,setItems]=useState<ModuleInfo[]>([]);const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);
 useEffect(()=>{let active=true;void command('list_modules',{}).then(rows=>{if(active)setItems(Array.isArray(rows)?rows:[]);}).catch(e=>{if(active)setError(asAppError(e));});return()=>{active=false;};},[refreshKey]);
 const visible=items.filter(m=>!navigation||m.enabled);
 return <><ErrorMessage error={error}/>{visible.map(m=><button key={m.id} className={activeId===m.id?'selected':''} aria-current={activeId===m.id?'page':undefined} disabled={disabled} onClick={()=>{if(!m.enabled){onManage?.();return;}void onOpen(m.id).catch(e=>setError(asAppError(e)));}}>{m.name}{!navigation&&!m.enabled?' · 前往启用':''}</button>)}{!navigation&&!items.length&&<p className="muted">基础平台独立可用。当前尚无已交付业务模块，可在模块中心查看。</p>}</>;
}
