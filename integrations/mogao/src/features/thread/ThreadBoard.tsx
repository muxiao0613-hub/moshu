import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Bookmark, Trash2, Edit2, Wand2 } from 'lucide-react';
import { getThreads, saveThread, deleteThread, getCharacters, getWorldSettings, getProject, getOutlines } from '@/api';
import { generateForThread, generateThreadsContinuation, type ThreadDraft } from '@/features/ai/aiService';
import { AIContinueDialog } from '@/features/ai/AIContinueDialog';
import { useEditor } from '@/shared/contexts/EditorContext';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Select } from '@/shared/ui/select';
import { Badge } from '@/shared/ui/badge';
import { AIFieldButton } from '@/features/ai/AIFieldButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import type { PlotThread, Character, WorldSetting, Project, Outline } from '@/shared/types';

interface ThreadBoardProps {
  projectId: string;
}

const COLUMNS: { status: PlotThread['status']; label: string; color: string }[] = [
  { status: 'planted', label: '已埋设', color: 'text-blue-600 dark:text-blue-400' },
  { status: 'developing', label: '发展中', color: 'text-yellow-600 dark:text-yellow-400' },
  { status: 'resolved', label: '已回收', color: 'text-green-600 dark:text-green-400' },
  { status: 'abandoned', label: '已废弃', color: 'text-zinc-400' },
];

const importanceConfig = {
  critical: { label: '关键', variant: 'default' as const },
  major: { label: '重要', variant: 'warning' as const },
  minor: { label: '次要', variant: 'outline' as const },
};

function ThreadCard({ thread, onEdit, onDelete, onStatusChange }: {
  thread: PlotThread;
  onEdit: (t: PlotThread) => void;
  onDelete: (t: PlotThread) => void;
  onStatusChange: (t: PlotThread, status: PlotThread['status']) => void;
}) {
  const { label, variant } = importanceConfig[thread.importance];
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3 group hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-1.5">
        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 flex-1 pr-2">
          {thread.title}
        </h4>
        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex gap-1">
          <button onClick={() => onEdit(thread)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-400 hover:text-zinc-600">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(thread)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {thread.description && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2 line-clamp-2">{thread.description}</p>
      )}
      <div className="flex items-center justify-between">
        <Badge variant={variant} className="text-xs">{label}</Badge>
        <Select
          value={thread.status}
          onChange={e => onStatusChange(thread, e.target.value as PlotThread['status'])}
          className="h-6 text-xs w-24 border-0 bg-transparent p-0 pr-5"
          onClick={e => e.stopPropagation()}
        >
          {COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
        </Select>
      </div>
      {thread.plantedAt && (
        <p className="text-xs text-zinc-400 mt-1">埋设：{thread.plantedAt}</p>
      )}
    </div>
  );
}

const emptyThread = (projectId: string): PlotThread => ({
  id: uuidv4(),
  projectId,
  title: '',
  description: '',
  status: 'planted',
  plantedAt: '',
  relatedChapters: [],
  relatedCharacters: [],
  importance: 'major',
  notes: '',
});

export function ThreadBoard({ projectId }: ThreadBoardProps) {
  const [editTarget, setEditTarget] = useState<PlotThread | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PlotThread | null>(null);
  const [aiContOpen, setAiContOpen] = useState(false);
  const { setModuleCtx } = useEditor();

  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [outlines, setOutlines] = useState<Outline[]>([]);

  const refresh = useCallback(async () => {
    const [t, c, w, p, o] = await Promise.all([
      getThreads(projectId),
      getCharacters(projectId),
      getWorldSettings(projectId),
      getProject(projectId),
      getOutlines(projectId),
    ]);
    setThreads(t);
    setCharacters(c);
    setWorldSettings(w);
    setProject(p ?? null);
    setOutlines(o);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const openEdit = (t: PlotThread) => {
    setEditTarget({ ...t });
    setModuleCtx({
      type: 'thread', label: t.title || '伏笔',
      entityId: t.id, entitySnapshot: { ...t },
      onApplyResult: (result) => setEditTarget(prev => prev ? { ...prev, description: result } : prev),
    });
  };

  const handleSave = async () => {
    if (!editTarget || !editTarget.title.trim()) return;
    await saveThread(editTarget);
    setEditTarget(null);
    setModuleCtx(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteThread(deleteTarget.id, projectId);
    setDeleteTarget(null);
    await refresh();
  };

  const handleStatusChange = async (thread: PlotThread, status: PlotThread['status']) => {
    await saveThread({ ...thread, status });
    await refresh();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">伏笔 / 线索</h2>
          <p className="text-xs text-zinc-500 mt-0.5">共 {threads.length} 条</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAiContOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />AI续写
          </Button>
          <Button onClick={() => { const t = emptyThread(projectId); setEditTarget(t); setModuleCtx({ type: 'thread', label: '伏笔', entityId: t.id, entitySnapshot: { ...t } }); }} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新建伏笔
          </Button>
        </div>
      </div>

      {threads.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-zinc-400">
          <div className="text-center">
            <Bookmark className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">还没有伏笔记录</p>
            <Button onClick={() => { const t = emptyThread(projectId); setEditTarget(t); setModuleCtx({ type: 'thread', label: '伏笔', entityId: t.id, entitySnapshot: { ...t } }); }} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />新建伏笔
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <div className="flex h-full overflow-x-auto md:grid md:grid-cols-2 xl:grid-cols-4 md:overflow-x-visible md:divide-x divide-zinc-200 dark:divide-zinc-700">
            {COLUMNS.map(col => {
              const colThreads = threads.filter(t => t.status === col.status);
              return (
                <div key={col.status} className="flex flex-col min-h-0 w-[78vw] max-w-[280px] shrink-0 border-r border-zinc-200 dark:border-zinc-700 md:w-auto md:max-w-none md:border-r-0">
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                    <span className={cn('text-xs font-semibold', col.color)}>{col.label}</span>
                    <span className="text-xs text-zinc-400 ml-1">({colThreads.length})</span>
                  </div>
                  <div className="flex-1 overflow-auto p-2 space-y-2">
                    {colThreads.map(t => (
                      <ThreadCard
                        key={t.id}
                        thread={t}
                        onEdit={setEditTarget}
                        onDelete={setDeleteTarget}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
          <DialogContent onClose={() => setEditTarget(null)} className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editTarget.title ? '编辑伏笔' : '新建伏笔'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={editTarget.title}
                onChange={e => setEditTarget(s => s ? { ...s, title: e.target.value } : s)}
                placeholder="伏笔标题"
                autoFocus
              />
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-zinc-500">内容描述</label>
                  <AIFieldButton
                    onGenerate={() => generateForThread({
                      project: project || { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() },
                      thread: editTarget,
                      field: 'description',
                      instruction: '',
                      allChars: characters,
                      allWorld: worldSettings,
                    })}
                    onResult={result => setEditTarget(s => s ? { ...s, description: result } : s)}
                    label="AI生成"
                  />
                </div>
                <Textarea
                  value={editTarget.description}
                  onChange={e => setEditTarget(s => s ? { ...s, description: e.target.value } : s)}
                  placeholder="伏笔内容描述..."
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">状态</label>
                  <Select
                    value={editTarget.status}
                    onChange={e => setEditTarget(s => s ? { ...s, status: e.target.value as PlotThread['status'] } : s)}
                  >
                    {COLUMNS.map(c => <option key={c.status} value={c.status}>{c.label}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">重要程度</label>
                  <Select
                    value={editTarget.importance}
                    onChange={e => setEditTarget(s => s ? { ...s, importance: e.target.value as PlotThread['importance'] } : s)}
                  >
                    <option value="critical">关键</option>
                    <option value="major">重要</option>
                    <option value="minor">次要</option>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 block mb-1">埋设章节</label>
                  <Input
                    value={editTarget.plantedAt}
                    onChange={e => setEditTarget(s => s ? { ...s, plantedAt: e.target.value } : s)}
                    placeholder="如：第一章"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">备注</label>
                <Textarea
                  value={editTarget.notes}
                  onChange={e => setEditTarget(s => s ? { ...s, notes: e.target.value } : s)}
                  placeholder="其他备注..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditTarget(null)}>取消</Button>
              <Button onClick={handleSave} disabled={!editTarget.title.trim()}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)} className="max-w-sm">
          <DialogHeader><DialogTitle>删除伏笔</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">确定删除「{deleteTarget?.title}」？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 续写伏笔 */}
      {aiContOpen && (
        <AIContinueDialog<ThreadDraft>
          title="AI 续写伏笔"
          noun="伏笔"
          defaultCount={3}
          maxCount={10}
          onGenerate={(instruction, count) => generateThreadsContinuation({
            project: project || { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() },
            existingThreads: threads,
            existingChars: characters,
            existingOutlines: outlines,
            instruction, count,
          })}
          renderItem={(t) => (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t.title}</span>
                <span className="text-xs text-zinc-400">
                  {t.importance === 'critical' ? '关键' : t.importance === 'major' ? '重要' : '次要'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{t.description}</p>
              {t.plantedAt && <p className="text-xs text-zinc-400 mt-0.5">埋设：{t.plantedAt}</p>}
            </div>
          )}
          onSave={async (drafts) => {
            for (const d of drafts) {
              await saveThread({
                id: uuidv4(), projectId,
                title: d.title, description: d.description,
                importance: d.importance, status: d.status,
                plantedAt: d.plantedAt || '', notes: d.notes || '',
                relatedChapters: [], relatedCharacters: [],
              });
            }
            await refresh();
          }}
          onClose={() => setAiContOpen(false)}
        />
      )}
    </div>
  );
}
