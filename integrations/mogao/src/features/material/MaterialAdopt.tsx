/** 素材→作品的采用入口；保存为可编辑参考条目，创作上下文按相关性读取，保留素材来源。 */
import { useState } from 'react';
import { getProjects, getWorldSettings, saveWorldSetting } from '@/api';
import type { Material, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
export function MaterialAdopt({ material }: { material: Material }) {
  const [projects, setProjects] = useState<Project[] | null>(null), [target, setTarget] = useState(''), [busy, setBusy] = useState(false);
  const open = async () => {
    try { setProjects(await getProjects()); } catch { toast.error('读取作品失败，请重试'); }
  };
  const adopt = async () => {
    if (!target || busy) return;
    const text = material.expandedContent || material.rawContent;
    if (!text.trim()) return;
    setBusy(true);
    try {
      const tag = `素材:${material.id}`;
      const existing = (await getWorldSettings(target)).find(w => w.tags?.includes(tag));
      await saveWorldSetting({ id: existing?.id, projectId: target, category: '素材参考', title: material.title || '创作参考',
        content: `【作者采用的创作参考；未经正文落实的情节不视为已发生事实】\n${text}`,
        tags: [...new Set([...(material.tags || []), tag])] });
      toast.success(existing ? '已更新作品中的素材参考' : '已采用为作品参考，可在世界观中编辑、在上下文中选择'); setProjects(null);
    } catch { toast.error('采用失败，请重试'); } finally { setBusy(false); }
  };
  return <><Button variant="outline" size="sm" onClick={open} disabled={!material.rawContent && !material.expandedContent}>用于作品</Button>
    {projects && <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-5"><div className="p-5 bg-white dark:bg-zinc-900 rounded-xl space-y-3 max-w-md w-full">
      <p className="text-sm">选择作品。素材会保存到「世界观 · 素材参考」，后续写作按相关性取用。它是创作参考，人物正史仍以档案和正文为准。</p>
      <select className="border rounded p-2 w-full dark:bg-zinc-800" value={target} onChange={e => setTarget(e.target.value)}><option value="">选择作品</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
      <div className="flex gap-2"><Button onClick={adopt} disabled={!target || busy}>{busy ? '保存中…' : '采用'}</Button><Button variant="outline" disabled={busy} onClick={() => setProjects(null)}>关闭</Button></div>
    </div></div>}
  </>;
}
