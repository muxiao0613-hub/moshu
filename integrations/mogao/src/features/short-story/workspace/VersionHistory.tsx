/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 短篇版本查看、比较和恢复；恢复保留当前稿，服务器失败时不覆盖编辑器。 */
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { stripHtml } from '@/shared/lib/contentFormat';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import type { StoryEditorApi } from './useStoryEditor';
export function StoryVersionHistory({ api }: { api: StoryEditorApi }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false);
  const versions = api.story?.versions || [];
  const version = versions.find(v => v.id === selected);
  const restore = async () => {
    const s = api.storyRef.current, editor = api.editor;
    if (!s || !editor || !version || busy) return;
    const current = editor.getHTML(); setBusy(true);
    try {
      const saved = await api.saveDraft(s, version.content, { status: 'revised',
        versions: [...versions, { id: uuidv4(), content: current, savedAt: new Date(), note: '恢复版本前原稿' }] });
      if (!saved) return;
      if (api.storyRef.current?.id !== s.id) return;
      if (editor.getHTML() !== current) { toast.info('版本已恢复到服务端，编辑器有新输入，保留本地新稿供你选择'); return; }
      editor.commands.setContent(saved.content, {emitUpdate:false}); setOpen(false); toast.success('已恢复版本，原稿已保留');
    } finally { setBusy(false); }
  };
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(v => !v)}>历史版本（{versions.length}）</Button>
    {open && <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-5 max-w-4xl w-full space-y-3" onClick={e => e.stopPropagation()}>
        <h3>查看与恢复历史版本</h3>
        <select className="border rounded p-2 w-full dark:bg-zinc-800" value={selected} onChange={e => setSelected(e.target.value)}>
          <option value="">选择版本</option>{[...versions].reverse().map(v => <option key={v.id} value={v.id}>{new Date(v.savedAt).toLocaleString()} · {v.note}</option>)}
        </select>
        {version && <div className="grid grid-cols-2 gap-3 text-xs"><div><b>当前编辑稿</b><pre className="whitespace-pre-wrap max-h-80 overflow-auto">{stripHtml(api.editor?.getHTML() || api.story?.content || '')}</pre></div><div><b>所选版本</b><pre className="whitespace-pre-wrap max-h-80 overflow-auto">{stripHtml(version.content)}</pre></div></div>}
        <div className="flex gap-2"><Button disabled={!version || busy} onClick={restore}>{busy ? '恢复中…' : '恢复并保存（保留原稿）'}</Button><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>关闭</Button></div>
      </div>
    </div>}
  </>;
}
