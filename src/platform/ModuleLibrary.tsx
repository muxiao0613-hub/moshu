import {useEffect,useState} from 'react';
import type {LibraryEntry,LibraryPage,LibraryReading,ReadLibrary,SearchHit} from '../contracts';
import {command,asAppError} from '../shared/lib/bridge';
import {ErrorMessage} from '../shared/ui/ErrorMessage';
export function ModuleLibrary({keyword,onSelect,showEmpty=true}:{keyword:string;onSelect:(entry:LibraryEntry)=>void;showEmpty?:boolean}) {
 const [page,setPage]=useState<LibraryPage|null>(null);const [offset,setOffset]=useState(0);const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);const [loading,setLoading]=useState(true);
 useEffect(()=>setOffset(0),[keyword]);
 useEffect(()=>{let active=true;setLoading(true);setError(null);void command('list_module_library',{keyword,offset,limit:10}).then(value=>{if(active)setPage(value);}).catch(e=>{if(active)setError(asAppError(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[keyword,offset,attempt]);
 if(!showEmpty&&!loading&&!error&&page&&!page.items.length&&!page.warnings.length)return null;
 return <section className="module-library" aria-label="小说作品">
  <div className="section-heading"><h2>小说作品</h2><button disabled={loading} onClick={()=>setAttempt(v=>v+1)}>刷新作品</button></div>
  <p className="metadata">墨稿长篇、短篇和此前手动版作品自动收录，直接阅读最新保存稿；编辑请进入墨稿。</p>
  <ErrorMessage error={error} retry={()=>setAttempt(v=>v+1)}/>
  {page?.warnings.map(w=><p role="status" key={w}>{w}</p>)}
  {loading?<p role="status">正在读取作品…</p>:page?.items.length?<div className="resource-list">{page.items.map(entry=><article className="resource-row" key={`${entry.moduleId}:${entry.kind}:${entry.id}`}><button className="resource-main" onClick={()=>onSelect(entry)}><span className="type-badge">{entry.kind.endsWith('short-stories')?'短篇':'小说'}</span><strong>{entry.title}</strong><small>{entry.moduleName} · {entry.sectionCount} 章 · {entry.wordCount.toLocaleString()} 字{entry.disabled?' · 写作模块已停用，仍可阅读':''}</small><span className="metadata">{entry.description}</span></button></article>)}</div>:!error?<p className="empty-state">{keyword?'没有匹配的小说作品。':'还没有小说作品，在墨稿创建后会自动出现在这里。'}</p>:null}
  <div className="pagination"><button disabled={loading||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-10))}>上一页作品</button><span>作品第 {offset/10+1} 页</span><button disabled={loading||!page?.hasMore} onClick={()=>setOffset(v=>v+10)}>下一页作品</button></div>
 </section>;
}
export function LibraryReader({target,onTarget,onBack,onEdit}:{target:ReadLibrary;onTarget:(q:ReadLibrary)=>void;onBack:()=>void;onEdit?:(hit:SearchHit)=>Promise<void>}) {
 const [view,setView]=useState<LibraryReading|null>(null);const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);const [attempt,setAttempt]=useState(0);const [loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);setView(null);setError(null);void command('read_module_library',target).then(value=>{if(active)setView(value);}).catch(e=>{if(active)setError(asAppError(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[target,attempt]);
 function edit() {
  if(!view||!onEdit)return;
  if(view.selectedId&&target.sectionId!==view.selectedId)onTarget({...target,sectionId:view.selectedId});
  void onEdit(view.editTarget).catch(e=>setError(asAppError(e)));
 }
 return <section className="library-reader" aria-label="小说阅读">
  <div className="card-actions"><button onClick={onBack}>返回资料库列表</button><button disabled={loading} onClick={()=>setAttempt(v=>v+1)}>读取最新保存稿</button>{view&&onEdit&&<button className="primary" disabled={view.entry.disabled||loading} onClick={edit}>进入{view.entry.moduleName}编辑</button>}</div>
  <ErrorMessage error={error} retry={()=>setAttempt(v=>v+1)}/>
  {loading?<p role="status">正在打开正文…</p>:view&&<>
   <div className="page-heading"><div><p className="eyebrow">资料库 · {view.entry.moduleName}</p><h1>{view.entry.title}</h1><p className="metadata">{view.entry.sectionCount} 章 · {view.entry.wordCount.toLocaleString()} 字 · 最新保存于 {new Date(view.entry.updatedAt).toLocaleString()}{view.entry.disabled?' · 写作模块已停用，可继续阅读；启用后编辑。':''}</p></div></div>
   <div className="library-reading-layout"><nav className="library-directory" aria-label="小说目录">{view.sections.map(ch=><button key={ch.id} aria-current={view.selectedId===ch.id?'page':undefined} className={view.selectedId===ch.id?'selected':''} onClick={()=>onTarget({...target,sectionId:ch.id})}><strong>{ch.title}</strong><small>{ch.wordCount.toLocaleString()} 字</small></button>)}</nav><article className="library-manuscript" key={view.selectedId}><h2>{view.title}</h2>{view.text?<div className="library-body">{view.text}</div>:<p className="muted">{view.sections.length?'这一章还没有正文。':'作品还没有章节。'}</p>}<p className="metadata">已保存版本 {view.revision} · 阅读不会改动原稿</p></article></div>
  </>}
 </section>;
}
