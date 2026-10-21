import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MainNavigation,SectionNavigation} from '../src/app/Navigation';
import {defaultPreferences} from '../src/contracts';
import {DesktopPet} from '../src/platform/pet/DesktopPet';
import {PetWindow} from '../src/platform/pet/PetWindow';
import {PetDragController} from '../src/platform/pet/drag';
const {command,drag}=vi.hoisted(()=>({command:vi.fn(),drag:vi.fn(async()=>{})}));
vi.mock('../src/shared/lib/bridge',async original=>({...await original<typeof import('../src/shared/lib/bridge')>(),command}));
vi.mock('@tauri-apps/api/core',async original=>({...await original<typeof import('@tauri-apps/api/core')>(),isTauri:()=>false}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({startDragging:drag})}));
// The renderer's completion event drives the real posture queue; canvas timing is
// covered separately in motion-sprite.test.tsx.
vi.mock('../src/platform/pet/PetSprite',()=>({PetSprite:({mood,onComplete}:{mood:string;onComplete?:()=>void})=><svg role="img" aria-label={mood} onClick={event=>{event.stopPropagation();onComplete?.();}}/> }));
afterEach(()=>{cleanup();command.mockReset();drag.mockClear();vi.useRealTimers();});
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
 render(<DesktopPet/>);fireEvent.click(await screen.findByRole('button',{name:'开启桌宠'}));await screen.findByText('南华已在桌面上。');
 expect(command).toHaveBeenCalledWith('save_desktop_pet',{baseRevision:3,preferences:{...prefs,enabled:true}});
 command.mockImplementation(async name=>{if(name==='save_desktop_pet')throw {code:'DB_BUSY',message:'维护进行中',retryable:true,requestId:'test'};return {preferences:{...prefs,revision:4,enabled:true},visible:true};});
 fireEvent.click(screen.getByRole('button',{name:'收起桌宠'}));await screen.findByText('维护进行中');expect(screen.getByText('南华已在桌面上。')).toBeTruthy();
});
it('南华互动、休息、返回主窗口与收起，不触发正文或 AI 命令',async()=>{
 command.mockResolvedValue(null);render(<PetWindow/>);fireEvent.click(screen.getByRole('button',{name:/摸摸南华/}));await screen.findByText('嘿嘿，收到你的摸摸啦！');
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'休息一下'}));await screen.findByText('休息一下，灵感慢慢来。');
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'返回墨枢'}));await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'openWorkspace'}));
 fireEvent.click(screen.getByRole('button',{name:'收起桌宠'}));await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'hide'}));
 expect(command.mock.calls.every(([name])=>name==='pet_action')).toBe(true);
});
it('桌宠页可以打招呼，且只发送桌宠语义动作',async()=>{
 command.mockImplementation(async name=>name==='get_desktop_pet'?{preferences:{...prefs,enabled:true},visible:true}:null);
 render(<DesktopPet/>);fireEvent.click(await screen.findByRole('button',{name:'打个招呼'}));
 await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'greet'}));
 expect(command.mock.calls.every(([name])=>name==='get_desktop_pet'||name==='pet_action')).toBe(true);
});
it('单击只互动，双击返回墨枢',async()=>{
 command.mockResolvedValue(null);render(<PetWindow/>);
 const pet=screen.getByRole('button',{name:/摸摸南华/});
 fireEvent.click(pet,{detail:1});await screen.findByText('嘿嘿，收到你的摸摸啦！');
 fireEvent.click(pet,{detail:2});await waitFor(()=>expect(command).toHaveBeenCalledWith('pet_action',{action:'openWorkspace'}));
});
it('轻点不会移动窗口，实际拖动串行提交起点、移动和结束，避免旧请求覆盖新拖动',async()=>{
 command.mockResolvedValue(null);const dragController=new PetDragController(vi.fn());
 dragController.start({x:10,y:10});dragController.move({x:12,y:12});dragController.finish();expect(command).not.toHaveBeenCalled();
 dragController.start({x:30,y:40});dragController.move({x:50,y:60});dragController.move({x:70,y:80});dragController.finish();
 await waitFor(()=>expect(command).toHaveBeenCalledTimes(3));
 expect(command.mock.calls.map(([,input])=>input.phase)).toEqual(['start','move','end']);
 const id=command.mock.calls[0]![1].dragId;expect(command.mock.calls.every(([name,input])=>name==='pet_drag'&&input.dragId===id)).toBe(true);
 expect(command.mock.calls[0]![1]).toMatchObject({x:30,y:40});expect(command.mock.calls[1]![1]).toMatchObject({x:70,y:80});
});
it('摸摸后立刻休息不会被旧计时器唤醒，主动唤醒后可继续互动',()=>{
 vi.useFakeTimers();render(<PetWindow/>);
 fireEvent.click(screen.getByRole('button',{name:/摸摸南华/}));
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'休息一下'}));
 act(()=>vi.advanceTimersByTime(5000));
 expect(screen.getByRole('button',{name:/正在休息，点击唤醒/})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/正在休息，点击唤醒/}));
 expect(screen.getByText('我醒啦，继续陪你。')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:/摸摸南华/}));expect(screen.getByText('再摸一下也可以。')).toBeTruthy();
});
it('阅读模式被摸摸和招呼后恢复阅读，返回普通模式与菜单 Escape 可用',()=>{
 vi.useFakeTimers();render(<PetWindow/>);
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'一起看书'}));
 expect(screen.getByText('我看我的书，安静陪你写。')).toBeTruthy();
 fireEvent.click(screen.getByRole('img',{name:'sit-down'}));fireEvent.click(screen.getByRole('img',{name:'open-book'}));
 fireEvent.click(screen.getByRole('button',{name:/摸摸南华/}));act(()=>vi.advanceTimersByTime(4000));
 expect(screen.getByText('我看我的书，安静陪你写。')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'打个招呼'}));
 expect(screen.getByText('你好呀，我在这里！')).toBeTruthy();act(()=>vi.advanceTimersByTime(4000));
 expect(screen.getByText('我看我的书，安静陪你写。')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'放下书本'}));
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.keyDown(window,{key:'Escape'});
 expect(screen.queryByRole('navigation',{name:'桌宠操作'})).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:/摸摸南华/}));
 expect(command).not.toHaveBeenCalled();
});
it('二十种动作在设置页可独立预览，不改变桌面设置或发出阅读命令',async()=>{
 command.mockResolvedValue({preferences:prefs,visible:false});render(<DesktopPet/>);
 const picker=await screen.findByRole('group',{name:'形象预览'});
 expect(within(picker).getAllByRole('button')).toHaveLength(20);
 fireEvent.click(within(picker).getByRole('button',{name:'坐着阅读'}));
 expect(within(picker).getByRole('button',{name:'坐着阅读'}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('img',{name:'reading'})).toBeTruthy();
 expect(command.mock.calls.every(([name])=>name==='get_desktop_pet')).toBe(true);
});
it('拖动取消后结束会话并恢复休息状态，不残留拖动形象或把取消当作摸摸',async()=>{
 command.mockResolvedValue(null);render(<PetWindow/>);
 fireEvent.click(screen.getByRole('button',{name:'桌宠菜单'}));fireEvent.click(screen.getByRole('button',{name:'休息一下'}));
 const pet=screen.getByRole('button',{name:/正在休息，点击唤醒/});
 Object.assign(pet,{setPointerCapture:vi.fn(),hasPointerCapture:()=>false});
 const pointer=(type:string,x:number,y:number)=>fireEvent(pet,Object.assign(new Event(type,{bubbles:true}),{button:0,pointerId:1,screenX:x,screenY:y}));
 pointer('pointerdown',10,10);pointer('pointermove',50,50);
 expect(screen.getByRole('main').classList.contains('is-dragging')).toBe(true);
 pointer('pointercancel',50,50);
 expect(screen.getByRole('main').classList.contains('is-sit-down')).toBe(true);
 fireEvent.click(screen.getByRole('img',{name:'sit-down'}));fireEvent.click(screen.getByRole('img',{name:'drowsy'}));
 expect(screen.getByRole('main').classList.contains('is-sleeping')).toBe(true);
 expect(screen.getByRole('main').classList.contains('is-dragging')).toBe(false);
 await waitFor(()=>expect(command.mock.calls.map(([,input])=>input.phase)).toEqual(['start','move','end']));
 expect(command.mock.calls.every(([name])=>name==='pet_drag')).toBe(true);
});
it('原生命令缓慢时只保留最新指针，新拖动等待旧会话结束',async()=>{
 let release!:()=>void;const slow=new Promise<void>(resolve=>{release=resolve;});
 command.mockImplementation(async (_name,input)=>{if(input.phase==='start'&&!releaseStart){releaseStart=true;await slow;}});
 let releaseStart=false;const controller=new PetDragController(vi.fn());
 controller.start({x:0,y:0});controller.move({x:10,y:10});
 await waitFor(()=>expect(command).toHaveBeenCalledTimes(1));
 for(let x=20;x<=100;x++)controller.move({x,y:x});
 controller.finish();controller.start({x:200,y:200});controller.move({x:250,y:260});controller.finish();
 expect(command).toHaveBeenCalledTimes(1);release();
 await waitFor(()=>expect(command).toHaveBeenCalledTimes(6));
 expect(command.mock.calls.map(([,input])=>input.phase)).toEqual(['start','move','end','start','move','end']);
 expect(command.mock.calls[1]![1]).toMatchObject({x:100,y:100});expect(command.mock.calls[4]![1]).toMatchObject({x:250,y:260});
 expect(command.mock.calls[0]![1].dragId).not.toBe(command.mock.calls[3]![1].dragId);
});
