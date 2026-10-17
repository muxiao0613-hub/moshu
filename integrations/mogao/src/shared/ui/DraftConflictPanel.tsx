/** 重叠修改对照。两份稿都可复制；选择后仍做版本校验并保留另一份稿件。 */
import { useState } from 'react';
import { stripHtml } from '@/shared/lib/contentFormat';
import { Button } from './button';
export function DraftConflictPanel({ local, remote, onResolve }: {
  local: string; remote: string; onResolve: (choice: 'local' | 'remote') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const resolve = async (choice: 'local' | 'remote') => { setBusy(true); try { await onResolve(choice); } finally { setBusy(false); } };
  return <div className="p-3 border-b border-amber-300 bg-amber-50 dark:bg-zinc-900 space-y-2 shrink-0">
    <p className="text-sm font-medium">另一设备修改了同一段，自动保存已暂停。选择后另一份稿会保留为历史版本。</p>
    <div className="grid grid-cols-2 gap-2 text-xs"><label>本机稿<textarea readOnly value={stripHtml(local)} className="w-full h-28 p-2 bg-white dark:bg-zinc-800" /></label>
      <label>远端稿<textarea readOnly value={stripHtml(remote)} className="w-full h-28 p-2 bg-white dark:bg-zinc-800" /></label></div>
    <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void resolve('local')}>保留本机稿</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void resolve('remote')}>采用远端稿</Button></div>
  </div>;
}
