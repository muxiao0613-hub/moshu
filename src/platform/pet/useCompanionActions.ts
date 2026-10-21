import {useEffect,useRef,useState} from 'react';
import type {PetMood} from './sprites';
import {motionPlans,preloadMotion} from './motion';

type Rest='stand'|'sit'|'read'|'sleep';
type Request={target:Rest;reaction?:PetMood};
const restingAction:Record<Rest,PetMood>={stand:'idle',sit:'sitting',read:'reading',sleep:'sleeping'};

/** Route through posture changes instead of jumping from a standing pose to a seated one. */
export function useCompanionActions(automatic:boolean) {
  const [playback,setPlayback]=useState<{mood:PetMood;sequence:number}>({mood:'idle',sequence:0});
  const [rest,setRestState]=useState<Rest>('stand');
  const target=useRef<Rest>('stand');const location=useRef<Rest>('stand');
  const current=useRef(playback);const sequence=useRef(0);const queue=useRef<PetMood[]>([]);
  const pending=useRef<Request|null>(null);const dragged=useRef(false);const idleIndex=useRef(0);
  const warming=useRef(0);
  const handlers=useRef<{route:(request:Request)=>void;complete:(token:number)=>void}|null>(null);
  function warm(moods:PetMood[]){
    const ticket=++warming.current;
    void (async()=>{for(const mood of [...new Set(moods)]){if(ticket!==warming.current)return;await preloadMotion(mood);}})();
  }
  useEffect(()=>()=>{warming.current++;},[]);

  function begin(mood:PetMood){
    const next={mood,sequence:++sequence.current};current.current=next;setPlayback(next);
    if(motionPlans[mood].loop){
      if(mood==='idle')location.current='stand';
      else if(mood==='sitting')location.current='sit';
      else if(mood==='reading')location.current='read';
      else if(mood==='sleeping')location.current='sleep';
    }
    if(queue.current[0])preloadMotion(queue.current[0]);
  }
  function route(request:Request){
    const actions:PetMood[]=[];let from=location.current;
    const to=request.target;const reaction=request.reaction;
    if(from==='sleep'&&(to!=='sleep'||reaction)){actions.push('waking');from='sit';}
    if(from==='read'&&(to!=='read'||reaction)){actions.push('close-book');from='sit';}
    if(reaction){
      if(from==='sit'){actions.push('stand-up');from='stand';}
      actions.push(reaction);
    }
    if(to==='stand'){
      if(from==='sit')actions.push('stand-up');
    }else if(from==='stand'){
      actions.push('sit-down');from='sit';
    }
    if(to==='read'&&from!=='read')actions.push('open-book');
    if(to==='sleep'&&from!=='sleep')actions.push('drowsy');
    actions.push(restingAction[to]);
    warm(actions);queue.current=actions.slice(1);begin(actions[0]!);
  }
  function request(next:Request){
    target.current=next.target;setRestState(next.target);
    if(dragged.current||!motionPlans[current.current.mood].loop){pending.current=next;return;}
    pending.current=null;route(next);
  }
  function complete(token:number){
    if(token!==current.current.sequence||dragged.current)return;
    const mood=current.current.mood;
    if(mood==='sit-down'||mood==='close-book'||mood==='waking'||mood==='drowsy')location.current='sit';
    else if(mood==='stand-up'||mood==='landing')location.current='stand';
    else if(mood==='open-book'||mood==='turn-page')location.current='read';
    if(pending.current){const next=pending.current;pending.current=null;queue.current=[];route(next);return;}
    const next=queue.current.shift();begin(next??restingAction[target.current]);
  }
  handlers.current={route,complete};
  useEffect(()=>{
    // Prepare likely exits while a steady pose is already showing, rather than
    // first decoding close-book / stand-up after the user has clicked.
    const exits:Partial<Record<PetMood,PetMood[]>>={idle:['sit-down','waving','happy','dragging'],sitting:['open-book','stand-up','drowsy'],reading:['close-book','turn-page','stand-up'],sleeping:['waking','stand-up']};
    if(exits[playback.mood])warm(exits[playback.mood]!);
  },[playback.mood]);
  useEffect(()=>{
    if(!automatic||!motionPlans[playback.mood].loop)return;
    if(playback.mood!=='idle'&&playback.mood!=='reading')return;
    const timer=setTimeout(()=>{
      if(playback.sequence!==current.current.sequence||dragged.current)return;
      if(playback.mood==='reading'){queue.current=['reading'];begin('turn-page');}
      else{const idleActions:PetMood[]=['blink','ears','blink','tail'];queue.current=['idle'];begin(idleActions[idleIndex.current++%idleActions.length]!);}
    },playback.mood==='reading'?12000:6000);
    return()=>clearTimeout(timer);
  },[playback.mood,playback.sequence,automatic]);
  return {
    playback,rest,
    complete:(token:number)=>handlers.current?.complete(token),
    settle:(next:Rest)=>request({target:next}),
    react:(reaction:PetMood)=>request({target:target.current,reaction}),
    beginDrag:()=>{warming.current++;dragged.current=true;queue.current=[];pending.current=null;location.current='stand';preloadMotion('landing');begin('dragging');},
    endDrag:(cancelled=false)=>{dragged.current=false;const next=pending.current??{target:target.current,reaction:cancelled?undefined:'landing' as PetMood};pending.current=null;handlers.current?.route(next);},
  };
}
