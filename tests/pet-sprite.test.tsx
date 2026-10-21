import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PetSprite} from '../src/platform/pet/PetSprite';

// Exercise the legacy image/vector fallback independently of the atlas renderer.
vi.mock('../src/platform/pet/motion',async original=>({...await original<typeof import('../src/platform/pet/motion')>(),motionClip:()=>null}));

vi.mock('../src/platform/pet/sprites',()=>({
  spriteFrames:{idle:['/idle-a.png','/idle-b.png'],happy:['/happy.png']},
  frameRate:{idle:2,happy:2,sleeping:1,waving:2,dragging:1,reading:2},
  moodLabels:{idle:'待机',happy:'摸摸',sleeping:'休息',waving:'招呼',dragging:'拖动',reading:'阅读'},
}));
let reduced=false;
let motionChanged:(()=>void)|undefined;
beforeEach(()=>{
  vi.useFakeTimers();reduced=false;
  vi.stubGlobal('matchMedia',()=>({get matches(){return reduced;},addEventListener:(_event:string,listener:()=>void)=>{motionChanged=listener;},removeEventListener:vi.fn()}));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('状态切换立即显示新图；图片失败先回退待机，再回退矢量，不留下破图',()=>{
  const page=render(<PetSprite mood="idle"/>);
  expect(screen.getByRole('img').getAttribute('src')).toBe('/idle-a.png');
  act(()=>vi.advanceTimersByTime(500));expect(screen.getByRole('img').getAttribute('src')).toBe('/idle-b.png');
  page.rerender(<PetSprite mood="happy"/>);expect(screen.getByRole('img').getAttribute('src')).toBe('/happy.png');
  fireEvent.error(screen.getByRole('img'));expect(screen.getByRole('img').getAttribute('src')).toMatch(/^\/idle-[ab]\.png$/);
  fireEvent.error(screen.getByRole('img'));fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img').tagName.toLowerCase()).toBe('svg');
});
it('系统减少动态效果即时停在首帧，恢复后继续播放',()=>{
  render(<PetSprite mood="idle"/>);act(()=>vi.advanceTimersByTime(500));
  expect(screen.getByRole('img').getAttribute('src')).toBe('/idle-b.png');
  act(()=>{reduced=true;motionChanged?.();});act(()=>vi.advanceTimersByTime(2000));
  expect(screen.getByRole('img').getAttribute('src')).toBe('/idle-a.png');
  expect(vi.getTimerCount()).toBe(0);
  act(()=>{reduced=false;motionChanged?.();});act(()=>vi.advanceTimersByTime(500));
  expect(vi.getTimerCount()).toBe(1);
});
it('窗口隐藏时停止图片轮播，重新显示后恢复；缺失状态使用待机图',()=>{
  const visible=vi.spyOn(document,'visibilityState','get');visible.mockReturnValue('visible');
  const page=render(<PetSprite mood="sleeping"/>);expect(screen.getByRole('img').getAttribute('src')).toBe('/idle-a.png');
  act(()=>{visible.mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));});
  expect(vi.getTimerCount()).toBe(0);
  act(()=>{visible.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});
  expect(vi.getTimerCount()).toBe(1);
  page.unmount();expect(vi.getTimerCount()).toBe(0);
});
it('回退图片的过渡在隐藏时不提前完成，恢复后只通知一次',()=>{
 const visible=vi.spyOn(document,'visibilityState','get');visible.mockReturnValue('hidden');const complete=vi.fn();
 render(<PetSprite mood="waving" onComplete={complete}/>);act(()=>vi.advanceTimersByTime(5000));expect(complete).not.toHaveBeenCalled();
 act(()=>{visible.mockReturnValue('visible');document.dispatchEvent(new Event('visibilitychange'));});act(()=>vi.advanceTimersByTime(1000));expect(complete).toHaveBeenCalledTimes(1);
});
