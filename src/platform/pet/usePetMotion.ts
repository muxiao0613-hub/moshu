import {useEffect,useState} from 'react';

/** Stop frame timers in hidden windows and respond to OS motion changes live. */
export function usePetMotionState() {
  const [visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
  const [reduced,setReduced]=useState(()=>typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const visibility=()=>setVisible(document.visibilityState!=='hidden');
    document.addEventListener('visibilitychange',visibility);
    const media=typeof matchMedia!=='undefined'?matchMedia('(prefers-reduced-motion: reduce)'):null;
    const motion=()=>setReduced(media?.matches??false);
    motion();
    media?.addEventListener('change',motion);
    return()=>{document.removeEventListener('visibilitychange',visibility);media?.removeEventListener('change',motion);};
  },[]);
  return {visible,reduced};
}
export function usePetMotion(){const {visible,reduced}=usePetMotionState();return visible&&!reduced;}
