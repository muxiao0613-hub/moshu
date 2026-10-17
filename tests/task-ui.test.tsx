import { createRef } from 'react';
import { cleanup,render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach,expect,it,vi } from 'vitest';
import type { Task } from '../src/contracts';
import type { EditorHandle } from '../src/platform/NoteEditor';
import { TaskEditor } from '../src/platform/TaskEditor';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/lib/bridge',()=>({command:invoke,asAppError:(error: unknown)=>error}));
afterEach(()=>{cleanup();invoke.mockReset();vi.restoreAllMocks();});
const task: Task = {id:crypto.randomUUID(),title:'中文任务',description:'原说明',status:'notStarted',priority:'medium',dueDate:'2026-10-11',projectId:null,revision:3,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',deletedAt:null,overdue:false};
it('空白新任务尚未创建，离开空白表单不会写入数据库',async ()=>{
  const ref=createRef<EditorHandle>();render(<TaskEditor initial={null} projectId={null} projects={[]} editorRef={ref} onSaved={async()=>{}} onClose={()=>{}} />);
  expect(screen.getByText(/^尚未创建/)).toBeTruthy();expect(await ref.current!.flush()).toBe(true);expect(invoke).not.toHaveBeenCalled();
  await userEvent.type(screen.getByRole('textbox',{name:'任务标题'}),'待创建');expect(screen.getByText(/^尚未保存/)).toBeTruthy();
});
it('任务冲突保留本地字段，显式对照后使用最新 revision 重试',async ()=>{
  const saved=vi.fn(async ()=>{});let attempt=0;
  invoke.mockImplementation(async (name: string,input: Record<string,unknown>)=>{
    if(name==='get_task')return {...task,revision:4,description:'数据库稿'};
    if(name==='save_task'){attempt+=1;if(attempt===1)throw {code:'CONFLICT',message:'冲突',retryable:false,requestId:'test'};return {...task,...input,revision:5};}
    throw new Error('unexpected command');
  });
  const ref=createRef<EditorHandle>();render(<TaskEditor initial={task} projectId={null} projects={[]} editorRef={ref} onSaved={saved} onClose={()=>{}} />);
  const user=userEvent.setup();await user.clear(screen.getByRole('textbox',{name:'任务说明'}));await user.type(screen.getByRole('textbox',{name:'任务说明'}),'本地保留');
  await user.click(screen.getByRole('button',{name:'保存任务'}));await screen.findByRole('alert');
  expect((screen.getByRole('textbox',{name:'任务说明'}) as HTMLTextAreaElement).value).toBe('本地保留');expect(await ref.current?.flush()).toBe(false);expect(saved).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button',{name:'查看数据库任务'}));await user.click(await screen.findByRole('button',{name:'以版本 4 保存对照后的修改'}));
  await waitFor(()=>expect(saved).toHaveBeenCalledOnce());
  const requests=invoke.mock.calls.filter(call=>call[0]==='save_task');expect(requests[1]?.[1]).toMatchObject({baseRevision:4,description:'本地保留',dueDate:'2026-10-11'});
});
it('删除必须使用已展示的 revision，不能先读取最新版本再静默删除',async ()=>{
  invoke.mockRejectedValue({code:'CONFLICT',message:'已更新',retryable:false,requestId:'test'});
  render(<TaskEditor initial={task} projectId={null} projects={[]} editorRef={null} onSaved={async()=>{}} onClose={()=>{}} />);
  await userEvent.click(screen.getByRole('button',{name:'移入回收站'}));expect(invoke).not.toHaveBeenCalled();await userEvent.click(screen.getByRole('button',{name:'确认移入回收站'}));await screen.findByRole('alert');
  expect(invoke.mock.calls).toEqual([['set_task_deleted',{id:task.id,baseRevision:3,deleted:true}]]);
  expect((screen.getByRole('textbox',{name:'任务标题'}) as HTMLInputElement).value).toBe('中文任务');
});
it('切页冲刷保存本地日期字符串，并与在途保存共用一次请求',async ()=>{
  let finish: (value: Task)=>void=()=>{throw new Error('not started');};invoke.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const ref=createRef<EditorHandle>();render(<TaskEditor initial={task} projectId={null} projects={[]} editorRef={ref} onSaved={async()=>{}} onClose={()=>{}} />);
  await userEvent.type(screen.getByRole('textbox',{name:'任务说明'}),'追加');
  const first=ref.current!.flush();const second=ref.current!.flush();
  expect(invoke).toHaveBeenCalledOnce();expect(invoke.mock.calls[0]?.[1]).toMatchObject({baseRevision:3,dueDate:'2026-10-11',description:'原说明追加'});
  finish({...task,description:'原说明追加',revision:4});expect(await Promise.all([first,second])).toEqual([true,true]);
  await waitFor(()=>expect(screen.getByText('任务已保存。')).toBeTruthy());
});
