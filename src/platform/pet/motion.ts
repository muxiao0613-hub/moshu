import manifest from './assets/motion/manifest.json';
import registration from './assets/motion/registration.json';

export type PetMotion=keyof typeof manifest.clips;
export interface MotionClip {
  id:PetMotion;url:string;frames:number;columns:number;rows:number;fps:number;loop:boolean;renderScale:number;
  placements?:readonly {x:number;y:number;scaleX:number;scaleY:number}[];
  anchorX?:number;
}
export const motionPlans=manifest.clips;
const files=import.meta.glob('./assets/motion/*.webp',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export function motionClip(id:PetMotion):MotionClip|null {
  const plan=motionPlans[id] as {file:string|null;frames:number;columns:number;rows:number;fps:number;loop:boolean;renderScale:number};
  const url=plan.file?files[`./assets/motion/${plan.file}`]:undefined;
  return url?{id,url,frames:plan.frames,columns:plan.columns,rows:plan.rows,fps:plan.fps,loop:plan.loop,renderScale:plan.renderScale,placements:registration.clips[id].frames,anchorX:registration.clips[id].anchorX}:null;
}

/** Cache decoded atlases, not 140 independently decoded full-size images. */
const decoded=new Map<string,{promise:Promise<HTMLImageElement>;bytes:number}>();
const MAX_DECODED_BYTES=32*1024*1024;
function trimDecoded(){
  let bytes=[...decoded.values()].reduce((sum,item)=>sum+item.bytes,0);
  for(const [url,item] of decoded){
    if(decoded.size<=8&&bytes<=MAX_DECODED_BYTES)break;
    if(decoded.size===1)break;
    decoded.delete(url);bytes-=item.bytes;
  }
}
export function loadMotionSheet(url:string):Promise<HTMLImageElement> {
  const existing=decoded.get(url);
  if(existing){decoded.delete(url);decoded.set(url,existing);return existing.promise;}
  const entry={promise:null as unknown as Promise<HTMLImageElement>,bytes:0};
  const pending=new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.decoding='async';
    image.onload=()=>{void image.decode().catch(()=>{}).then(()=>{
      entry.bytes=image.naturalWidth*image.naturalHeight*4;
      if(decoded.get(url)===entry)trimDecoded();
      resolve(image);
    });};
    image.onerror=()=>{if(decoded.get(url)===entry)decoded.delete(url);reject(new Error('桌宠动作图片暂时无法加载。'));};
    image.src=url;
  });
  entry.promise=pending;decoded.set(url,entry);trimDecoded();
  return pending;
}
export function preloadMotion(id:PetMotion):Promise<void>{const clip=motionClip(id);return clip?loadMotionSheet(clip.url).then(()=>{},()=>{}):Promise.resolve();}
