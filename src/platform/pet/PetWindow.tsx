import {useEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {listen} from '@tauri-apps/api/event';
import {isTauri} from '@tauri-apps/api/core';
import {PetDragController} from './drag';
import {command,asAppError} from '../../shared/lib/bridge';
import {PetSprite} from './PetSprite';
import {usePetMotion} from './usePetMotion';
import {useCompanionActions} from './useCompanionActions';
import {motionClip,motionPlans} from './motion';
import {motionDuration} from './timeline';
import './pet.css';

const IDLE_LINES=['今天也一起慢慢来。','写累了就看看窗外。','我在这里，不着急。','要不要喝口水再继续？','慢慢写，故事会等你。'];
const PET_LINES=['嘿嘿，收到你的摸摸啦！','再摸一下也可以。','毛毛要乱啦～'];
const READING_LINE='我看我的书，安静陪你写。';
type PetAction='openWorkspace'|'hide';

export function PetWindow() {
  const [menu,setMenu]=useState(false);const [isDragging,setIsDragging]=useState(false);
  const [message,setMessage]=useState(IDLE_LINES[0]!);const [busy,setBusy]=useState(false);
  const animate=usePetMotion();const companion=useCompanionActions(animate&&!menu&&!isDragging);
  const resting=useRef(companion.rest);resting.current=companion.rest;
  const character=useRef<HTMLButtonElement>(null);
  const drag=useRef<PetDragController|null>(null);
  if(!drag.current)drag.current=new PetDragController(error=>setMessage(asAppError(error).message));
  const speechTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const walking=useRef(0);const pointer=useRef<number|null>(null);
  const dragging=useRef(false);const temporary=useRef(false);const pets=useRef(0);const line=useRef(0);
  function clearSpeech(){if(speechTimer.current)clearTimeout(speechTimer.current);speechTimer.current=null;temporary.current=false;}
  function nextLine(){line.current=(line.current+1)%IDLE_LINES.length;return IDLE_LINES[line.current]!;}
  function restingLine(){return resting.current==='read'?READING_LINE:nextLine();}
  function say(text:string,ms=2600){
    clearSpeech();temporary.current=true;setMessage(text);
    speechTimer.current=setTimeout(()=>{temporary.current=false;setMessage(restingLine());},ms);
  }
  function stopWalking(){if(walking.current){cancelAnimationFrame(walking.current);walking.current=0;drag.current?.finish();}}
  function started(){
    const mood=companion.playback.mood;
    if(!animate||pointer.current!==null||!motionClip(mood)||(mood!=='walk-left'&&mood!=='walk-right'))return;
    stopWalking();const from=performance.now();const duration=motionDuration(motionPlans[mood]);
    const direction=mood==='walk-left'?-1:1;drag.current?.start({x:0,y:0});
    const step=(now:number)=>{
      const fraction=Math.min(1,(now-from)/duration);
      drag.current?.move({x:direction*54*fraction,y:0});
      if(fraction<1)walking.current=requestAnimationFrame(step);
      else{walking.current=0;drag.current?.finish();}
    };
    walking.current=requestAnimationFrame(step);
  }
  function settle(next:'stand'|'sit'|'read'|'sleep'){
    stopWalking();clearSpeech();companion.settle(next);setMenu(false);
    setMessage(next==='read'?READING_LINE:next==='sleep'?'休息一下，灵感慢慢来。':next==='sit'?'坐下来陪你一会儿。':'我醒啦，继续陪你。');
  }
  function greet(){setMenu(false);say('你好呀，我在这里！',3600);companion.react('waving');}
  function pet(){
    setMenu(false);
    if(companion.rest==='sleep'){settle('stand');return;}
    say(PET_LINES[pets.current%PET_LINES.length]!,3600);pets.current+=1;companion.react('happy');
  }
  async function action(kind:PetAction){
    if(busy)return;setBusy(true);
    try{stopWalking();await command('pet_action',{action:kind});setMenu(false);}
    catch(e){say(asAppError(e).message,5000);}finally{setBusy(false);}
  }
  useEffect(()=>()=>{stopWalking();drag.current?.finish();if(speechTimer.current)clearTimeout(speechTimer.current);},[]);
  useEffect(()=>{
    if(!isTauri())return;
    let active=true;let stop:(()=>void)|undefined;
    void listen('desktop-pet-greet',()=>{if(active)greet();}).then(unlisten=>{if(active)stop=unlisten;else unlisten();}).catch(()=>{});
    return()=>{active=false;stop?.();};
  },[]);
  useEffect(()=>{
    if(companion.rest==='sleep'||companion.rest==='read'||menu||isDragging||!animate)return;
    const rotate=setInterval(()=>{if(!temporary.current)setMessage(nextLine());},24000);
    return()=>clearInterval(rotate);
  },[companion.rest,menu,isDragging,animate]);
  useEffect(()=>{if(!animate)stopWalking();},[animate]);
  useEffect(()=>{
    if(!menu)return;
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);character.current?.focus();}};
    window.addEventListener('keydown',close);
    return()=>window.removeEventListener('keydown',close);
  },[menu]);

  function down(e:ReactPointerEvent<HTMLButtonElement>){
    if(e.button!==0||pointer.current!==null)return;
    stopWalking();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current=false;setIsDragging(false);drag.current?.start({x:e.screenX,y:e.screenY});
  }
  function move(e:ReactPointerEvent<HTMLButtonElement>){
    if(pointer.current!==e.pointerId)return;
    drag.current?.move({x:e.screenX,y:e.screenY});
    if(drag.current?.dragged&&!dragging.current){dragging.current=true;setIsDragging(true);setMenu(false);clearSpeech();setMessage('要带我去哪儿？');companion.beginDrag();}
  }
  function finishPointer(e:ReactPointerEvent<HTMLButtonElement>,cancelled=false){
    if(pointer.current!==e.pointerId)return;
    pointer.current=null;drag.current?.finish();
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
    const moved=dragging.current;dragging.current=false;setIsDragging(false);
    if(!moved)return;
    companion.endDrag(cancelled);
    if(cancelled)setMessage(restingLine());else say('这里视野不错。',2600);
  }
  return <main className={`pet-window is-${companion.playback.mood}${menu?' is-menu':''}`} onContextMenu={e=>{e.preventDefault();setMenu(v=>!v);}}>
    <p className="pet-speech" role="status">{companion.rest==='sleep'&&!isDragging?'休息一下，灵感慢慢来。':message}</p>
    <button ref={character} className="pet-character" aria-label={companion.rest==='sleep'?'南华正在休息，点击唤醒':'摸摸南华，拖动可移动，双击返回墨枢'} onPointerDown={down} onPointerMove={move} onPointerUp={e=>finishPointer(e)} onPointerCancel={e=>finishPointer(e,true)} onLostPointerCapture={e=>finishPointer(e,true)} onClick={e=>{
      if(e.detail>0&&drag.current?.dragged)return;
      if(e.detail>=2){void action('openWorkspace');return;}
      pet();
    }}><PetSprite mood={companion.playback.mood} sequence={companion.playback.sequence} onStart={started} onComplete={()=>companion.complete(companion.playback.sequence)}/></button>
    <div className="pet-controls"><button aria-label="桌宠菜单" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}>···</button><span>南华</span><button aria-label="收起桌宠" disabled={busy} onClick={()=>{void action('hide');}}>×</button></div>
    {menu&&<nav className="pet-menu" aria-label="桌宠操作">
      <button disabled={busy} onClick={()=>{void action('openWorkspace');}}>返回墨枢</button>
      <button onClick={()=>settle(companion.rest==='sleep'?'stand':'sleep')}>{companion.rest==='sleep'?'醒来啦':'休息一下'}</button>
      <button onClick={()=>settle(companion.rest==='stand'?'sit':'stand')}>{companion.rest==='stand'?'坐一会儿':'站起来'}</button>
      <button onClick={greet}>打个招呼</button>
      <button onClick={()=>settle(companion.rest==='read'?'stand':'read')}>{companion.rest==='read'?'放下书本':'一起看书'}</button>
      <button onClick={()=>{setMenu(false);companion.react('walk-left');say('往左走两步。');}}>向左走</button>
      <button onClick={()=>{setMenu(false);companion.react('walk-right');say('往右走两步。');}}>向右走</button>
      <button disabled={busy} onClick={()=>{void action('hide');}}>收起桌宠</button>
    </nav>}
  </main>;
}
