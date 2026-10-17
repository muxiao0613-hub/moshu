import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentSave, DocumentSession, Resource } from '../src/contracts';
import { DocumentEditingSession } from '../src/shared/editor/document-session';
import { DocumentEditor } from '../src/platform/DocumentEditor';
import { Resources } from '../src/platform/Resources';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
afterEach(cleanup); beforeEach(() => { invoke.mockReset(); });
const resource: Resource = { id:'c462b559-d451-4086-afec-4802de1a2a68',revision:1,kind:'file',name:'文档.md',originalName:'文档.md',description:'',source:'采集来源',folderId:null,url:null,favorite:false,tags:[],projectIds:[],size:0,mimeType:'text/plain',sha256:'original',createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',deletedAt:null };
const session: DocumentSession = { id:'1c07aaff-21fa-42a8-a797-e8e753b96fca',resourceId:resource.id,baseRevision:1,filename:'文档.md',format:'md',markdown:'原文',editSequence:0,updatedAt:resource.updatedAt,changed:false };
function receipt(sequence: number, revision: number, text: string | null): DocumentSave { return {resource:{...resource,revision},session:{...session,baseRevision:revision,markdown:text,editSequence:sequence},receipt:{entityId:resource.id,savedRevision:revision,clientEditSequence:sequence,savedAt:resource.updatedAt}}; }
function deferred<T>() { let resolve: (value: T) => void = () => {}; const promise = new Promise<T>(done => {resolve = done;}); return {promise,resolve}; }
it('文件保存中的后续输入保留，离开前继续串行提交正确的版本和序号', async () => {
  const first = deferred<DocumentSave>();
  invoke.mockImplementation((name, {input}) => name === 'write_markdown_draft' ? Promise.resolve({...session,markdown:input.text,editSequence:input.editSequence}) : input.editSequence === 1 ? first.promise : Promise.resolve(receipt(2,3,'后续输入')));
  const editor = new DocumentEditingSession(resource,session); editor.edit('第一稿'); const saving = editor.save();
  await waitFor(() => expect(invoke).toHaveBeenCalledWith('commit_document_edit',{input:expect.objectContaining({editSequence:1,baseRevision:1})}));
  editor.edit('后续输入'); first.resolve(receipt(1,2,'第一稿')); expect(await saving).toBe(true); expect(editor.state().text).toBe('后续输入'); expect(editor.state().dirty).toBe(true);
  expect(await editor.flush()).toBe(true); expect(editor.state().resource.revision).toBe(3); expect(editor.state().text).toBe('后续输入');
  expect(invoke).toHaveBeenLastCalledWith('commit_document_edit',{input:expect.objectContaining({editSequence:2,baseRevision:2})});
});
it('冲突和错误回执保留输入，恢复草稿先于提交，组合输入期间不提交', async () => {
  invoke.mockImplementation((name,{input}) => name === 'write_markdown_draft' ? Promise.resolve({...session,markdown:input.text,editSequence:input.editSequence}) : Promise.reject({code:'CONFLICT',message:'内容已更新',retryable:false,requestId:'test'}));
  const editor = new DocumentEditingSession(resource,session); editor.edit('本地稿'); editor.composing(true); expect(await editor.flush()).toBe(false); expect(invoke).not.toHaveBeenCalled();editor.composing(false);
  expect(await editor.save()).toBe(false); expect(editor.state().text).toBe('本地稿');expect(editor.state().dirty).toBe(true);expect(invoke.mock.calls.map(call => call[0])).toEqual(['write_markdown_draft','commit_document_edit']);
  invoke.mockResolvedValueOnce({...session,markdown:'本地稿',editSequence:1}).mockResolvedValueOnce(receipt(99,2,'本地稿'));
  expect(await editor.save()).toBe(false);expect(editor.state().text).toBe('本地稿');expect(editor.state().resource.revision).toBe(1);
});
it('Markdown 编辑、受控预览和放弃会话使用墨枢命令，结束后切页不再提交已删除会话', async () => {
  invoke.mockImplementation((name,{input}) => {
    if (name === 'preview_markdown') return Promise.resolve('<h1>预览内容</h1>');
    if (name === 'write_markdown_draft') return Promise.resolve({...session,markdown:input.text,editSequence:input.editSequence});
    return Promise.resolve(null);
  });
  const onBack = vi.fn();const editorRef = {current:null};
  render(<DocumentEditor resource={resource} session={session} editorRef={editorRef} onBack={onBack} onSaved={async()=>{}} onCopy={async()=>{}} />);
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown 源文'}),{target:{value:'# 新的中文'}});await screen.findByRole('heading',{name:'预览内容'});
  fireEvent.click(screen.getByRole('button',{name:'结束编辑会话'}));fireEvent.click(screen.getByRole('button',{name:'放弃会话修改并结束'}));await waitFor(()=>expect(onBack).toHaveBeenCalled());
  expect(invoke.mock.calls.some(call=>call[0]==='commit_document_edit')).toBe(false);
  expect(await (editorRef.current as unknown as {flush:()=>Promise<boolean>}).flush()).toBe(true);
});
it('Office 编辑明确打开持久副本，保存并结束必须先提交完整文件', async () => {
  const office = {...session,markdown:null,format:'xlsx',filename:'表格.xlsx'};
  const file = {...resource,name:'表格.xlsx',originalName:'表格.xlsx'};
  invoke.mockImplementation((name) => {
    if (name === 'list_office_editors') return Promise.resolve([{id:'excel',name:'Microsoft Excel',formats:['xlsx']}]);
    if (name === 'read_document') return Promise.resolve({resourceId:resource.id,sourceRevision:1,format:'xlsx',html:null,blocks:[],blockCount:0,sheets:['结果'],table:null,warnings:[]});
    if (name === 'commit_document_edit') return Promise.resolve({...receipt(0,2,null),resource:{...file,revision:2},session:{...office,baseRevision:2}});
    return Promise.resolve(null);
  });
  const back = vi.fn();render(<DocumentEditor resource={file} session={office} editorRef={{current:null}} onBack={back} onSaved={async()=>{}} onCopy={async()=>{}} />);
  await screen.findByRole('option',{name:'Microsoft Excel'});fireEvent.click(screen.getByRole('button',{name:'打开编辑副本'}));await screen.findByText('已发送打开请求。请在 Office 中保存并关闭，再回到这里提交；未出现窗口时请检查编辑器安装。');
  expect(invoke).toHaveBeenCalledWith('open_document_editor',{input:expect.objectContaining({id:office.id,editorId:'excel'})});
  fireEvent.click(screen.getByRole('button',{name:'结束编辑会话'}));fireEvent.click(screen.getByRole('button',{name:'先保存并结束'}));await waitFor(()=>expect(back).toHaveBeenCalled());
  const calls=invoke.mock.calls.map(call=>call[0]);expect(calls.indexOf('commit_document_edit')).toBeLessThan(calls.indexOf('end_document_edit'));
});
it('另存等待期间的后续输入保持未提交，不被副本成功回执清除或切页', async () => {
  const copying = deferred<Resource>(); const opened = vi.fn(async()=>{});
  invoke.mockImplementation((name,{input}) => {
    if (name === 'write_markdown_draft') return Promise.resolve({...session,markdown:input.text,editSequence:input.editSequence});
    if (name === 'copy_document_edit') return copying.promise;
    if (name === 'preview_markdown') return Promise.resolve('');
    return Promise.resolve(null);
  });
  render(<DocumentEditor resource={resource} session={session} editorRef={{current:null}} onBack={()=>{}} onSaved={async()=>{}} onCopy={opened} />);
  const source = screen.getByRole('textbox',{name:'Markdown 源文'});
  fireEvent.change(source,{target:{value:'副本内容'}});
  fireEvent.click(screen.getByRole('button',{name:'另存为副本'}));
  await waitFor(()=>expect(invoke).toHaveBeenCalledWith('copy_document_edit',{input:expect.objectContaining({id:session.id})}));
  fireEvent.change(source,{target:{value:'后续输入'}}); copying.resolve({...resource,id:'copied-id'});
  await screen.findByText('副本已创建；另存期间的后续输入保留在当前文档，请继续保存。');
  expect((source as HTMLTextAreaElement).value).toBe('后续输入'); expect(opened).not.toHaveBeenCalled();
  expect(screen.getByText('副本已创建 · 后续输入仍在当前文档')).toBeDefined();
});
it('资料库新建 Word 文件后直接进入统一编辑入口并传递项目归属', async () => {
  invoke.mockImplementation((name) => {
    if (name === 'create_document') return Promise.resolve({...resource,originalName:'新文档.docx'});
    return Promise.resolve([]);
  });
  const opened = vi.fn(async()=>{});render(<Resources projectId="project-id" onOpenDocument={opened} onOpenNote={async()=>{}} onCreateNote={async()=>{}} onChanged={async()=>{}} />);
  fireEvent.click(screen.getByRole('button',{name:'新建文档'}));fireEvent.change(screen.getByLabelText('文档名称'),{target:{value:'新文档'}});fireEvent.change(screen.getByLabelText('文件格式'),{target:{value:'docx'}});fireEvent.click(screen.getByRole('button',{name:'创建并编辑'}));
  await waitFor(()=>expect(opened).toHaveBeenCalledWith(resource.id));expect(invoke).toHaveBeenCalledWith('create_document',{input:expect.objectContaining({name:'新文档',format:'docx',projectId:'project-id',folderId:null})});
});
