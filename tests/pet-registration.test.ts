import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import registration from '../src/platform/pet/assets/motion/registration.json';
import manifest from '../src/platform/pet/assets/motion/manifest.json';
it('校准参数对应实际交付的图集，每个动作的全部帧都有有限变换',()=>{
 for(const [id,clip] of Object.entries(manifest.clips)){
  const registered=registration.clips[id as keyof typeof registration.clips];
  const bytes=readFileSync(new URL('../src/platform/pet/assets/motion/'+clip.file,import.meta.url));
  expect(createHash('sha256').update(bytes).digest('hex'),id+' 需重新校准').toBe(registered.sha256);
  expect(registered.frames,id).toHaveLength(clip.frames);
  for(const frame of registered.frames){expect(Object.values(frame).every(Number.isFinite)).toBe(true);expect(frame.scaleX).toBeGreaterThan(.9);expect(frame.scaleX).toBeLessThanOrEqual(1);}
 }
});
