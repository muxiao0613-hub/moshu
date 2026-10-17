import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {LibraryReader,ModuleLibrary} from '../src/platform/ModuleLibrary';
import {Resources} from '../src/platform/Resources';
import {ModuleWorkspace} from '../src/platform/ModuleWorkspace';
import type {LibraryEntry,LibraryReading,ReadLibrary} from '../src/contracts';
const {command,win}=vi.hoisted(()=>({command:vi.fn(),win:{isFullscreen:vi.fn(async()=>false),setFullscreen:vi.fn(async(value:boolean)=>{void value;}),onResized:vi.fn(async(cb:()=>void)=>{void cb;return ()=>{};})}}));
vi.mock('../src/shared/lib/bridge',async original=>({...await original<typeof import('../src/shared/lib/bridge')>(),command}));
vi.mock('@tauri-apps/api/core',async original=>({...await original<typeof import('@tauri-apps/api/core')>(),isTauri:()=>true}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>win}));
afterEach(()=>{cleanup();command.mockReset();win.isFullscreen.mockReset();win.isFullscreen.mockResolvedValue(false);win.setFullscreen.mockClear();});
const entry:LibraryEntry={moduleId:'mogao',moduleName:'墨稿',kind:'mogao-studio-projects',id:'book',title:'归乡',description:'渡桥归来',wordCount:26,sectionCount:2,revision:1,updatedAt:'2026-10-17T04:00:00Z',disabled:false};
const target:ReadLibrary={moduleId:'mogao',kind:entry.kind,id:entry.id,sectionId:null};
const view:LibraryReading={entry,sections:[{id:'ch1',title:'第一章',wordCount:13,revision:2},{id:'ch2',title:'第二章',wordCount:13,revision:1}],selectedId:'ch1',title:'第一章',text:'桥边第一段。\n\n桥边第二段。',revision:2,editTarget:{moduleId:'mogao',workId:'book',kind:'mogao-studio-chapters',id:'ch1',title:'第一章',snippet:'',source:'资料库',revision:2,updatedAt:entry.updatedAt,disabled:false}};
it('资料库自动列出作品，选中即可阅读并跳到同一章编辑',async()=>{
 command.mockImplementation(async(name:string)=>name==='list_module_library'?{items:[entry],hasMore:false,warnings:[]}:name==='read_module_library'?view:[]);
 const selected=vi.fn();const edited=vi.fn(async()=>{});
 const page=render(<ModuleLibrary keyword="归乡" onSelect={selected}/>);
 fireEvent.click(await screen.findByRole('button',{name:/归乡/}));expect(selected).toHaveBeenCalledWith(entry);page.unmount();
 render(<LibraryReader target={target} onTarget={vi.fn()} onBack={vi.fn()} onEdit={edited}/>);
 await screen.findByText('桥边第一段。 桥边第二段。',{exact:false});
 fireEvent.click(screen.getByRole('button',{name:'进入墨稿编辑'}));await waitFor(()=>expect(edited).toHaveBeenCalledWith(view.editTarget));
});
it('资料库中可以切章，读取失败时不会继续显示另一章的旧正文',async()=>{
 command.mockResolvedValue(view);const change=vi.fn();
 const page=render(<LibraryReader target={target} onTarget={change} onBack={vi.fn()}/>);
 await screen.findByRole('heading',{name:'第一章'});fireEvent.click(screen.getByRole('button',{name:/第二章/}));expect(change).toHaveBeenCalledWith({...target,sectionId:'ch2'});
 command.mockRejectedValue({code:'NOT_FOUND',message:'该章已删除',retryable:false,requestId:'test'});
 page.rerender(<LibraryReader target={{...target,sectionId:'ch2'}} onTarget={change} onBack={vi.fn()}/>);
 await screen.findByText('该章已删除');expect(screen.queryByText(/桥边第一段/)).toBeNull();
});
it('资料库页面提供作品阅读，停用模块时仍显示正文并阻止编辑',async()=>{
 command.mockImplementation(async(name:string)=>name==='list_module_library'?{items:[entry],hasMore:false,warnings:[]}:name==='read_module_library'?{...view,entry:{...entry,disabled:true},editTarget:{...view.editTarget,disabled:true}}:[]);
 const remember=vi.fn();render(<Resources onLibrarySelected={remember} onOpenModule={vi.fn()} onOpenNote={vi.fn()} onCreateNote={vi.fn()} onChanged={vi.fn()}/>);
 fireEvent.click(await screen.findByRole('button',{name:/归乡/}));await screen.findByRole('heading',{name:'第一章'});
 expect((screen.getByRole('button',{name:'进入墨稿编辑'}) as HTMLButtonElement).disabled).toBe(true);expect(remember).toHaveBeenCalledWith(target);
 fireEvent.click(screen.getByRole('button',{name:'返回资料库列表'}));await screen.findByRole('heading',{name:'资料库'});expect(remember).toHaveBeenLastCalledWith(null);
});
it('写作台提供资料库返回和可逆的系统全屏按钮',async()=>{
 command.mockResolvedValue({state:'ready'});const back=vi.fn();const expanded=vi.fn();let full=false;
 win.isFullscreen.mockImplementation(async()=>full);win.setFullscreen.mockImplementation(async(value:boolean)=>{full=value;});
 render(<ModuleWorkspace id="sample" pages={[{id:'sample',Component:()=> <h2>写作空间</h2>}]} editorRef={{current:null}} onBack={vi.fn()} onLibrary={back} onExpandedChange={expanded}/>);
 await screen.findByRole('heading',{name:'写作空间'});expect(win.setFullscreen).not.toHaveBeenCalled();expect(expanded).toHaveBeenLastCalledWith(false);fireEvent.click(screen.getByRole('button',{name:'全屏'}));await screen.findByRole('button',{name:'退出全屏'});expect(win.setFullscreen).toHaveBeenCalledWith(true);expect(expanded).toHaveBeenLastCalledWith(true);
 fireEvent.click(screen.getByRole('button',{name:'退出全屏'}));await screen.findByRole('button',{name:'全屏'});expect(win.setFullscreen).toHaveBeenLastCalledWith(false);expect(expanded).toHaveBeenLastCalledWith(false);
 fireEvent.click(screen.getByRole('button',{name:'返回资料库'}));expect(back).toHaveBeenCalledOnce();
});
