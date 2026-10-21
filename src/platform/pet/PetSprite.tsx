import {useEffect,useMemo,useRef,useState} from 'react';
import {FoxGirl} from './FoxGirl';
import {frameRate,moodLabels,spriteFrames} from './sprites';
import type {PetMood} from './sprites';
import {usePetMotionState} from './usePetMotion';
import {MotionSprite} from './MotionSprite';
import {motionClip,motionPlans} from './motion';
import {motionDuration} from './timeline';

/** Image frames when supplied; the local vector character otherwise. */
export function PetSprite({mood,sequence=0,onComplete,onStart}:{mood:PetMood;sequence?:number;onComplete?:()=>void;onStart?:()=>void}) {
  const {visible,reduced}=usePetMotionState();const animate=visible&&!reduced;
  const complete=useRef(onComplete);complete.current=onComplete;
  const [broken,setBroken]=useState<ReadonlySet<string>>(()=>new Set());
  const clip=motionClip(mood);
  const useAtlas=!!clip&&!broken.has(clip.url);
  const frames=useMemo(()=>{
    const selected=(spriteFrames[mood]??[]).filter(url=>!broken.has(url));
    return selected.length?selected:(spriteFrames.idle??[]).filter(url=>!broken.has(url));
  },[mood,broken]);
  const [cursor,setCursor]=useState({mood,index:0});
  const index=animate&&cursor.mood===mood?cursor.index%Math.max(frames.length,1):0;
  useEffect(()=>{
    if(frames.length<2||!animate||useAtlas)return;
    const timer=setInterval(()=>setCursor(current=>({mood,index:current.mood===mood?(current.index+1)%frames.length:1})),1000/frameRate[mood]);
    return()=>clearInterval(timer);
  },[mood,frames,animate,useAtlas]);
  useEffect(()=>{
    if(useAtlas||!complete.current||!visible)return;
    const plan=motionPlans[mood];if(plan.loop)return;
    const notify=complete.current;
    const timer=setTimeout(()=>notify?.(),reduced?0:motionDuration(plan));
    return()=>clearTimeout(timer);
  },[mood,sequence,visible,reduced,useAtlas]);
  if(clip&&useAtlas)return <MotionSprite clip={clip} sequence={sequence} label={`南华：${moodLabels[mood]}`} onComplete={onComplete} onStart={onStart} onError={()=>setBroken(current=>new Set([...current,clip.url]))}/>;
  if(!frames.length)return <FoxGirl sleeping={mood==='sleeping'} happy={mood==='happy'} waving={mood==='waving'}/>;
  const src=frames[index]??frames[0]!;
  return <img className={`pet-sprite${animate?' is-animated':''}`} src={src} alt={`南华：${moodLabels[mood]}`} draggable={false} decoding="async" onError={()=>setBroken(current=>new Set([...current,src]))}/>;
}
