/** Drop transparent PNG/WebP frames into ./assets to replace the vector fallback. */
import {motionPlans} from './motion';
import type {PetMotion} from './motion';
export type PetMood=PetMotion;
export const moods=Object.keys(motionPlans) as PetMood[];
export const moodLabels=Object.fromEntries(moods.map(id=>[id,motionPlans[id].label])) as Record<PetMood,string>;
const modules=import.meta.glob('./assets/*.{png,webp}',{eager:true,query:'?url',import:'default'}) as Record<string,string>;
export const spriteFrames:Partial<Record<PetMood,string[]>>={};
const entries=Object.entries(modules)
  .map(([path,url])=>({path,url}))
  .sort((a,b)=>a.path.localeCompare(b.path,undefined,{numeric:true}));
for(const {path,url} of entries){
  const name=(path.split('/').pop()??'').replace(/\.(png|webp)$/i,'').toLowerCase();
  const mood=moods.find(state=>name===state||name.startsWith(`${state}-`)||name.startsWith(`${state}_`));
  if(!mood)continue;
  (spriteFrames[mood]??=[]).push(url);
}
export const frameRate=Object.fromEntries(moods.map(id=>[id,motionPlans[id].fps])) as Record<PetMood,number>;
export function hasSpriteArt(){return moods.some(mood=>spriteFrames[mood]?.length);}
