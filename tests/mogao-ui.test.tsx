import {afterAll,afterEach,beforeAll,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {EditorHandle} from '../src/platform/NoteEditor';
import {ChapterEditor} from '../src/modules/mogao/ChapterEditor';
import {MogaoWorkspace} from '../src/modules/mogao/MogaoWorkspace';
import {emptyWork} from '../src/modules/mogao/contracts';
import type {Chapter,Tree,Work} from '../src/modules/mogao/contracts';
const invoke=vi.hoisted(()=>vi.fn());vi.mock('../src/shared/lib/bridge',()=>({command:invoke,asAppError:(e:unknown)=>e}));
const rectangles=Object.getOwnPropertyDescriptor(Range.prototype,'getClientRects');const bounds=Object.getOwnPropertyDescriptor(Range.prototype,'getBoundingClientRect');
beforeAll(()=>{Object.defineProperty(Range.prototype,'getClientRects',{configurable:true,value:()=>[new DOMRect()]});Object.defineProperty(Range.prototype,'getBoundingClientRect',{configurable:true,value:()=>new DOMRect()});});
afterAll(()=>{if(rectangles)Object.defineProperty(Range.prototype,'getClientRects',rectangles);else Reflect.deleteProperty(Range.prototype,'getClientRects');if(bounds)Object.defineProperty(Range.prototype,'getBoundingClientRect',bounds);else Reflect.deleteProperty(Range.prototype,'getBoundingClientRect');});
afterEach(()=>{cleanup();invoke.mockReset();});
const work:Work={id:'work',fields:{...emptyWork,name:'测试长篇'},revision:1,settingsRevision:1,treeRevision:1,createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z',deletedAt:null};
const chapter:Chapter={id:'chapter-a',workId:work.id,title:'第一章',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'未改动原文'}]}]},plainText:'未改动原文',schemaVersion:1,revision:2,createdAt:work.createdAt,updatedAt:work.updatedAt,volumeId:null,position:0,status:'draft',wordCount:5};
const second:Chapter={...chapter,id:'chapter-b',title:'第二章',position:1};
const tree:Tree={work,volumes:[],chapters:[chapter,second].map(c=>({id:c.id,workId:c.workId,volumeId:null,title:c.title,position:c.position,status:c.status,revision:c.revision,wordCount:c.wordCount,deletedAt:null}))};
function backend(){invoke.mockImplementation(async(name:string,input:Record<string,unknown>)=>{if(name==='mogao_works')return [work];if(name==='mogao_tree')return tree;if(name==='mogao_chapter')return input.id===chapter.id?chapter:second;if(name==='mogao_settings'||name==='list_projects'||name==='list_resources')return [];if(name==='mogao_save_chapter'){const save=input.save as {baseRevision:number;clientEditSequence:number;id:string};return{entityId:save.id,savedRevision:save.baseRevision+1,clientEditSequence:save.clientEditSequence,savedAt:work.updatedAt};}return null;});}
it('章节保存使用所属作品和不可变快照，旧回执不会清除后续输入',async()=>{
 backend();let release:(value:unknown)=>void=()=>{};const original=invoke.getMockImplementation()!;invoke.mockImplementation((name,input)=>name==='mogao_save_chapter'?new Promise(resolve=>{release=resolve;}):original(name,input));
 const handle={current:null as EditorHandle|null};render(<ChapterEditor chapter={chapter} recovery={null} editorRef={handle} onSaved={()=>{}}/>);
 fireEvent.change(screen.getByRole('textbox',{name:'章节标题'}),{target:{value:'先提交的标题'}});fireEvent.click(screen.getByRole('button',{name:'保存并建立版本'}));await waitFor(()=>expect(invoke.mock.calls.some(c=>c[0]==='mogao_save_chapter')).toBe(true));
 fireEvent.change(screen.getByRole('textbox',{name:'章节标题'}),{target:{value:'保存期间的新标题'}});const captured=invoke.mock.calls.find(c=>c[0]==='mogao_save_chapter')?.[1];expect(captured.workId).toBe(work.id);expect(captured.save.title).toBe('先提交的标题');
 await act(async()=>{release({entityId:chapter.id,savedRevision:3,clientEditSequence:1,savedAt:work.updatedAt});});expect((screen.getByRole('textbox',{name:'章节标题'}) as HTMLInputElement).value).toBe('保存期间的新标题');expect(screen.getByRole('status').textContent).toBe('未保存');expect(invoke.mock.calls.find(c=>c[0]==='mogao_clear_draft')?.[1]).toEqual(expect.objectContaining({workId:work.id,id:chapter.id,throughSequence:1}));
});
it('切章先冲刷当前稿；保存失败时留在原章并保留编辑内容',async()=>{
 backend();const original=invoke.getMockImplementation()!;invoke.mockImplementation((name,input)=>name==='mogao_save_chapter'?Promise.reject({code:'DB_ERROR',message:'测试写入失败',retryable:true,requestId:'test'}):original(name,input));
 render(<MogaoWorkspace editorRef={{current:null}}/>);fireEvent.click(await screen.findByRole('button',{name:'打开作品'}));fireEvent.click(await screen.findByRole('button',{name:/第一章.*5 字/}));const title=await screen.findByRole('textbox',{name:'章节标题'});fireEvent.change(title,{target:{value:'未保存的修改'}});fireEvent.click(screen.getByRole('button',{name:/第二章.*5 字/}));await screen.findByText('测试写入失败');expect((screen.getByRole('textbox',{name:'章节标题'}) as HTMLInputElement).value).toBe('未保存的修改');expect(invoke.mock.calls.filter(c=>c[0]==='mogao_chapter').map(c=>c[1].id)).toEqual([chapter.id]);
});
it('发现恢复稿先要求选择处理方式，未确认时不写正文或覆盖恢复稿',async()=>{
 backend();const original=invoke.getMockImplementation()!;invoke.mockImplementation((name,input)=>name==='mogao_draft'?Promise.resolve({draft:{sessionId:'recovery-session',noteId:chapter.id,title:'待恢复稿',body:chapter.body,schemaVersion:1,baseRevision:1,clientEditSequence:7},updatedAt:work.updatedAt}):original(name,input));render(<MogaoWorkspace editorRef={{current:null}}/>);fireEvent.click(await screen.findByRole('button',{name:'打开作品'}));fireEvent.click(await screen.findByRole('button',{name:/第一章.*5 字/}));await screen.findByRole('heading',{name:'发现未提交的恢复稿'});expect(screen.queryByRole('textbox',{name:'章节正文'})).toBeNull();expect(invoke.mock.calls.some(c=>['mogao_save_chapter','mogao_write_draft','mogao_clear_draft'].includes(c[0]))).toBe(false);fireEvent.click(screen.getByRole('button',{name:'对照并恢复'}));await screen.findByText('本地编辑稿保留在下方。请查看数据库稿，手动合并后提交。');expect((screen.getByRole('textbox',{name:'章节标题'}) as HTMLInputElement).value).toBe('待恢复稿');
});
it('无正文修改时专注、行距和查找不制造保存，章节查找使用真实编辑器选区',async()=>{
 backend();render(<ChapterEditor chapter={chapter} recovery={null} editorRef={null} onSaved={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'专注写作'}));expect(screen.getByRole('region',{name:'章节编辑器'}).className).toContain('focus-mode');fireEvent.change(screen.getByRole('combobox',{name:'行距'}),{target:{value:'2.3'}});fireEvent.change(screen.getByRole('textbox',{name:'段落查找'}),{target:{value:'原文'}});fireEvent.click(screen.getByRole('button',{name:'下一个匹配'}));await waitFor(()=>expect(window.getSelection()?.toString()).toBe('原文'));expect(invoke.mock.calls).toHaveLength(0);
});
it('输入后调整目录先保存，并以保存后的章节版本提交调整',async()=>{
 let current={...chapter};backend();const original=invoke.getMockImplementation()!;
 invoke.mockImplementation(async(name,input)=>{if(name==='mogao_chapter')return current;if(name==='mogao_save_chapter'){current={...current,title:input.save.title,revision:3};return{entityId:chapter.id,savedRevision:3,clientEditSequence:input.save.clientEditSequence,savedAt:work.updatedAt};}if(name==='mogao_move_node'){current={...current,revision:4};return{...tree,chapters:tree.chapters.map(c=>c.id===current.id?{...c,title:current.title,revision:4}:c)};}return original(name,input);});
 render(<MogaoWorkspace editorRef={{current:null}}/>);fireEvent.click(await screen.findByRole('button',{name:'打开作品'}));fireEvent.click(await screen.findByRole('button',{name:/第一章.*5 字/}));fireEvent.change(await screen.findByRole('textbox',{name:'章节标题'}),{target:{value:'修改中的章名'}});fireEvent.click(screen.getByRole('button',{name:'调整章节 第一章'}));await screen.findByRole('button',{name:'保存目录调整'});expect((screen.getAllByRole('textbox',{name:'名称'})[1] as HTMLInputElement).value).toBe('修改中的章名');fireEvent.click(screen.getByRole('button',{name:'保存目录调整'}));await waitFor(()=>expect(invoke).toHaveBeenCalledWith('mogao_move_node',expect.objectContaining({id:chapter.id,baseRevision:3,title:'修改中的章名'})));
});

it('段落查找可跨粗体等富文本边界定位完整短语',async()=>{
 backend();const rich={...chapter,body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'长河'},{type:'text',text:'流过',marks:[{type:'bold'}]},{type:'text',text:'山村'}]}]},plainText:'长河流过山村'};render(<ChapterEditor chapter={rich} recovery={null} editorRef={null} onSaved={()=>{}}/>);fireEvent.change(screen.getByRole('textbox',{name:'段落查找'}),{target:{value:'长河流过山村'}});fireEvent.click(screen.getByRole('button',{name:'下一个匹配'}));await waitFor(()=>expect(window.getSelection()?.toString()).toBe('长河流过山村'));expect(invoke.mock.calls).toHaveLength(0);
});
