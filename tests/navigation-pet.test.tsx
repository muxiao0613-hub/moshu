import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MainNavigation,SectionNavigation} from '../src/app/Navigation';
import {defaultPreferences} from '../src/contracts';
import {DesktopPet} from '../src/platform/pet/DesktopPet';
import {PetWindow} from '../src/platform/pet/PetWindow';
import {PetDragController} from '../src/platform/pet/drag';
const {command,drag}=vi.hoisted(()=>({command:vi.fn(),drag:vi.fn(async()=>{})}));
vi.mock('../src/shared/lib/bridge',async original=>({...await original<typeof import('../src/shared/lib/bridge')>(),command}));
vi.mock('@tauri-apps/api/core',async original=>({...await original<typeof import('@tauri-apps/api/core')>(),isTauri:()=>false}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({startDragging:drag})}));
afterEach(()=>{cleanup();command.mockReset();drag.mockClear();});
const prefs={revision:3,enabled:false,alwaysOnTop:true,size:'medium' as const};
it('主导航只有五类，分类内保留项目/任务和资料/笔记入口，文档归入资料',async()=>{
 const navigate=vi.fn();const props={page:'tasks' as const,preferences:defaultPreferences,disabled:false,onNavigate:navigate};
 const main=render(<MainNavigation {...props}/>);const nav=screen.getByRole('navigation',{name:'主导航'});
 expect(within(nav).getAllByRole('button').map(button=>button.getAttribute('aria-label'))).toEqual(['首页','工作','资料','创作','工具']);
 expect(within(nav).getByRole('button',{name:'工作'}).getAttribute('aria-current')).toBe('page');main.unmount();
 const tabs=render(<SectionNavigation {...props} onModule={vi.fn()} activeModule={null} refreshKey="test"/>);
 fireEvent.click(screen.getByRole('button',{name:'项目'}));expect(navigate).toHaveBeenCalledWith('projects');expect(screen.getByRole('button',{name:'任务'}).getAttribute('aria-current')).toBe('page');
 tabs.rerender(<SectionNavigation {...props} page="document" onModule={vi.fn()} activeModule={null} refreshKey="test"/>);
 expect(screen.getByRole('button',{name:'资料库'}).getAttribute('aria-current')).toBe('page');fireEvent.click(screen.getByRole('button',{name:'笔记'}));expect(navigate).toHaveBeenLastCalledWith('notes');
});
it('创作分类可进入已启用模块，工具分类保留搜索/回收站/设置/帮助和桌宠',async()=>{
 command.mockResolvedValue([{id:'mogao',name:'墨稿',enabled:true}]);const open=vi.fn(async()=>{});const navigate=vi.fn();
 const props={preferences:defaultPreferences,disabled:false,onNavigate:navigate,onModule:open,activeModule:null,refreshKey:'test'};
 const page=render(<SectionNavigation {...props} page="modules"/>);fireEvent.click(await screen.findByRole('button',{name:'墨稿'}));expect(open).toHaveBeenCalledWith('mogao');
 page.rerender(<SectionNavigation {...props} page="pet"/>);
 expect(screen.getAllByRole('button').map(button=>button.textContent)).toEqual(['桌宠','搜索','回收站','设置','帮助']);
 fireEvent.click(screen.getByRole('button',{name:'设置'}));expect(navigate).toHaveBeenCalledWith('settings');
});
it('桌宠开启使用真实设置版本，写入失败后重新读取，不显示虚假成功',async()=>{
 command.mockImplementation(async name=>name==='get_desktop_pet'?{preferences:prefs,visible:false}:{preferences:{...prefs,revision:4,enabled:true},visible:true});
 render(<DesktopPet/>);fireEvent.click(await screen.findByRole('button',{name:'开启桌宠'}));await screen.findByText('小狐狸已在桌面上。');
 expect(command).toHaveBeenCalledWith('save_desktop_pet',{baseRevision:3,preferences:{...prefs,enabled:true}});
 command.mockImplementation(async name=>{if(name==='save_desktop_pet')throw {code:'DB_BUSY',message:'维护进行中',retryable:true,requestId:'test'};return {preferences:{...prefs,revision:4,enabled:true},visible:true};});
 fireEvent.click(screen.getByRole('button',{name:'收起桌宠'}));await screen.findByText('维护进行中');expect(screen.getByText('小狐狸已在桌面上。')).toBeTruthy();
});
it('小狐狸互动、休息、返回主窗口与收起，不触发正文或 AI 命令',async()=>{
 command.mockResolvedValue(null);render(<PetWindow/>);fireEvent.click(screen.getByRole('button',{name:/摸摸小狐狸/}));await screen.findByText('嘿嘿，收到你的摸摸啦！');
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'休息一下'}));await screen.findByText('休息一下，灵感慢慢来。');
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'返回墨枢'}));await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'openWorkspace'}));
 fireEvent.click(screen.getByRole('button',{name:'收起桌宠'}));await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'hide'}));
 expect(command.mock.calls.every(([name])=>name==='pet_action')).toBe(true);
});
it('轻点不会移动窗口，实际拖动串行提交起点、移动和结束，避免旧请求覆盖新拖动',async()=>{
 command.mockResolvedValue(null);const dragController=new PetDragController(vi.fn());
 dragController.start({x:10,y:10});dragController.move({x:12,y:12});dragController.finish();expect(command).not.toHaveBeenCalled();
 dragController.start({x:30,y:40});dragController.move({x:50,y:60});dragController.move({x:70,y:80});dragController.finish();
 await waitFor(()=>expect(command).toHaveBeenCalledTimes(4));
 expect(command.mock.calls.map(([,input])=>input.phase)).toEqual(['start','move','move','end']);
 const id=command.mock.calls[0]![1].dragId;expect(command.mock.calls.every(([name,input])=>name==='pet_drag'&&input.dragId===id)).toBe(true);
 expect(command.mock.calls[0]![1]).toMatchObject({x:30,y:40});expect(command.mock.calls[2]![1]).toMatchObject({x:70,y:80});
});
