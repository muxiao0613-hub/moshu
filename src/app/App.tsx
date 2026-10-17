import {MainNavigation,SectionNavigation} from './Navigation';
import {DesktopPet} from '../platform/pet/DesktopPet';
import {ModuleWorkspace} from '../platform/ModuleWorkspace';
import {useConfirmation} from '../shared/ui/Confirmation';
import {listen} from '@tauri-apps/api/event';
import {ShortcutContext} from '../shared/editor/shortcuts';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Note, NoteDraft, NoteSummary, WorkspaceStatus, Resource, DocumentSession } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import type { EditorHandle } from '../platform/NoteEditor';
import { Tasks } from '../platform/Tasks';
import { Projects } from '../platform/Projects';
import { RecoveryDrafts } from '../platform/RecoveryDrafts';
import { Resources } from '../platform/Resources';
import { DocumentEditor } from '../platform/DocumentEditor';
import { DocumentSessions } from '../platform/DocumentSessions';

import type {Page, Preferences, SearchHit, Job, ReadLibrary} from '../contracts';
import {defaultPreferences} from '../contracts';
import {Search} from '../platform/Search';
import {Trash} from '../platform/Trash';
import {Settings} from '../platform/Settings';
import {FoundationHome} from '../platform/FoundationHome';
import {Modules} from '../platform/Modules';
import {Help} from '../platform/Help';
const NoteEditor = lazy(() => import('../platform/NoteEditor').then(module => ({ default: module.NoteEditor })));
export function App() {
  const {ask:confirmClose,dialog:closeDialog}=useConfirmation();
  const [preferences,setPreferences]=useState<Preferences>(defaultPreferences);
  const preferencesRevision=useRef(1);const preferenceQueue=useRef(Promise.resolve());
  const [locationReady,setLocationReady]=useState(false);
  const [modulesRevision,setModulesRevision]=useState(0);
  const [moduleExpanded,setModuleExpanded]=useState(false);
  const [libraryTarget,setLibraryTarget]=useState<ReadLibrary|null>(null);
  const [moduleTarget,setModuleTarget]=useState<SearchHit|null>(null);
  const [routeId,setRouteId]=useState<string|null>(null);
  const [locationNotice,setLocationNotice]=useState('');
  const [jobs,setJobs]=useState<Job[]>([]);
  const [maintenanceBusy,setMaintenanceBusy]=useState(false);
  const automaticStarted=useRef(false);const completedJobs=useRef(new Set<string>());const activeRestores=useRef(new Set<string>());
  const [avatar,setAvatar]=useState<string|null>(null);
  const [document, setDocument] = useState<{resource: Resource; session: DocumentSession} | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [note, setNote] = useState<Note | null>(null);
  const [taskRoute, setTaskRoute] = useState(0);
  const [taskProjectId, setTaskProjectId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<NoteDraft | null>(null);
  const [noteOffset, setNoteOffset] = useState(0);
  const noteOffsetRef = useRef(0);
  const noteListGeneration = useRef(0);
  const [error, setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const editor = useRef<EditorHandle | null>(null);
  const closing = useRef(false);
  const transitioning = useRef(false);
  const reload = useCallback(async () => {
    const generation = ++noteListGeneration.current;
    try {
      const [nextStatus, nextNotes] = await Promise.all([
        command('workspace_status', {}), command('list_notes', { offset: noteOffsetRef.current, limit: 20 }),
      ]);
      if (generation === noteListGeneration.current) { setStatus(nextStatus); setNotes(nextNotes); setError(null); }
    } catch (error) { if (generation === noteListGeneration.current) setError(asAppError(error)); }
    finally { if (generation === noteListGeneration.current) setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(()=>{if(!isTauri())return;let disposed=false;let stop:(()=>void)|undefined;void listen<{count:number;error:string|null}>('file-drop-result',event=>{setLocationNotice(`已拖入 ${event.payload.count} 份资料到资料库根目录。${event.payload.error??''}`);void reload();}).then(unlisten=>{if(disposed)unlisten();else stop=unlisten;}).catch(e=>setError(asAppError(e)));return()=>{disposed=true;stop?.();};},[reload]);
  useEffect(() => { window.scrollTo(0, 0); }, [page]);
  useEffect(()=>{let active=true;void command('startup_workspace',{}).then(async startup=>{if(!active||!startup)return;setPreferences(startup.preferences);preferencesRevision.current=startup.preferences.revision;setLocationNotice(startup.notice??'');const loc=startup.location;setRouteId(loc.entityId);if(loc.page==='notes'&&loc.entityId)setNote(await command('get_note',{id:loc.entityId}));if(loc.page==='document'&&loc.entityId){const resource=await command('get_resource',{id:loc.entityId});const session=await command('begin_document_edit',{id:loc.entityId,baseRevision:resource.revision});if(active)setDocument({resource,session});}if(active){setPage(loc.page);setLocationReady(true);}}).catch(e=>{if(active){setError(asAppError(e));setLocationReady(true);}});return()=>{active=false;};},[]);
  useEffect(()=>{if(!locationReady)return;void command('save_location',{location:{page,entityId:page==='notes'?note?.id??null:page==='document'?document?.resource.id??null:routeId}}).catch(e=>setError(asAppError(e)));},[page,routeId,note?.id,document?.resource.id,locationReady]);
  useEffect(()=>{if(typeof matchMedia==='undefined')return;const apply=()=>{const theme=preferences.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):preferences.theme;globalThis.document.documentElement.dataset.theme=theme;globalThis.document.documentElement.style.setProperty('--app-scale',String(preferences.fontSize/15));};apply();const query=matchMedia('(prefers-color-scheme: dark)');query.addEventListener('change',apply);return()=>query.removeEventListener('change',apply);},[preferences.theme,preferences.fontSize]);
  useEffect(()=>{let active=true;if(!preferences.avatarResourceId){setAvatar(null);return;}void command('preview_file',{id:preferences.avatarResourceId}).then(p=>{if(active)setAvatar(p.dataUrl);}).catch(()=>{if(active)setAvatar(null);});return()=>{active=false;};},[preferences.avatarResourceId]);
  useEffect(()=>{if(!status||!locationReady)return;let active=true;let polling=false;const poll=async()=>{if(polling)return;polling=true;try{const next=await command('list_jobs',{});if(!active||!next)return;setJobs(next);setMaintenanceBusy(next.some(j=>['backup','automaticBackup','restore'].includes(j.operation)&&(j.status==='pending'||j.status==='running')));for(const job of next){if(job.operation==='restore'&&['pending','running'].includes(job.status))activeRestores.current.add(job.id);if(job.status==='succeeded'&&!completedJobs.current.has(job.id)){completedJobs.current.add(job.id);if(job.operation==='restore'&&activeRestores.current.delete(job.id)){setLibraryTarget(null);setNote(null);setDocument(null);setRecovery(null);setRouteId(null);setPage('home');const startup=await command('startup_workspace',{});setPreferences(startup.preferences);preferencesRevision.current=startup.preferences.revision;await reload();}}}}catch(e){if(active)setError(asAppError(e));}finally{polling=false;}};void poll();const timer=setInterval(()=>{void poll();},1000);if(!automaticStarted.current){automaticStarted.current=true;void command('automatic_backup',{}).then(job=>{if(active&&job){setJobs(rows=>[job,...rows]);setMaintenanceBusy(true);}}).catch(e=>{if(active)setError(asAppError(e));});}return()=>{active=false;clearInterval(timer);};},[!!status,locationReady,reload]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false; let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async event => {
      event.preventDefault();
      if (closing.current) return;
      closing.current = true;
      const saved = await editor.current?.flush() ?? true;
      const recoverable = !saved && await editor.current?.checkpoint();
      const message = recoverable ? '当前内容未能提交，恢复草稿已落盘。关闭后可在首页对照恢复，仍然关闭？' : '当前内容和恢复草稿均未确认保存。关闭可能丢失本次修改，仍然关闭？';
      if (saved || await confirmClose(message)) await getCurrentWindow().destroy();
      else closing.current = false;
    }).then(stop => { if (disposed) stop(); else unlisten = stop; }).catch(() => {
      setError({ code: 'IO_ERROR', message: '无法注册关闭前保存保护，请先保存再退出。', retryable: true, requestId: crypto.randomUUID() });
    });
    return () => { disposed = true; unlisten?.(); };
  }, [confirmClose]);
  async function transition(work: () => Promise<void>) {
    if (transitioning.current || maintenanceBusy) return;
    transitioning.current = true; setBusy(true);
    try {
      if (editor.current && !await editor.current.flush()) {
        setError({ code: 'CONFLICT', message: '当前编辑内容尚未保存，请处理后再切换。', retryable: false, requestId: crypto.randomUUID() });
        return;
      }
      await work();
    } catch (error) { setError(asAppError(error)); }
    finally { transitioning.current = false; setBusy(false); }
  }
  async function createNote(projectId: string | null = null) {
    await transition(async () => {
      const created = await command('create_note', { title: '未命名笔记', projectId });
      setRouteId(null); setRecovery(null); setNote(created); setPage('notes'); await reload();
    });
  }
  function navigate(next: Page) { void transition(async () => { if(moduleExpanded&&isTauri())await getCurrentWindow().setFullscreen(false);setModuleExpanded(false);setTaskRoute(prev => prev+1); setTaskProjectId(null); setRecovery(null); setNote(null); noteOffsetRef.current = 0; setNoteOffset(0); setRouteId(null); setPage(next); await reload(); }); }
  async function openDocument(id: string) {
    await transition(async () => {
      const resource = await command('get_resource', {id});
      const session = await command('begin_document_edit', {id, baseRevision:resource.revision});
      setRouteId(id); setDocument({resource,session}); setNote(null); setRecovery(null); setPage('document');
    });
  }
  async function openNote(id: string) { await transition(async () => { setRouteId(null); setRecovery(null); setNote(await command('get_note', { id })); setPage('notes'); }); }
  async function openDraft(id: string, copy: boolean) {
    await transition(async () => {
      const draft = await command('get_note_draft', {id});
      if (copy) {
        const created = await command('copy_note_draft', {id});
        setRouteId(null); setRecovery(null); setNote(created); setPage('notes'); await reload();
        // A failed cleanup leaves an extra recoverable draft, never a lost copy.
        try { await command('discard_note_draft', {id, throughSequence: draft.clientEditSequence}); }
        catch (error) {setError(asAppError(error));}
      } else {
        const current = await command('get_note', {id: draft.noteId});
        setRecovery(draft); setNote(current); setPage('notes');
      }
    });
  }
  function notePage(offset: number) {
    void transition(async () => {setRecovery(null); setNote(null); noteOffsetRef.current = offset; setNoteOffset(offset); await reload();});
  }
  async function changePreferences(next:Preferences){setPreferences(next);const work=preferenceQueue.current.catch(()=>{}).then(async()=>{const saved=await command('save_preferences',{baseRevision:preferencesRevision.current,preferences:next});preferencesRevision.current=saved.revision;setPreferences(current=>({...current,revision:saved.revision}));});preferenceQueue.current=work;await work;}
  async function openHit(hit:SearchHit,preserveLibrary=false){await transition(async()=>{if(!preserveLibrary)setLibraryTarget(null);setModuleExpanded(false);setNote(null);setDocument(null);setRecovery(null);setTaskProjectId(null);if(hit.moduleId){if(hit.disabled){setLocationNotice('该内容属于已停用模块，请在模块中心启用后打开。');setPage('modules');return;}await command('module_access',{id:hit.moduleId});setModuleTarget(hit);setRouteId(hit.moduleId);setPage('module');}else if(hit.kind==='note'){setNote(await command('get_note',{id:hit.id}));setRouteId(null);setPage('notes');}else{setRouteId(hit.id);setPage(hit.kind==='project'?'projects':hit.kind==='task'?'tasks':'resources');setTaskRoute(v=>v+1);}});}
  async function openModule(id:string){await transition(async()=>{await command('module_access',{id});setModuleExpanded(false);setLibraryTarget(null);setModuleTarget(null);setRouteId(id);setPage('module');});}
  const selectedLocation=useCallback((id:string|null)=>{setRouteId(id);},[]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.isComposing||!(e.metaKey||e.ctrlKey)||e.altKey||e.shiftKey)return;const key=e.key.toUpperCase();if(key===preferences.shortcuts.search){e.preventDefault();navigate('search');}else if(key===preferences.shortcuts.newNote){e.preventDefault();void createNote();}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);});
  return <ShortcutContext.Provider value={preferences.shortcuts}><div className={page==='module'&&moduleExpanded?'app-shell module-expanded':'app-shell'}>{closeDialog}
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">{avatar?<img src={avatar} alt="个人头像"/>:"墨"}</span><div><strong>墨枢</strong><small>个人工作空间</small></div></div>
      <MainNavigation page={page} disabled={busy||maintenanceBusy} onNavigate={navigate}/>
      <div className="sidebar-footer"><span className="local-dot" />本地工作空间<small>0.1.0 · 开发中</small></div>
    </aside>
    <main>
      <header className="topbar"><span>{preferences.nickname}</span><button className="global-search" disabled={busy||maintenanceBusy} onClick={()=>navigate('search')}>全局搜索</button></header>
      <div className="page-content">
        <SectionNavigation page={page} preferences={preferences} disabled={busy||maintenanceBusy} onNavigate={navigate} onModule={openModule} activeModule={page==='module'?routeId:null} refreshKey={`${page}-${modulesRevision}`}/>
        {locationNotice&&<p role="status">{locationNotice}</p>}
        {jobs.length>0&&<details className="job-panel" open={maintenanceBusy}><summary>运行状态{maintenanceBusy?' · 维护进行中，请稍候':''}</summary>{jobs.slice(0,8).map(job=><div className="settings-row" key={job.id}><span>{job.operation==='backup'?'完整备份':job.operation==='restore'?'恢复空间':job.operation==='import'?'导入资料':job.operation==='export'?'导出资料':job.operation==='exportBackup'?'导出备份':job.operation==='inspectRestore'?'检查备份':'自动备份'} · {({pending:'等待',running:'运行中',succeeded:'完成',failed:'失败',cancelled:'已取消',interrupted:'中断'} as Record<string,string>)[job.status]??job.status}{job.errorCode?` · ${job.errorCode}`:''}</span><progress max={1} value={job.progress}/>{['pending','running'].includes(job.status)&&<button onClick={()=>{void command('cancel_job',{id:job.id}).catch(e=>setError(asAppError(e)));}}>请求取消</button>}{['failed','interrupted','cancelled'].includes(job.status)&&<button onClick={()=>navigate(['import','export'].includes(job.operation)?'resources':'settings')}>前往操作页重试</button>}</div>)}</details>}

        <ErrorMessage error={error} retry={() => { if (!status) setLoading(true); void reload(); }} />
        <div inert={maintenanceBusy} className={page==='module'&&moduleExpanded?'module-page-content':undefined}>
        {loading ? <p role="status">正在打开本地工作空间…</p> : !status ? <section className="empty-state"><h1>工作空间暂不可用</h1><p>请通过桌面应用打开墨枢。数据加载失败时，可重试；应用会保留原数据。</p></section> :
          page === 'home' ? <section>
            <RecoveryDrafts disabled={busy} onOpen={openDraft} />
            <DocumentSessions onOpen={openDocument} onChanged={reload} />
            <FoundationHome onModule={openModule} preferences={preferences} onOpen={openHit} onNavigate={navigate} onCreateNote={()=>{void createNote();}} onOnboarding={()=>{void changePreferences({...preferences,onboardingComplete:true}).catch(e=>setError(asAppError(e)));}}/>
          </section> : page==='search'?<Search onOpen={openHit}/>:page==='trash'?<Trash onChanged={reload}/>:page==='modules'?<Modules onChanged={()=>setModulesRevision(v=>v+1)} onOpen={async id=>{await transition(async()=>{await command('module_access',{id});setModuleExpanded(false);setLibraryTarget(null);setModuleTarget(null);setRouteId(id);setPage('module');});}}/>:page==='module'&&routeId?<ModuleWorkspace onExpandedChange={setModuleExpanded} id={routeId} target={moduleTarget} editorRef={editor} onBack={()=>navigate('modules')} onLibrary={()=>navigate('resources')}/>:page==='help'?<Help preferences={preferences} status={status}/>:page==='settings'?<Settings preferences={preferences} onChange={changePreferences} onReset={async()=>{await preferenceQueue.current.catch(()=>{});const p=await command('reset_preferences',{});preferencesRevision.current=p.revision;setPreferences(p);}} onJob={job=>{if(job.operation==='restore')activeRestores.current.add(job.id);setJobs(rows=>[job,...rows]);setMaintenanceBusy(true);}}/>:page==='pet'?<DesktopPet/>: page === 'document' && document ? <DocumentEditor key={document.session.id} resource={document.resource} session={document.session} editorRef={editor} onBack={() => navigate('resources')} onSaved={reload} onCopy={openDocument} /> : page === 'projects' ? <Projects initialId={routeId} onSelected={selectedLocation} onOpenDocument={openDocument} reload={reload} onCreateNote={createNote} onOpenNote={openNote} onOpenTasks={async id => {await transition(async () => {setTaskProjectId(id);setNote(null);setRecovery(null);setPage('tasks');});}} /> :
            page === 'tasks' ? <Tasks initialTaskId={routeId} onSelected={selectedLocation} key={`${taskProjectId ?? "all"}:${taskRoute}`} initialProjectId={taskProjectId} editorRef={editor} /> :
            page === 'resources' ? <Resources initialLibrary={libraryTarget} onLibrarySelected={setLibraryTarget} onOpenModule={hit=>openHit(hit,true)} initialId={routeId} onSelected={selectedLocation} onOpenDocument={openDocument} onChanged={reload} onCreateNote={createNote} onOpenNote={openNote} /> :
            <section><div className="page-heading"><div><p className="eyebrow">记录与积累</p><h1>笔记</h1></div><button type="button" className="primary" disabled={busy} onClick={() => { void createNote(); }}>新建笔记</button></div>
              <div className="notes-layout"><aside className="note-list" aria-label="笔记列表">{notes.map(item => <button key={item.id} type="button" disabled={busy} className={note?.id === item.id ? 'selected' : ''} onClick={() => { void transition(async () => { setRecovery(null); setNote(await command('get_note', { id: item.id })); }); }}><strong>{item.title}</strong><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button>)}{notes.length === 0 && <p className="muted">这一页没有笔记。</p>}<div className="pagination"><button type="button" disabled={!noteOffset || busy} onClick={() => notePage(noteOffset - 20)}>上一页</button><span>第 {noteOffset/20+1} 页</span><button type="button" disabled={notes.length < 20 || busy} onClick={() => notePage(noteOffset + 20)}>下一页</button></div></aside>
                {note ? <Suspense fallback={<p role="status">正在打开编辑器…</p>}><NoteEditor key={`${note.id}:${recovery?.sessionId ?? "saved"}`} note={note} recovery={recovery} editorRef={editor} onSaved={() => { void reload(); }} /></Suspense> : <div className="empty-state">选择一篇笔记，或者开始新的记录。</div>}
              </div>
            </section>}
        </div>
      </div>
    </main>
  </div></ShortcutContext.Provider>;
}
