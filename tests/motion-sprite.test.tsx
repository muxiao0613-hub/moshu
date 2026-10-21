import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MotionSprite} from '../src/platform/pet/MotionSprite';
import type {MotionClip} from '../src/platform/pet/motion';
const {load}=vi.hoisted(()=>({load:vi.fn()}));
vi.mock('../src/platform/pet/motion',()=>({loadMotionSheet:load}));
let now=100;let frames:Map<number,FrameRequestCallback>;let nextId=0;
const draws=vi.fn();const clear=vi.fn();
const clip:MotionClip={id:'waving',url:'/waving.webp',frames:8,columns:4,rows:2,fps:10,loop:false,renderScale:1};
const image={naturalWidth:1280,naturalHeight:960} as HTMLImageElement;
async function tick(ms:number){await act(async()=>{now+=ms;const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(now));});}
beforeEach(()=>{
 now=100;frames=new Map();nextId=0;draws.mockClear();clear.mockClear();load.mockReset();load.mockResolvedValue(image);
 vi.spyOn(performance,'now').mockImplementation(()=>now);
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draws,clearRect:clear,globalAlpha:1,globalCompositeOperation:'source-over'} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue({width:200,height:300} as DOMRect);
 vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++nextId,cb);return nextId;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('按经过时间绘制帧，非循环只完成一次，切动作后旧回调不能推进新动作',async()=>{
 const complete=vi.fn();const start=vi.fn();const page=render(<MotionSprite clip={clip} sequence={1} label="挥手" onComplete={complete} onStart={start} onError={vi.fn()}/>);
 await act(async()=>{});await tick(220);
 const stale=[...frames.values()];
 expect(draws.mock.calls.some(args=>args[0]===image&&args[1]===640&&args[2]===0)).toBe(true);
 await tick(600);expect(complete).toHaveBeenCalledTimes(1);expect(start).toHaveBeenCalledTimes(1);expect(frames.size).toBe(0);
 page.rerender(<MotionSprite clip={{...clip,url:'/new.webp'}} sequence={2} label="新动作" onComplete={complete} onError={vi.fn()}/>);
 await act(async()=>{});await act(async()=>stale.forEach(cb=>cb(now+1000)));expect(complete).toHaveBeenCalledTimes(1);
 await tick(810);expect(complete).toHaveBeenCalledTimes(2);
});
it('隐藏暂停时间，恢复继续；减少动态效果直接完成过渡且不启动循环',async()=>{
 const visibility=vi.spyOn(document,'visibilityState','get');visibility.mockReturnValue('visible');const complete=vi.fn();
 render(<MotionSprite clip={clip} sequence={1} label="挥手" onComplete={complete} onError={vi.fn()}/>);await act(async()=>{});await tick(200);
 act(()=>{visibility.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});expect(frames.size).toBe(0);await tick(10000);expect(complete).not.toHaveBeenCalled();
 act(()=>{visibility.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});await act(async()=>{});await tick(610);expect(complete).toHaveBeenCalledTimes(1);
 cleanup();vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 render(<MotionSprite clip={clip} sequence={2} label="挥手" onComplete={complete} onError={vi.fn()}/>);await act(async()=>{});expect(complete).toHaveBeenCalledTimes(2);expect(frames.size).toBe(0);
});
it('解码期间保留旧画面，失败通知回退；无 Canvas 支持也通知回退',async()=>{
 let reject!:(error:Error)=>void;load.mockReturnValue(new Promise((_resolve,no)=>{reject=no;}));const failure=vi.fn();
 const page=render(<MotionSprite clip={clip} sequence={1} label="挥手" onError={failure}/>);expect(screen.getByRole('img').tagName).toBe('CANVAS');expect(clear).not.toHaveBeenCalled();
 await act(async()=>reject(new Error('decode')));expect(failure).toHaveBeenCalledTimes(1);
 page.unmount();vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
 render(<MotionSprite clip={clip} sequence={1} label="挥手" onError={failure}/>);expect(failure).toHaveBeenCalledTimes(2);
});
it('同一帧不重复清屏绘制，任一时刻只画一张完全不透明的姿态',async()=>{
 render(<MotionSprite clip={{...clip,id:'idle',loop:true,fps:3}} sequence={1} label="呼吸" onError={vi.fn()}/>);await act(async()=>{});
 for(let i=0;i<19;i++)await tick(16);
 expect(draws).toHaveBeenCalledTimes(1);expect(clear).toHaveBeenCalledTimes(1);
 await tick(40);expect(draws).toHaveBeenCalledTimes(2);expect(clear).toHaveBeenCalledTimes(2);
 expect(screen.getByRole('img').classList.contains('is-breathing')).toBe(true);
});
it('以校准后的脚底基线绘制姿态；下一动作解码期间不清除上一画面',async()=>{
 const placements=Array.from({length:8},()=>({x:12,y:-4,scaleX:.95,scaleY:.98}));
 const page=render(<MotionSprite clip={{...clip,placements}} sequence={1} label="挥手" onError={vi.fn()}/>);await act(async()=>{});
 expect(draws.mock.calls[0]!.slice(5)).toEqual([7.5,-2.5,190,294]);
 let resolve!:(image:HTMLImageElement)=>void;load.mockReturnValue(new Promise(yes=>{resolve=yes;}));const before=clear.mock.calls.length;
 page.rerender(<MotionSprite clip={{...clip,url:'/next.webp'}} sequence={2} label="下个动作" onError={vi.fn()}/>);
 act(()=>window.dispatchEvent(new Event('resize')));expect(clear).toHaveBeenCalledTimes(before);
 await act(async()=>resolve(image));expect(clear).toHaveBeenCalledTimes(before+1);expect(draws).toHaveBeenCalledTimes(before+1);
});
it('不同动作及缩放使用同一屏幕头部锚点，不在交界横跳',async()=>{
 const page=render(<MotionSprite clip={{...clip,anchorX:180}} sequence={1} label="拿书" onError={vi.fn()}/>);await act(async()=>{});
 const a=draws.mock.calls.at(-1)!;const firstHead=a[5]+180/320*a[7];
 page.rerender(<MotionSprite clip={{...clip,url:'/reading.webp',anchorX:140,renderScale:.7}} sequence={2} label="阅读" onError={vi.fn()}/>);await act(async()=>{});
 const b=draws.mock.calls.at(-1)!;const secondHead=b[5]+140/320*b[7];
 expect(secondHead).toBeCloseTo(firstHead);expect(clear).toHaveBeenCalledTimes(2);
});
