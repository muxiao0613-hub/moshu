import { describe, expect, it, vi } from 'vitest';
import type { Note, SaveNote, SaveReceipt } from '../src/contracts';
import { SaveSession } from '../src/shared/editor/save-session';

const note: Note = { id: '22222222-2222-4222-8222-222222222222', title: '中文笔记', body: { type: 'doc', content: [{ type: 'paragraph' }] },
  plainText: '', schemaVersion: 1, revision: 1, createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' };
const body = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const receipt = (input: SaveNote): SaveReceipt => ({ entityId: input.id, savedRevision: input.baseRevision + 1, clientEditSequence: input.clientEditSequence, savedAt: '2026-10-11T01:00:00Z' });

describe('保存会话', () => {
  it('迟到回执只确认其快照，后续输入保持未保存，下一次使用新 revision', async () => {
    let finish: (receipt: SaveReceipt) => void = () => { throw new Error('not started'); };
    const persist = vi.fn<(input: SaveNote) => Promise<SaveReceipt>>().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(async input => receipt(input));
    const session = new SaveSession(note, persist, () => {});
    session.edit('笔记', body('第一份')); const saving = session.save();
    session.edit('笔记', body('后续输入')); const first = persist.mock.calls[0]?.[0];
    if (!first) throw new Error('Missing request');
    expect(first.body).toEqual(body('第一份')); finish(receipt(first));
    expect(await saving).toBe(true); expect(session.state.dirty).toBe(true); expect(session.state.status).toBe('dirty');
    expect(await session.flush()).toBe(true); expect(session.state.dirty).toBe(false);
    expect(persist.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 2, clientEditSequence: 2, body: body('后续输入') });
  });
  it('并发保存串行执行，同一快照不重复提交', async () => {
    const persist = vi.fn(async (input: SaveNote) => receipt(input));
    const session = new SaveSession(note, persist, () => {}); session.edit('笔记', body('中文'));
    expect(await Promise.all([session.save(), session.save(), session.flush()])).toEqual([true, true, true]);
    expect(persist).toHaveBeenCalledTimes(1);
  });
  it('冲突保留本地输入，并阻止切页冲刷与重复覆盖', async () => {
    const persist = vi.fn(async () => { throw { code: 'CONFLICT', message: '冲突', retryable: false, requestId: 'test', details: { currentRevision: 2 } }; });
    const session = new SaveSession(note, persist, () => {}); session.edit('笔记', body('本地稿'));
    expect(await session.save()).toBe(false); expect(session.state.status).toBe('conflict');
    session.edit('笔记', body('继续编辑')); expect(await session.flush()).toBe(false);
    expect(session.state.dirty).toBe(true); expect(persist).toHaveBeenCalledTimes(1);
  });
  it('输入法组合期间不提交半成品，结束后可保存', async () => {
    const persist = vi.fn(async (input: SaveNote) => receipt(input));
    const session = new SaveSession(note, persist, () => {}); session.composing = true; session.edit('笔记', body('zhong'));
    expect(await session.save()).toBe(false); expect(persist).not.toHaveBeenCalled();
    session.composing = false; session.edit('笔记', body('中文')); expect(await session.flush()).toBe(true);
    expect(persist.mock.calls[0]?.[0].body).toEqual(body('中文'));
  });
  it('不属于当前实体的回执不能确认保存', async () => {
    const session = new SaveSession(note, async input => ({ ...receipt(input), entityId: 'wrong' }), () => {});
    session.edit('笔记', body('保留')); expect(await session.save()).toBe(false);
    expect(session.state.dirty).toBe(true); expect(session.state.status).toBe('failed');
  });
  it('失败保持脏状态，显式重试成功后确认保存', async () => {
    const persist = vi.fn<(input: SaveNote) => Promise<SaveReceipt>>().mockRejectedValueOnce({ code: 'IO_ERROR', message: '写入失败', retryable: true, requestId: 'test' }).mockImplementation(async input => receipt(input));
    const session = new SaveSession(note, persist, () => {}); session.edit('笔记', body('保留'));
    expect(await session.save()).toBe(false); expect(session.state.dirty).toBe(true);
    expect(await session.save()).toBe(true); expect(session.state.dirty).toBe(false);
  });
});

describe('持久草稿与合并', () => {
  it('数据库失败前已保存恢复稿，失败后不清除草稿', async () => {
    const write = vi.fn(async () => {}); const clear = vi.fn(async () => {});
    const persist = vi.fn(async () => { expect(write).toHaveBeenCalledOnce(); throw {code: 'DB_ERROR', message: '失败', retryable: true, requestId: 'test'}; });
    const session = new SaveSession(note, persist, () => {}, {write, clear});
    session.edit('草稿', body('磁盘稿')); expect(await session.save()).toBe(false);
    expect(write.mock.calls[0]).toMatchObject([{title: '草稿', body: body('磁盘稿'), clientEditSequence: 1}]); expect(clear).not.toHaveBeenCalled();
  });
  it('迟到回执只能清理已确认序号，新的落盘草稿仍保留', async () => {
    let finish: (value: SaveReceipt) => void = () => {throw new Error('not started');};
    let durable: SaveNote | null = null;
    const persist = vi.fn<(input: SaveNote) => Promise<SaveReceipt>>().mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const session = new SaveSession(note, persist, () => {}, {
      write: async input => {durable = input;},
      clear: async sequence => {if (durable && durable.clientEditSequence <= sequence) durable = null;},
    });
    session.edit('草稿', body('快照一')); const active = session.save();
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce());
    session.edit('草稿', body('后续输入')); await session.checkpoint();
    const first = persist.mock.calls[0]?.[0]; if (!first) throw new Error('missing request'); finish(receipt(first));
    expect(await active).toBe(true); expect(durable).toMatchObject({clientEditSequence: 2, body: body('后续输入')});
    expect(session.state).toMatchObject({dirty: true, status: 'dirty', revision: 2});
  });
  it('草稿清理失败不撤销数据库成功回执，并显示恢复稿错误', async () => {
    const session = new SaveSession(note, async input => receipt(input), () => {}, {
      write: async () => {}, clear: async () => {throw {code: 'IO_ERROR', message: '草稿未清理', retryable: true, requestId: 'test'};},
    });
    session.edit('笔记', body('已提交')); expect(await session.save()).toBe(true);
    expect(session.state).toMatchObject({dirty: false, status: 'saved', revision: 2, draftError: {code: 'IO_ERROR'}});
  });
  it('恢复稿必须显式对照后才能提交，重新冲突仍保留合并稿', async () => {
    const persist = vi.fn<(input: SaveNote) => Promise<SaveReceipt>>().mockRejectedValueOnce({code: 'CONFLICT',message: '再次更新',retryable: false,requestId: 'test'}).mockImplementation(async input => receipt(input));
    const session = new SaveSession({...note,revision: 4}, persist, () => {});
    session.recover({sessionId: crypto.randomUUID(),noteId: note.id,title: '恢复稿',body: body('本地未提交'),schemaVersion: 1,baseRevision: 1,clientEditSequence: 9});
    expect(await session.flush()).toBe(false); expect(persist).not.toHaveBeenCalled();
    session.edit('合并标题',body('两份合并')); session.rebase(4); expect(await session.save(true)).toBe(false);
    expect(session.state).toMatchObject({status: 'conflict',dirty: true});
    session.rebase(5); expect(await session.save(true)).toBe(true);
    expect(persist.mock.calls[1]?.[0]).toMatchObject({baseRevision: 5,createVersion: true,body: body('两份合并'),title: '合并标题'});
  });
  it('组合输入未完成时不能声称恢复稿已落盘', async () => {
    const write = vi.fn(async () => {});
    const session = new SaveSession(note, async input => receipt(input), () => {}, {write,clear: async () => {}});
    session.edit('草稿',body('拼音'));session.composing = true;
    expect(await session.checkpoint()).toBe(false);expect(write).not.toHaveBeenCalled();
    session.composing = false;session.edit('草稿',body('中文'));expect(await session.checkpoint()).toBe(true);
  });
});
