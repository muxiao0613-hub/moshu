import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Note } from '../src/contracts';
import { NoteEditor } from '../src/platform/NoteEditor';
// jsdom has no layout engine. Supply geometry only; editor selection, commands,
// JSON, save sequencing and bridge calls remain real and are asserted below.
const rects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
const bounds = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
beforeAll(() => {
  Object.defineProperty(Range.prototype, 'getClientRects', {configurable:true,value: () => [new DOMRect()]});
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable:true,value: () => new DOMRect()});
});
afterAll(() => {
  if (rects) Object.defineProperty(Range.prototype, 'getClientRects', rects); else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  if (bounds) Object.defineProperty(Range.prototype, 'getBoundingClientRect', bounds); else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
});
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/lib/bridge', () => ({command: invoke, asAppError: (error: unknown) => error}));
afterEach(() => {cleanup(); invoke.mockReset();});
const note: Note = {id: crypto.randomUUID(),title: '笔记',body: {type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'原文'}]}]},plainText:'原文',schemaVersion:1,revision:2,createdAt:'2026-10-11T00:00:00Z',updatedAt:'2026-10-11T00:00:00Z'};
it('打开编辑器及导出期间的可编辑状态切换不会制造用户修改或额外保存', async () => {
  invoke.mockResolvedValue(null);
  render(<NoteEditor note={note} editorRef={null} onSaved={() => {}} />);
  expect(screen.getByRole('status').textContent).toBe('已保存');
  await userEvent.click(screen.getByRole('button',{name:'导出 TXT'}));
  await waitFor(() => expect(screen.getByText('笔记副本已导出。')).toBeTruthy());
  expect(invoke.mock.calls).toEqual([['export_note',{id:note.id,baseRevision:2,format:'txt'}]]);
  expect(screen.getAllByRole('status')[0]?.textContent).toBe('已保存');
});
it('恢复旧版本更新真实编辑器正文且不会把加载内容误认为新输入', async () => {
  const next: Note = {...note,revision:3,title:'历史标题',plainText:'历史正文',body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'历史正文'}]}]}};
  invoke.mockImplementation(async (name: string) => {
    if (name === 'list_note_versions') return [{id:'version',noteId:note.id,title:'历史标题',sourceRevision:1,createdAt:note.createdAt}];
    if (name === 'get_note_version') return {summary:{id:'version',noteId:note.id,title:'历史标题',sourceRevision:1,createdAt:note.createdAt},body:next.body,plainText:next.plainText,schemaVersion:1};
    if (name === 'restore_note_version') return next;
    return null;
  });
  render(<NoteEditor note={note} editorRef={null} onSaved={() => {}} />);
  await userEvent.click(screen.getByRole('button',{name:'历史版本'}));
  await userEvent.click(await screen.findByRole('button',{name:/历史标题 · 版本 1/}));
  await userEvent.click(screen.getByRole('button',{name:'恢复此版本'}));
  await waitFor(() => expect(screen.getByRole('textbox',{name:'笔记正文'}).textContent).toBe('历史正文'));
  expect((screen.getByRole('textbox',{name:'笔记标题'}) as HTMLInputElement).value).toBe('历史标题');
  expect(invoke.mock.calls.some(call => call[0] === 'save_note' || call[0] === 'write_note_draft')).toBe(false);
  expect(invoke.mock.calls.find(call => call[0] === 'restore_note_version')).toEqual(['restore_note_version',{id:note.id,versionId:'version',baseRevision:2}]);
});

it('链接工具栏通过真实 Tiptap 输出可保存的完整链接属性', async () => {
  invoke.mockImplementation(async (name: string, input: Record<string, unknown>) => {
    if (name === 'save_note') return {entityId: note.id, savedRevision: Number(input.baseRevision)+1,clientEditSequence: input.clientEditSequence,savedAt:note.updatedAt};
    return null;
  });
  render(<NoteEditor note={note} editorRef={null} onSaved={() => {}} />);
  screen.getByRole('textbox',{name:'笔记正文'}).focus();
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.click(screen.getByRole('button',{name:'链接'}));
  await userEvent.type(screen.getByRole('textbox',{name:'链接地址'}),'https://doc.rust-lang.org/book/');
  await userEvent.click(screen.getByRole('button',{name:'应用链接'}));
  await userEvent.click(screen.getByRole('button',{name:'保存并建立版本'}));
  await waitFor(() => expect(invoke.mock.calls.some(call => call[0] === 'save_note')).toBe(true));
  const saved = invoke.mock.calls.find(call => call[0] === 'save_note')?.[1];
  const json = JSON.stringify(saved?.body);
  expect(json).toContain('https://doc.rust-lang.org/book/');
  expect(json).toContain('"title":null');
});
