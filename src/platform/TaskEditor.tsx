import { useImperativeHandle, useRef, useState } from 'react';
import type { Ref } from 'react';
import type { Project, Task, TaskFields } from '../contracts';
import type { EditorHandle } from './NoteEditor';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
export function taskFields(task: Task): TaskFields { return {title:task.title,description:task.description,status:task.status,priority:task.priority,dueDate:task.dueDate,projectId:task.projectId}; }
export const statusLabels = {notStarted:'未开始',inProgress:'进行中',completed:'已完成'};
export const priorityLabels = {low:'低',medium:'中',high:'高'};
export function TaskEditor({initial, projectId, projects, editorRef, onSaved, onClose}: {initial: Task | null; projectId: string | null; projects: Project[]; editorRef: Ref<EditorHandle>; onSaved: (task: Task) => Promise<void>; onClose: () => void}) {
  const [task,setTask] = useState(initial);
  const taskRef = useRef(initial); taskRef.current = task;
  const defaults: TaskFields = {title:'',description:'',status:'notStarted',priority:'medium',dueDate:null,projectId};
  const [fields,setFields] = useState<TaskFields>(() => initial ? taskFields(initial) : defaults);
  const [busy,setBusy] = useState(false);
  const active = useRef<Promise<boolean> | null>(null);
  const fieldsRef = useRef(fields); fieldsRef.current = fields;
  const [error,setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [current,setCurrent] = useState<Task | null>(null);
  const [notice,setNotice] = useState('');
  const [confirmation,setConfirmation] = useState<'close' | 'delete' | null>(null);
  const dirty = JSON.stringify(fields) !== JSON.stringify(task ? taskFields(task) : defaults);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  async function save(baseRevision = task?.revision): Promise<boolean> {
    if (active.current) return active.current;
    if (task?.deletedAt) return !dirtyRef.current;
    const snapshot = {...fieldsRef.current};
    setBusy(true);setError(null);setNotice('');
    const work = (async () => {
      try {
        const saved = task && baseRevision !== undefined ? await command('save_task',{...snapshot,id:task.id,baseRevision}) : await command('create_task',snapshot);
        if (task && saved.revision !== (baseRevision ?? task.revision)+1) throw new Error('Invalid task receipt');
        taskRef.current = saved;setTask(saved);setFields(taskFields(saved));setCurrent(null);setNotice('任务已保存。');
        await onSaved(saved);return true;
      } catch (error) {setError(asAppError(error));return false;}
      finally {setBusy(false);active.current = null;}
    })();
    active.current = work;return work;
  }
  useImperativeHandle(editorRef, () => ({flush: async () => {
    if (active.current) return active.current;
    if (!dirtyRef.current) return true;
    if (error?.code === 'CONFLICT') return false;
    return save();
  },checkpoint: async () => !dirtyRef.current}));
  function edit<K extends keyof TaskFields>(key: K,value: TaskFields[K]) {setFields(prev => ({...prev,[key]:value}));setNotice('');}
  async function deletion(deleted: boolean) {
    if (!task || active.current) return;
    if (dirty && !await save()) return;
    // Use only the revision this editor has acknowledged, never silently rebase deletion.
    const latest = taskRef.current;
    if (!latest) return;
    setBusy(true);setError(null);
    const work = (async () => {
      try {
        const next = await command('set_task_deleted',{id:latest.id,baseRevision:latest.revision,deleted});
        taskRef.current = next;setTask(next);setFields(taskFields(next));setCurrent(null);
        setNotice(deleted ? '任务已移入回收站。' : '任务已恢复。');await onSaved(next);return true;
      } catch (error) {setError(asAppError(error));return false;}
      finally {setBusy(false);active.current = null;}
    })();
    active.current = work;await work;
  }

  async function compare() {
    if (!task) return;
    try {setCurrent(await command('get_task',{id:task.id}));}
    catch (error) {setError(asAppError(error));}
  }
  return <section className="task-editor" aria-label="任务编辑器">
    <div className="section-heading"><h2>{task ? '编辑任务' : '新建任务'}</h2><button type="button" disabled={busy} onClick={() => {if (dirty) setConfirmation('close'); else onClose();}}>返回任务列表</button></div>
    <ErrorMessage error={error} />{notice && <p role="status">{notice}</p>}
    {confirmation && <div className="conflict-panel" role="alert"><p>{confirmation === 'delete' ? '将任务移入回收站？可在当前编辑器撤销删除。' : '放弃尚未保存的任务修改？'}</p><button type="button" disabled={busy} onClick={() => {const action = confirmation;setConfirmation(null);if (action === 'delete') void deletion(true);else onClose();}}>{confirmation === 'delete' ? '确认移入回收站' : '确认放弃修改'}</button><button type="button" disabled={busy} onClick={() => setConfirmation(null)}>取消</button></div>}
    {task?.deletedAt ? <div className="empty-state"><p>任务已移入回收站，原项目关联保留。</p><button type="button" disabled={busy} onClick={() => {void deletion(false);}}>撤销删除</button></div> : <>
      <p className="muted">{dirty ? '尚未保存' : task ? '已保存' : '尚未创建'}{task ? ` · 版本 ${task.revision}` : ''} · 离开页面前会保存编辑内容。截止日期按本地日历日期处理。</p>
      <form onSubmit={event => {event.preventDefault();void save();}}><fieldset className="form-grid two-columns" disabled={busy}>
        <label>任务标题<input required value={fields.title} maxLength={200} onChange={event => edit('title',event.target.value)} /></label>
        <label>状态<select value={fields.status} onChange={event => edit('status',event.target.value as TaskFields['status'])}>{Object.entries(statusLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>优先级<select value={fields.priority} onChange={event => edit('priority',event.target.value as TaskFields['priority'])}>{Object.entries(priorityLabels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>截止日期<input type="date" min="0001-01-01" max="9999-12-31" value={fields.dueDate ?? ''} onChange={event => edit('dueDate',event.target.value || null)} /><small className="muted">留空表示没有截止日期。</small></label>
        <label>关联项目<select value={fields.projectId ?? ''} onChange={event => edit('projectId',event.target.value || null)}><option value="">无项目</option>{fields.projectId && !projects.some(project => project.id === fields.projectId) && <option value={fields.projectId}>已删除项目（保留关联）</option>}{projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.status === 'archived' ? ' · 已归档' : ''}</option>)}</select></label>
        <label>任务说明<textarea value={fields.description} maxLength={8192} onChange={event => edit('description',event.target.value)} /></label>
        <button className="primary" type="submit" disabled={error?.code === 'CONFLICT'}>保存任务</button>
        {task && <button type="button" onClick={() => setConfirmation('delete')}>移入回收站</button>}
      </fieldset></form>
      {error?.code === 'CONFLICT' && <div className="conflict-panel"><p>编辑内容保留在上方。请对照数据库记录后提交。</p><button type="button" disabled={busy} onClick={() => {void compare();}}>查看数据库任务</button>
        {current && <div><strong>{current.title} · 版本 {current.revision}</strong><p>{statusLabels[current.status]} · {priorityLabels[current.priority]}优先级 · {current.dueDate ?? '无截止日期'}</p><pre>{current.description}</pre><button type="button" disabled={busy || !!current.deletedAt} onClick={() => {void save(current.revision);}}>以版本 {current.revision} 保存对照后的修改</button></div>}
      </div>}
    </>}
  </section>;
}
