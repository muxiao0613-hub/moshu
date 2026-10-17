import {useEffect,useRef} from 'react';
import {isTauri} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {asAppError} from './bridge';
import type {AppError} from '../../contracts';

// One native event subscription per mounted catalogue; keep edited fields mounted.
export function useFileDropRefresh(refresh:()=>Promise<void>,onError:(error:AppError)=>void){
  const current=useRef({refresh,onError});current.current={refresh,onError};
  useEffect(()=>{
    if(!isTauri())return;
    let disposed=false;let stop:(()=>void)|undefined;
    void listen<{count:number;error:string|null}>('file-drop-result',event=>{
      if(!disposed&&event.payload.count>0)void current.current.refresh().catch(error=>current.current.onError(asAppError(error)));
    }).then(unlisten=>{if(disposed)unlisten();else stop=unlisten;}).catch(error=>{if(!disposed)current.current.onError(asAppError(error));});
    return()=>{disposed=true;stop?.();};
  },[]);
}
