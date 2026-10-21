import {expect,it} from 'vitest';
import {motionDuration,motionFrameAt} from '../src/platform/pet/timeline';
it('连续动作交界只缩短首尾停留，中间动作帧保持原时长且没有跳帧',()=>{
 const clip={frames:8,fps:10,loop:false};expect(motionDuration(clip)).toBe(710);
 expect(motionFrameAt(clip,0)).toBe(0);expect(motionFrameAt(clip,54)).toBe(0);expect(motionFrameAt(clip,56)).toBe(1);
 for(let i=1;i<7;i++)expect(motionFrameAt(clip,55+(i-1)*100+50)).toBe(i);
 expect(motionFrameAt(clip,660)).toBe(7);expect(motionFrameAt(clip,10000)).toBe(7);
});
it('稳态循环不加速，按原周期连续循环',()=>{
 const clip={frames:6,fps:3,loop:true};expect(motionDuration(clip)).toBeCloseTo(2000);
 expect(motionFrameAt(clip,1999)).toBe(5);expect(motionFrameAt(clip,2001)).toBe(0);
});
