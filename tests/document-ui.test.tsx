import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DocumentView, Resource } from '../src/contracts';
import { DocumentPreview } from '../src/platform/DocumentPreview';
import { ResourceDetail } from '../src/platform/ResourceDetail';
import fixture from './fixtures/contracts.json';
const invoke=vi.hoisted(()=>vi.fn());
vi.mock('../src/shared/lib/bridge',async original=>({...await original<typeof import('../src/shared/lib/bridge')>(),command:invoke}));
afterEach(()=>{cleanup();invoke.mockReset();});
const resource: Resource={id:fixture.document.resourceId,revision:2,kind:'file',name:'结果.xlsx',originalName:'结果.xlsx',description:'',source:'采集来源',folderId:null,url:null,favorite:false,tags:[],projectIds:[],size:123,mimeType:'application/octet-stream',sha256:'test',createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z',deletedAt:null};
const view: DocumentView={...fixture.document,blocks:[]};
it('资料详情复用文档阅读，工作表切换重置行列页并显示缓存公式',async ()=>{
  invoke.mockResolvedValue(view);
  render(<ResourceDetail initial={resource} folders={[]} projects={[]} onChanged={async()=>{}} onOpenNote={async()=>{}} onClose={()=>{}} />);
  await screen.findByText('中文数据');expect(invoke.mock.calls.every(call=>call[0]==='read_document')).toBe(true);
  fireEvent.click(screen.getByText('公式'));expect(screen.getByText('1+2')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'下一页内容'}));await waitFor(()=>expect(invoke).toHaveBeenLastCalledWith('read_document',expect.objectContaining({offset:50,baseRevision:2})));
  await screen.findByText('中文数据');fireEvent.click(screen.getByRole('button',{name:'下一组列'}));await waitFor(()=>expect(invoke).toHaveBeenLastCalledWith('read_document',expect.objectContaining({columnOffset:10})));
  await screen.findByText('中文数据');fireEvent.change(screen.getByLabelText('工作表'),{target:{value:'1'}});await waitFor(()=>expect(invoke).toHaveBeenLastCalledWith('read_document',expect.objectContaining({sheetIndex:1,offset:0,columnOffset:0})));
});
it('Word 正文和表格作为 React 文字展示，保留中文并不解释原文字为 HTML',async ()=>{
  invoke.mockResolvedValue({...view,format:'docx',sheets:[],table:null,blockCount:2,blocks:[{kind:'paragraph',text:'中文标题',level:1},{kind:'table',rows:[['字段','内容'],['说明','<img src=x onerror=alert(1)>']]}]});
  const {container}=render(<DocumentPreview resource={{...resource,originalName:'报告.docx'}} />);
  await screen.findByRole('heading',{name:'中文标题'});expect(screen.getByRole('cell',{name:'<img src=x onerror=alert(1)>'})).toBeTruthy();expect(container.querySelector('img')).toBeNull();
});
it('失败明确保留原文件，重试成功且迟到旧页不能覆盖新的阅读结果',async ()=>{
  let finish:(value:DocumentView)=>void=()=>{};
  invoke.mockRejectedValueOnce({code:'IO_ERROR',message:'校验失败，原文件保留',retryable:true,requestId:'test'}).mockResolvedValueOnce(view).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({...view,sourceRevision:3,table:{...view.table!,rows:[[{text:'最新源版本',valueType:'text',formula:null}]]}});
  const {rerender}=render(<DocumentPreview resource={resource} />);await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'重试'}));await screen.findByText('中文数据');
  fireEvent.click(screen.getByRole('button',{name:'下一页内容'}));await waitFor(()=>expect(invoke).toHaveBeenCalledTimes(3));
  // Change the source revision while a page is in flight; the previous generation must be ignored.
  rerender(<DocumentPreview resource={{...resource,revision:3}} />);
  await screen.findByText('最新源版本');finish(view);await waitFor(()=>expect(screen.queryByText('中文数据')).toBeNull());
});
