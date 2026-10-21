/** Short boundary holds avoid two adjacent clips pausing on the same key pose. */
export interface ClipTiming {frames:number;fps:number;loop:boolean;}
export function motionDuration(clip:ClipTiming){
  return (clip.frames-(!clip.loop&&clip.frames>2?.9:0))*1000/clip.fps;
}
export function motionFrameAt(clip:ClipTiming,elapsed:number){
  const step=1000/clip.fps;const duration=motionDuration(clip);
  const time=clip.loop?Math.max(0,elapsed)%duration:Math.max(0,elapsed);
  if(clip.loop||clip.frames<=2)return Math.min(clip.frames-1,Math.floor(time/step));
  if(time<step*.55)return 0;
  return Math.min(clip.frames-1,1+Math.floor((time-step*.55)/step));
}
