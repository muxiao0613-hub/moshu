import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const {host}=vi.hoisted(()=>({host:vi.fn()}));
vi.mock('../integrations/mogao/src/host/bridge',()=>({host}));
const storage=Object.getOwnPropertyDescriptor(window,'localStorage');
beforeEach(()=>{vi.resetModules();host.mockReset();});
afterEach(()=>{if(storage)Object.defineProperty(window,'localStorage',storage);});
describe('ported Mogao uses the native host',()=>{
 it('exports paragraph boundaries and literal entities without active markup',async()=>{
  const {exportPlainText}=await import('../integrations/mogao/src/host/plainText');
  expect(exportPlainText('<p>第一段 &amp; 灯</p><p>第二段<br>续行 &lt;归家&gt;</p><script>ignored()</script>')).toBe('第一段 & 灯\n\n第二段\n续行 <归家>');
 });
 it('hydrates preferences and recovery drafts, flushes ordered writes, and retries failed writes',async()=>{
  host.mockResolvedValueOnce({mogao_chapter_backup_test:'saved draft'});
  const {installStorage,flushStorage}=await import('../integrations/mogao/src/host/storage');
  await installStorage();expect(localStorage.getItem('mogao_chapter_backup_test')).toBe('saved draft');
  host.mockRejectedValueOnce(new Error('busy')).mockResolvedValue(undefined);
  localStorage.setItem('mogao_chapter_backup_test','new recovery');
  await flushStorage();expect(host).toHaveBeenLastCalledWith('api',{method:'POST',path:'/local-state',data:{key:'mogao_chapter_backup_test',value:'new recovery'}});
  localStorage.setItem('mogao_theme','dark');localStorage.removeItem('mogao_theme');await flushStorage();
  expect(localStorage.getItem('mogao_theme')).toBeNull();
  expect(()=>localStorage.setItem('mogao_api_key','secret')).toThrow('密钥');
 });
 it('sends observed revisions and preserves conflict remote bodies for the existing comparison UI',async()=>{
  const {apiClient}=await import('../integrations/mogao/src/api/client');
  host.mockResolvedValueOnce({id:'chapter',revision:3,content:'old'});
  await apiClient.get('/projects/book/chapters/chapter');
  host.mockResolvedValueOnce({id:'chapter',revision:4,content:'new'});
  await apiClient.patch('/projects/book/chapters/chapter',{content:'new'});
  expect(host.mock.calls[1]?.[1]).toMatchObject({method:'PATCH',baseRevision:3,data:{content:'new'}});
  host.mockRejectedValueOnce({message:'conflict',code:'CONFLICT',details:{remote:{id:'chapter',revision:5,content:'remote'}}});
  await expect(apiClient.patch('/projects/book/chapters/chapter',{content:'later'})).rejects.toMatchObject({response:{status:409,data:{code:'DRAFT_CONFLICT',remote:{content:'remote'}}}});
  host.mockResolvedValueOnce({id:'chapter',revision:6,content:'resolved'});
  await apiClient.patch('/projects/book/chapters/chapter',{content:'resolved',baseContent:'remote'});
  expect(host.mock.lastCall?.[1]).toMatchObject({baseRevision:5});
 });
 it('streams native chunks to existing generation consumers',async()=>{
  const {nativeClient}=await import('../integrations/mogao/src/host/ai');
  const control=new AbortController();
  host.mockImplementation(async(op,_input,options)=>{if(op==='ai'){options.chunk({choices:[{delta:{content:'远山'}}]});options.chunk({choices:[{delta:{content:'初雪'}}]});return null;}});
  const stream=await nativeClient().chat.completions.create({model:'test',messages:[],stream:true},{signal:control.signal});
  let text='';for await(const chunk of stream)text+=chunk.choices[0]?.delta.content;
  expect(text).toBe('远山初雪');expect(host).toHaveBeenCalledWith('ai',expect.anything(),expect.objectContaining({id:expect.any(String),chunk:expect.any(Function)}));
  control.abort();
 });
});
