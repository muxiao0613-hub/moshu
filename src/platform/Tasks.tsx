import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { Project, Task, TaskPage, TaskStatus, TaskView } from '../contracts';
import type { EditorHandle } from './NoteEditor';
import { command, asAppError } from '../shared/lib/bridge';
import { loadProjects } from '../shared/lib/catalog';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { TaskEditor, taskFields, statusLabels, priorityLabels } from './TaskEditor';
export function Tasks({initialTaskId, onSelected, initialProjectId, editorRef}: {initialTaskId?:string|null; onSelected?:(id:string|null)=>void; initialProjectId: string | null; editorRef: Ref<EditorHandle>}) {
  const [page,setPage] = useState<TaskPage>({items:[],today:'',hasMore:false});
  const [projects,setProjects] = useState<Project[]>([]);
  const [selected,setSelected] = useState<Task | null>(null);const [editing,setEditing] = useState(false);
  useEffect(()=>{if(initialTaskId){void command('get_task',{id:initialTaskId}).then(task=>{setSelected(task);setEditing(true);}).catch(e=>setError(asAppError(e)));}},[initialTaskId]);
  useEffect(()=>{if(editing&&selected)onSelected?.(selected.id);},[selected,editing,onSelected]);
  const [view,setView] = useState<TaskView>('all');const [status,setStatus] = useState<TaskStatus | ''>('');
  const [projectId,setProjectId] = useState(initialProjectId ?? '');const [date,setDate] = useState('');
  const [keyword,setKeyword] = useState('');const [search,setSearch] = useState('');const [offset,setOffset] = useState(0);
  const [busy,setBusy] = useState(false);const running = useRef(false);const [loading,setLoading] = useState(true);
  const [error,setError] = useState<ReturnType<typeof asAppError> | null>(null);const generation = useRef(0);
  const query = useMemo(() => ({offset,limit:20,view,status:status || null,dueDate:date || null,projectId:projectId || null,keyword:search}),[offset,view,status,date,projectId,search]);
  useEffect(() => {const timer = window.setTimeout(() => {setSearch(keyword);setOffset(0);},250);return () => window.clearTimeout(timer);},[keyword]);
  const reload = useCallback(async () => {
    const current = ++generation.current;setLoading(true);
    try {
      const [result,catalog] = await Promise.all([command('query_tasks',query),loadProjects()]);
      if (current === generation.current) {setPage(result);setProjects(catalog);setError(null);}
    } catch (error) {if (current === generation.current) setError(asAppError(error));}
    finally {if (current === generation.current) setLoading(false);}
  },[query]);
  useEffect(() => {void reload();return () => {generation.current += 1;};},[reload]);
  useEffect(() => {
    const refresh = () => {if (!document.hidden) void reload();};
    const timer = window.setInterval(refresh,60_000);document.addEventListener('visibilitychange',refresh);
    return () => {window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
  },[reload]);
  async function action(work: () => Promise<void>) {
    if (running.current) return;running.current = true;setBusy(true);setError(null);
    try {await work();await reload();} catch (error) {setError(asAppError(error));}
    finally {running.current = false;setBusy(false);}
  }
  if (editing) return <TaskEditor key={selected?.id ?? 'new'} initial={selected} projectId={projectId || null} projects={projects} editorRef={editorRef} onClose={() => {setEditing(false);onSelected?.(null);setSelected(null);void reload();}} onSaved={async task => {setSelected(task);await reload();}} />;
  return <section>
    <div className="page-heading"><div><p className="eyebrow">把想法变成行动</p><h1>任务</h1><p className="muted">今日：{page.today || '正在读取'} · 截止日期以本地日历日期保存，已完成任务不会标为逾期。</p></div><button type="button" className="primary" disabled={loading || busy} onClick={() => {setSelected(null);setEditing(true);}}>新建任务</button></div>
    <div className="task-views" aria-label="任务视图">{([['all','全部'],['today','今日'],['overdue','逾期'],['completed','已完成']] as const).map(([key,label]) => <button type="button" key={key} disabled={busy} aria-pressed={view === key} className={view === key ? 'selected' : ''} onClick={() => {setView(key);setOffset(0);}}>{label}</button>)}</div>
    <div className="filter-bar"><label>状态筛选<select value={status} onChange={event => {setStatus(event.target.value as typeof status);setOffset(0);}}><option value="">全部状态</option>{Object.entries(statusLabels).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>截止日筛选<input type="date" min="0001-01-01" max="9999-12-31" value={date} onChange={event => {setDate(event.target.value);setOffset(0);}} /></label><label>项目筛选<select value={projectId} onChange={event => {setProjectId(event.target.value);setOffset(0);}}><option value="">全部项目</option>{projectId && !projects.some(project => project.id === projectId) && <option value={projectId}>项目不可用（请清除筛选）</option>}{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>关键字<input maxLength={200} placeholder="标题或说明" value={keyword} onChange={event => setKeyword(event.target.value)} /></label></div>
    <ErrorMessage error={error} retry={() => {void reload();}} />
    {loading ? <p role="status">正在读取任务…</p> : <div className="task-list">{page.items.map(task => <article key={task.id} className="task-row"><div><h2>{task.title}</h2><p>{task.description || '暂无说明'}</p><div className="task-meta"><span>{statusLabels[task.status]}</span><span className={`priority-${task.priority}`}>{priorityLabels[task.priority]}优先级</span><span className={task.overdue ? 'overdue' : ''}>{task.dueDate ?? '无截止日期'}{task.overdue ? ' · 已逾期' : ''}</span>{task.projectId && <span>{projects.find(project => project.id === task.projectId)?.name ?? '已删除项目'}</span>}</div></div><div className="card-actions"><button type="button" disabled={busy} onClick={() => {setSelected(task);setEditing(true);}}>编辑任务</button><button type="button" disabled={busy} onClick={() => {void action(async () => {await command('save_task',{...taskFields(task),id:task.id,baseRevision:task.revision,status:task.status === 'completed' ? 'notStarted' : 'completed'});});}}>{task.status === 'completed' ? '重新打开' : '完成任务'}</button></div></article>)}{!page.items.length && <div className="empty-state">没有符合条件的任务。</div>}</div>}
    <div className="pagination"><button type="button" disabled={loading || busy || !offset} onClick={() => setOffset(offset-20)}>上一页</button><span>第 {offset/20+1} 页 · 按优先级、截止日排序</span><button type="button" disabled={loading || busy || !page.hasMore} onClick={() => setOffset(offset+20)}>下一页</button></div>
  </section>;
}
