import {useEffect,useRef,useState} from 'react';
import {PetDragController} from './drag';
import {command,asAppError} from '../../shared/lib/bridge';
import {FoxGirl} from './FoxGirl';
import './pet.css';

export function PetWindow() {
  const [menu,setMenu]=useState(false);const [sleeping,setSleeping]=useState(false);const [happy,setHappy]=useState(false);
  const [message,setMessage]=useState('今天也一起慢慢来。');const [busy,setBusy]=useState(false);
  const drag=useRef<PetDragController|null>(null);if(!drag.current)drag.current=new PetDragController(error=>setMessage(asAppError(error).message));
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{drag.current?.finish();if(timer.current)clearTimeout(timer.current);},[]);
  function pet(){setSleeping(false);setHappy(true);setMessage('嘿嘿，收到你的摸摸啦！');if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>{setHappy(false);setMessage('我在这里陪你。');},2600);}
  async function action(kind:'openWorkspace'|'hide'){if(busy)return;setBusy(true);try{await command('pet_action',{action:kind});setMenu(false);}catch(e){setMessage(asAppError(e).message);}finally{setBusy(false);}}
  return <main className={`pet-window ${sleeping?'is-sleeping':''}`} onContextMenu={e=>{e.preventDefault();setMenu(v=>!v);}}>
    <p className="pet-speech" role="status">{sleeping?'休息一下，灵感慢慢来。':message}</p>
    <button className="pet-character" aria-label="摸摸小狐狸，拖动可移动" onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current?.start({x:e.screenX,y:e.screenY});}} onPointerMove={e=>drag.current?.move({x:e.screenX,y:e.screenY})} onPointerUp={e=>{drag.current?.finish();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>drag.current?.finish()} onLostPointerCapture={()=>drag.current?.finish()} onClick={e=>{if(e.detail===0||!drag.current?.dragged)pet();}}><FoxGirl sleeping={sleeping} happy={happy}/></button>
    <div className="pet-controls"><button aria-label="桌宠菜单" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}>···</button><span>小狐狸</span><button aria-label="收起桌宠" disabled={busy} onClick={()=>{void action('hide');}}>×</button></div>
    {menu&&<nav className="pet-menu" aria-label="桌宠操作"><button disabled={busy} onClick={()=>{void action('openWorkspace');}}>返回墨枢</button><button onClick={()=>{setSleeping(v=>!v);setHappy(false);setMenu(false);}}>{sleeping?'醒来啦':'休息一下'}</button><button disabled={busy} onClick={()=>{void action('hide');}}>收起桌宠</button></nav>}
  </main>;
}
