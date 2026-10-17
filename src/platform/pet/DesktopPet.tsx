import {useEffect,useState} from 'react';
import {listen} from '@tauri-apps/api/event';
import {isTauri} from '@tauri-apps/api/core';
import type {DesktopPetState,PetPreferences} from '../../contracts/pet';
import {command,asAppError} from '../../shared/lib/bridge';
import {ErrorMessage} from '../../shared/ui/ErrorMessage';
import {FoxGirl} from './FoxGirl';
import './pet.css';

export function DesktopPet() {
  const [state,setState]=useState<DesktopPetState|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);
  async function refresh(){try{setState(await command('get_desktop_pet',{}));}catch(e){setError(asAppError(e));}}
  useEffect(()=>{let active=true;let stop:(()=>void)|undefined;void command('get_desktop_pet',{}).then(next=>{if(active)setState(next);}).catch(e=>{if(active)setError(asAppError(e));});if(isTauri())void listen('desktop-pet-changed',()=>{void refresh();}).then(unlisten=>{if(active)stop=unlisten;else unlisten();});return()=>{active=false;stop?.();};},[]);
  async function save(patch:Partial<PetPreferences>){if(!state||busy)return;setBusy(true);setError(null);try{setState(await command('save_desktop_pet',{baseRevision:state.preferences.revision,preferences:{...state.preferences,...patch}}));}catch(e){setError(asAppError(e));await refresh();}finally{setBusy(false);}}
  return <section><div className="page-heading"><div><p className="eyebrow">一点陪伴</p><h1>桌宠</h1><p className="muted">小狐狸陪你工作与创作，随时可以收起。</p></div></div><ErrorMessage error={error} retry={()=>{void refresh();}}/>
    <div className="pet-settings-layout"><div className="pet-preview"><FoxGirl/><strong>小狐狸</strong><span>形象先行，细节以后一起完善。</span></div><section className="detail-panel"><h2>桌面陪伴</h2><p role="status">{state?(state.visible?'小狐狸已在桌面上。':state.preferences.enabled?'已开启，窗口暂未显示，可重试显示。':'桌宠尚未开启。'):'正在读取桌宠设置…'}</p><div className="card-actions"><button className="primary" disabled={!state||busy} onClick={()=>{void save({enabled:!state?.visible});}}>{state?.visible?'收起桌宠':state?.preferences.enabled?'重新显示':'开启桌宠'}</button><button disabled={!state?.visible||busy} onClick={()=>{void command('pet_action',{action:'recenter'}).catch(e=>setError(asAppError(e)));}}>找回桌宠</button></div>
      <fieldset disabled={!state||busy} className="pet-preferences"><label className="check-label"><input type="checkbox" checked={state?.preferences.alwaysOnTop??true} onChange={e=>{void save({alwaysOnTop:e.target.checked});}}/>保持在其他窗口上方</label><label>桌宠大小<select value={state?.preferences.size??'medium'} onChange={e=>{void save({size:e.target.value as PetPreferences['size']});}}><option value="small">小</option><option value="medium">标准</option><option value="large">大</option></select></label></fieldset>
      <p className="muted">拖动小狐狸移动位置，点击互动；右键或点“···”打开菜单，可返回墨枢、休息或收起。收起后从这里重新开启。开启状态、置顶和大小会记住，下次启动墨枢时恢复。</p><p className="muted">桌宠跟随墨枢运行，退出墨枢时一并退出。它不读取你的文稿，也不会发起 AI 请求。</p>
    </section></div></section>;
}
