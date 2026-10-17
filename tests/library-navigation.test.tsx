import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import type {Ref} from 'react';
import {App} from '../src/app/App';
import {defaultPreferences} from '../src/contracts';
import type {EditorHandle} from '../src/platform/NoteEditor';
const {invoke,guard}=vi.hoisted(()=>({invoke:vi.fn(),guard:{allowed:true}}));
vi.mock('../src/shared/lib/bridge',()=>({command:invoke,asAppError:(e:unknown)=>e}));
vi.mock('../src/platform/ModuleWorkspace',async()=>{
 const React=await import('react');return {ModuleWorkspace:({editorRef,onLibrary}:{editorRef:Ref<EditorHandle|null>;onLibrary:()=>void})=>{
  React.useImperativeHandle(editorRef,()=>({flush:async()=>guard.allowed,checkpoint:async()=>false}));
  return <button onClick={onLibrary}>返回资料库</button>;
 }};
});
afterEach(()=>{cleanup();invoke.mockReset();guard.allowed=true;vi.unstubAllGlobals();});
function setup(){
 vi.stubGlobal('scrollTo',vi.fn());
 const entry={moduleId:'mogao',moduleName:'墨稿',kind:'mogao-studio-projects',id:'book',title:'资料库小说',description:'',wordCount:3,sectionCount:1,revision:1,updatedAt:'2026-10-17T00:00:00Z',disabled:false};
 const link={id:'link',kind:'link',name:'参考链接',description:'',source:'',url:'https://example.com/',folderId:null,revision:1,tags:[],projectIds:[],favorite:false,deletedAt:null,createdAt:entry.updatedAt,updatedAt:entry.updatedAt};
 const body={text:'原保存正文'};
 invoke.mockImplementation(async(name:string)=>{
  if(name==='startup_workspace')return {preferences:defaultPreferences,location:{page:'home',entityId:null},notice:null};
  if(name==='workspace_status')return {workspaceId:'workspace',schemaVersion:4,appVersion:'0.1.0',projectCount:0,noteCount:0};
  if(name==='dashboard')return {projects:[],notes:[],todayTasks:[],overdueTasks:[],today:'2026-10-17'};
  if(name==='list_module_library')return {items:[entry],hasMore:false,warnings:[]};
  if(name==='read_module_library')return {entry,sections:[{id:'chapter',title:'开篇',wordCount:3,revision:1}],selectedId:'chapter',title:'开篇',text:body.text,revision:1,editTarget:{moduleId:'mogao',workId:'book',kind:'mogao-studio-chapters',id:'chapter',title:'开篇',snippet:'',source:'资料库',revision:1,updatedAt:entry.updatedAt}};
  if(name==='search_workspace')return {items:[{kind:'link',id:'link',title:'参考链接',snippet:'',source:'资料',revision:1,updatedAt:entry.updatedAt}],hasMore:false,indexedAt:entry.updatedAt};
  if(name==='get_resource')return link;
  if(name==='list_resources')return [link];
  if(['list_jobs','list_notes','list_modules','list_folders','list_projects','list_document_sessions','list_note_drafts'].includes(name))return [];
  return null;
 });
 return body;
}
async function readBook(){
 render(<App/>);await screen.findByRole('heading',{name:'我的空间，让今天有条理。'});
 fireEvent.click(screen.getByRole('button',{name:'资料'}));
 fireEvent.click(await screen.findByRole('button',{name:/资料库小说/}));
 await screen.findByRole('heading',{name:'开篇'});
}
it('从小说阅读切到全局搜索后打开普通资料，不会被上次小说阅读位置遮住',async()=>{
 setup();await readBook();fireEvent.click(screen.getByRole('button',{name:'全局搜索'}));
 fireEvent.change(await screen.findByRole('textbox',{name:'关键词'}),{target:{value:'参考'}});
 fireEvent.click(await screen.findByRole('button',{name:/参考链接/}));
 await screen.findByRole('heading',{name:'资料详情'});
 expect(screen.queryByRole('heading',{name:'开篇'})).toBeNull();
 expect((screen.getByRole('textbox',{name:'名称'}) as HTMLInputElement).value).toBe('参考链接');
});
it('从资料库进模块后返回会等待保存，成功后留在原阅读位置并读取新稿',async()=>{
 const body=setup();await readBook();fireEvent.click(screen.getByRole('button',{name:'进入墨稿编辑'}));
 await screen.findByRole('button',{name:'返回资料库'});guard.allowed=false;
 fireEvent.click(screen.getByRole('button',{name:'返回资料库'}));await screen.findByText('当前编辑内容尚未保存，请处理后再切换。');
 expect(screen.queryByRole('heading',{name:'开篇'})).toBeNull();
 guard.allowed=true;body.text='保存完成后的新稿';fireEvent.click(screen.getByRole('button',{name:'返回资料库'}));
 await screen.findByText('保存完成后的新稿');expect(screen.getByRole('heading',{name:'开篇'})).toBeTruthy();
});
