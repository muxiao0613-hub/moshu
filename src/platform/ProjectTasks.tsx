import { useCallback, useEffect, useState } from 'react';
import type { Task } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';
import { statusLabels, priorityLabels } from './TaskEditor';
export function ProjectTasks({id,onOpen}: {id: string;onOpen: (id: string) => Promise<void>}) {
  const [tasks,setTasks] = useState<Task[]>([]);const [error,setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const load = useCallback(async () => {
    try {const result = await command('query_tasks',{offset:0,limit:5,view:'all',status:null,dueDate:null,projectId:id,keyword:''});setTasks(result.items);setError(null);}
    catch (error) {setError(asAppError(error));}
  },[id]);
  useEffect(() => {void load();},[load]);
  return <section className="project-tasks"><div className="section-heading"><h2>项目任务</h2><button type="button" onClick={() => {void onOpen(id);}}>查看或新建项目任务</button></div><ErrorMessage error={error} retry={() => {void load();}} />
    {tasks.map(task => <div className="project-task" key={task.id}><strong>{task.title}</strong><span>{statusLabels[task.status]} · {priorityLabels[task.priority]}优先级 · {task.dueDate ?? '无截止日期'}{task.overdue ? ' · 已逾期' : ''}</span></div>)}{!tasks.length && !error && <p className="muted">这个项目还没有任务。</p>}
  </section>;
}
