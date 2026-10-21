import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useCompanionActions} from '../src/platform/pet/useCompanionActions';
vi.mock('../src/platform/pet/motion',async original=>({...await original<typeof import('../src/platform/pet/motion')>(),preloadMotion:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();});
function companion(automatic=false){
 const hook=renderHook(()=>useCompanionActions(automatic));
 const finish=()=>act(()=>hook.result.current.complete(hook.result.current.playback.sequence));
 const mood=()=>hook.result.current.playback.mood;
 return {...hook,finish,mood};
}
it('阅读先坐下打开书，互动先合书起身，结束再坐下继续阅读',()=>{
 const c=companion();act(()=>c.result.current.settle('read'));
 expect(c.mood()).toBe('sit-down');c.finish();expect(c.mood()).toBe('open-book');c.finish();expect(c.mood()).toBe('reading');
 act(()=>c.result.current.react('happy'));
 for(const expected of ['close-book','stand-up','happy','sit-down','open-book','reading']){expect(c.mood()).toBe(expected);if(expected!=='reading')c.finish();}
});
it('快速切换只在当前过渡完成后采用最新请求，旧完成回调不能跳过动作',()=>{
 const c=companion();act(()=>c.result.current.settle('read'));const old=c.result.current.playback.sequence;
 act(()=>{c.result.current.settle('sleep');c.result.current.settle('stand');});
 expect(c.mood()).toBe('sit-down');c.finish();expect(c.mood()).toBe('stand-up');
 act(()=>c.result.current.complete(old));expect(c.mood()).toBe('stand-up');c.finish();expect(c.mood()).toBe('idle');
});
it('睡眠需坐下犯困，醒来揉眼再起身；拖动释放先落地再恢复阅读',()=>{
 const c=companion();act(()=>c.result.current.settle('sleep'));
 expect(c.mood()).toBe('sit-down');c.finish();expect(c.mood()).toBe('drowsy');c.finish();expect(c.mood()).toBe('sleeping');
 act(()=>c.result.current.settle('stand'));expect(c.mood()).toBe('waking');c.finish();expect(c.mood()).toBe('stand-up');c.finish();
 act(()=>c.result.current.settle('read'));c.finish();c.finish();
 act(()=>c.result.current.beginDrag());expect(c.mood()).toBe('dragging');
 act(()=>c.result.current.endDrag());expect(c.mood()).toBe('landing');c.finish();expect(c.mood()).toBe('sit-down');c.finish();c.finish();expect(c.mood()).toBe('reading');
});
it('阅读定时翻页，禁用自动动作后无定时器；拖动时的最新休息请求被保留',()=>{
 vi.useFakeTimers();const c=companion(true);act(()=>c.result.current.settle('read'));c.finish();c.finish();
 act(()=>vi.advanceTimersByTime(12000));expect(c.mood()).toBe('turn-page');c.finish();expect(c.mood()).toBe('reading');
 act(()=>c.result.current.beginDrag());act(()=>c.result.current.settle('sleep'));act(()=>c.result.current.endDrag(true));
 expect(c.mood()).toBe('sit-down');c.finish();c.finish();expect(c.mood()).toBe('sleeping');expect(vi.getTimerCount()).toBe(0);
});
it('稳定阅读时已预热合书和起身，而非等用户切换后才开始加载',async()=>{
 const {preloadMotion}=await import('../src/platform/pet/motion');const c=companion();act(()=>c.result.current.settle('read'));c.finish();c.finish();
 vi.mocked(preloadMotion).mockClear();
 // Re-enter reading to exercise its idle-time exit preloading.
 act(()=>c.result.current.react('happy'));for(let i=0;i<5;i++)c.finish();
 await act(async()=>{});
 expect(c.mood()).toBe('reading');expect(preloadMotion).toHaveBeenCalledWith('close-book');expect(preloadMotion).toHaveBeenCalledWith('stand-up');
});
