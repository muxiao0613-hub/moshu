import {afterEach,beforeEach,expect,it,vi} from 'vitest';
class FakeImage {
 static created:FakeImage[]=[];
 naturalWidth=1280;naturalHeight=960;decoding='';src='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;
 decode=vi.fn(async()=>{});
 constructor(){FakeImage.created.push(this);}
}
beforeEach(()=>{vi.resetModules();FakeImage.created=[];vi.stubGlobal('Image',FakeImage);});
afterEach(()=>vi.unstubAllGlobals());
it('重复和进行中的图集共享解码；32 MiB 缓存优先保留最近使用的动作',async()=>{
 const {loadMotionSheet}=await import('../src/platform/pet/motion');
 const first=loadMotionSheet('/a');expect(loadMotionSheet('/a')).toBe(first);expect(FakeImage.created).toHaveLength(1);
 FakeImage.created[0]!.onload!();await first;
 for(let i=0;i<5;i++){const pending=loadMotionSheet('/atlas-'+i);FakeImage.created.at(-1)!.onload!();await pending;}
 expect(FakeImage.created).toHaveLength(6);expect(loadMotionSheet('/a')).toBe(first);
 const last=loadMotionSheet('/new');FakeImage.created.at(-1)!.onload!();await last;
 expect(loadMotionSheet('/a')).toBe(first);
 void loadMotionSheet('/atlas-0');expect(FakeImage.created).toHaveLength(8);
});
it('被淘汰的旧解码失败不能删除后来重试的缓存项',async()=>{
 const {loadMotionSheet}=await import('../src/platform/pet/motion');
 const old=loadMotionSheet('/retry');const oldImage=FakeImage.created[0]!;const failed=old.catch(()=>null);
 for(let i=0;i<8;i++)void loadMotionSheet('/pending-'+i);
 const retry=loadMotionSheet('/retry');oldImage.onerror!();await failed;
 expect(loadMotionSheet('/retry')).toBe(retry);expect(FakeImage.created).toHaveLength(10);
 FakeImage.created.at(-1)!.onload!();await retry;
});
