import {useEffect,useRef} from 'react';
import {loadMotionSheet} from './motion';
import type {MotionClip} from './motion';
import {usePetMotionState} from './usePetMotion';
import {motionDuration,motionFrameAt} from './timeline';

interface Props {clip:MotionClip;label:string;sequence:number;onComplete?:()=>void;onStart?:()=>void;onError:()=>void;}
/** One opaque, registered pose per paint. Decode waits keep the last picture. */
export function MotionSprite({clip,label,sequence,onComplete,onStart,onError}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const complete=useRef(onComplete);complete.current=onComplete;
  const failed=useRef(onError);failed.current=onError;
  const started=useRef(onStart);started.current=onStart;
  const progress=useRef({key:'',elapsed:0,done:false,started:false});
  const {visible,reduced}=usePetMotionState();
  useEffect(()=>{
    const target=canvas.current;if(!target)return;
    const context=target.getContext('2d',{alpha:true});
    if(!context){failed.current();return;}
    const notifyComplete=complete.current;const notifyStart=started.current;const notifyError=failed.current;
    const key=`${clip.url}:${sequence}`;
    if(progress.current.key!==key)progress.current={key,elapsed:0,done:false,started:false};
    let active=true;let raf=0;let last:number|null=null;let sheet:HTMLImageElement|undefined;let painted=-1;
    function resize(){
      const box=target!.getBoundingClientRect();const scale=Math.min(window.devicePixelRatio||1,2);
      const width=Math.max(1,Math.round(box.width*scale));const height=Math.max(1,Math.round(box.height*scale));
      if(target!.width!==width||target!.height!==height){target!.width=width;target!.height=height;painted=-1;}
    }
    function paintFrame(index:number){
      if(!sheet||!context)return;
      const column=index%clip.columns;const row=Math.floor(index/clip.columns);
      const left=Math.round(column*sheet.naturalWidth/clip.columns);const top=Math.round(row*sheet.naturalHeight/clip.rows);
      const right=Math.round((column+1)*sheet.naturalWidth/clip.columns);const bottom=Math.round((row+1)*sheet.naturalHeight/clip.rows);
      // Registered clips share a screen-space head anchor across actions, not
      // merely within each atlas. Reserve horizontal room for the wide poses.
      const base=Math.min(target!.height,target!.width*(clip.anchorX===undefined?1.5:1.25))/480;
      const unit=base*clip.renderScale;const ground=target!.height-24*base;
      const placement=clip.placements?.[index]??{x:0,y:0,scaleX:1,scaleY:1};
      const handoffX=clip.anchorX===undefined?0:(160-clip.anchorX)*unit-16*base;
      context.clearRect(0,0,target!.width,target!.height);
      context.globalAlpha=1;context.globalCompositeOperation='source-over';
      context.drawImage(sheet,left,top,right-left,bottom-top,
        (target!.width-320*unit)/2+handoffX+placement.x*unit,ground+(placement.y-456)*unit,
        320*placement.scaleX*unit,480*placement.scaleY*unit);
      painted=index;
    }
    function draw(now:number){
      if(!active||!sheet)return;
      if(!progress.current.started){progress.current.started=true;notifyStart?.();}
      if(last!==null)progress.current.elapsed+=Math.max(0,now-last);last=now;
      const duration=motionDuration(clip);
      const frame=reduced?(clip.loop?0:clip.frames-1):motionFrameAt(clip,progress.current.elapsed);
      // rAF keeps the timeline in sync; unchanged atlas frames do no canvas work.
      // Full-character dissolves duplicated eyes/ears and made low-fps art look blurry.
      if(frame!==painted)paintFrame(frame);
      if(!clip.loop&&(reduced||progress.current.elapsed>=duration)&&!progress.current.done){
        progress.current.done=true;notifyComplete?.();
      }
      if(!reduced&&visible&&(clip.loop||!progress.current.done))raf=requestAnimationFrame(draw);
    }
    const redraw=()=>{if(!sheet)return;resize();painted=-1;cancelAnimationFrame(raf);last=null;if(visible)draw(performance.now());};
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(redraw):null;
    observer?.observe(target);window.addEventListener('resize',redraw);
    void loadMotionSheet(clip.url).then(image=>{
      if(!active)return;sheet=image;last=null;resize();if(visible)draw(performance.now());
    }).catch(()=>{if(active)notifyError();});
    return()=>{active=false;cancelAnimationFrame(raf);observer?.disconnect();window.removeEventListener('resize',redraw);};
  },[clip.url,clip.frames,clip.columns,clip.rows,clip.fps,clip.loop,clip.renderScale,clip.placements,clip.anchorX,sequence,visible,reduced]);
  const breathe=visible&&!reduced&&clip.loop&&['idle','sitting','reading','sleeping'].includes(clip.id);
  return <canvas ref={canvas} className={`pet-motion-sprite${breathe?' is-breathing':''}`} role="img" aria-label={label} width={320} height={480}/>;
}
