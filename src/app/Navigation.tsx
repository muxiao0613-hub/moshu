import type {Page,Preferences} from '../contracts';
import {pageLabels} from '../contracts';
import {ModuleEntries} from '../platform/ModuleEntries';
import {groupForPage,groupPages,navigationGroups} from './navigation-groups';

type Props={page:Page;preferences:Preferences;disabled:boolean;onNavigate:(page:Page)=>void};
export function MainNavigation({page,disabled,onNavigate}:Omit<Props,'preferences'>) {
  const active=groupForPage(page);
  return <nav className="main-navigation" aria-label="主导航">{navigationGroups.map((group,index)=><button key={group.id} aria-label={group.label} disabled={disabled} className={active.id===group.id?'selected':''} aria-current={active.id===group.id?'page':undefined} onClick={()=>onNavigate(group.first)}><span className="nav-number" aria-hidden="true">0{index+1}</span><span><strong>{group.label}</strong><small>{group.description}</small></span></button>)}</nav>;
}
export function SectionNavigation({page,preferences,disabled,onNavigate,onModule,activeModule,refreshKey}:Props&{onModule:(id:string)=>Promise<void>;activeModule:string|null;refreshKey:string}) {
  const group=groupForPage(page);
  if(group.id==='home')return null;
  return <nav className="section-navigation" aria-label={`${group.label}分类`}>{groupPages(preferences,page).map(key=><button key={key} className={page===key||(page==='document'&&key==='resources')?'selected':''} aria-current={page===key||(page==='document'&&key==='resources')?'page':undefined} disabled={disabled} onClick={()=>onNavigate(key)}>{key==='resources'?'资料库':key==='modules'?'模块管理':pageLabels[key]}{preferences.pinned.includes(key)?' · 固定':''}</button>)}{group.id==='creation'&&<ModuleEntries navigation onOpen={onModule} activeId={activeModule} disabled={disabled} refreshKey={refreshKey}/>}</nav>;
}
