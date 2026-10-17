import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Globe, Trash2, Search, Tag, Wand2 } from 'lucide-react';
import { getWorldSettings, saveWorldSetting, deleteWorldSetting, getCharacters, getProject } from '@/api';
import { generateForWorld, generateWorldContinuation, type WorldDraft } from '@/features/ai/aiService';
import { AIContinueDialog } from '@/features/ai/AIContinueDialog';
import { AIPolishButton } from '@/features/ai/AIPolishButton';
import { useEditor } from '@/shared/contexts/EditorContext';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Badge } from '@/shared/ui/badge';
import { Select } from '@/shared/ui/select';
import { AIFieldButton } from '@/features/ai/AIFieldButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import type { WorldSetting, Character, Project } from '@/shared/types';

interface WorldListProps {
  projectId: string;
}

const CATEGORIES = ['地理', '势力', '魔法体系', '修炼体系', '历史', '种族', '道具/宝物', '规则/法律', '文化习俗', '其他'];

export function WorldList({ projectId }: WorldListProps) {
  const [editTarget, setEditTarget] = useState<WorldSetting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorldSetting | null>(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [newTag, setNewTag] = useState('');
  const [aiContOpen, setAiContOpen] = useState(false);
  const { setModuleCtx } = useEditor();

  const [settings, setSettings] = useState<WorldSetting[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [project, setProject] = useState<Project | null>(null);

  const refresh = useCallback(async () => {
    const [s, c, p] = await Promise.all([
      getWorldSettings(projectId),
      getCharacters(projectId),
      getProject(projectId),
    ]);
    setSettings(s);
    setCharacters(c);
    setProject(p ?? null);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = settings.filter(s => {
    const matchSearch = !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.content.toLowerCase().includes(search.toLowerCase()) ||
      s.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat = !filterCat || s.category === filterCat;
    return matchSearch && matchCat;
  });

  const categories = [...new Set(settings.map(s => s.category))];

  const handleCreate = () => {
    const s: WorldSetting = { id: uuidv4(), projectId, category: CATEGORIES[0], title: '', content: '', tags: [] };
    setEditTarget(s);
    setModuleCtx({ type: 'world', label: '世界观', entityId: s.id, entitySnapshot: { ...s } });
  };

  const openEdit = (s: WorldSetting) => {
    setEditTarget({ ...s });
    setModuleCtx({
      type: 'world',
      label: s.title || '世界观',
      entityId: s.id,
      entitySnapshot: { ...s },
      onApplyResult: (result) => setEditTarget(prev => prev ? { ...prev, content: result } : prev),
    });
  };

  const handleSave = async () => {
    if (!editTarget || !editTarget.title.trim()) return;
    await saveWorldSetting(editTarget);
    setEditTarget(null);
    setModuleCtx(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteWorldSetting(deleteTarget.id, projectId);
    setDeleteTarget(null);
    await refresh();
  };

  const addTag = () => {
    if (!newTag.trim() || !editTarget) return;
    setEditTarget(s => s ? { ...s, tags: [...s.tags, newTag.trim()] } : s);
    setNewTag('');
  };

  const removeTag = (idx: number) => {
    if (!editTarget) return;
    setEditTarget(s => s ? { ...s, tags: s.tags.filter((_, i) => i !== idx) } : s);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">世界观 / 设定</h2>
          <p className="text-xs text-zinc-500 mt-0.5">共 {settings.length} 条设定</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAiContOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />AI续写
          </Button>
          <Button onClick={handleCreate} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新建设定
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 px-4 sm:px-6 py-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索设定..."
            className="pl-7 h-7 text-sm"
          />
        </div>
        <Select
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          className="w-28 h-7 text-sm"
        >
          <option value="">全部分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <Globe className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">还没有世界观设定</p>
            <Button onClick={handleCreate} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              新建设定
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map(setting => (
              <div
                key={setting.id}
                className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => openEdit(setting)}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">
                      {setting.title}
                    </h3>
                    <span className="text-xs text-ink-600 dark:text-ink-400">{setting.category}</span>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteTarget(setting); }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-2">
                  {setting.content}
                </p>
                {setting.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {setting.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
          <DialogContent onClose={() => setEditTarget(null)} className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editTarget.title ? '编辑设定' : '新建设定'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-500 block mb-1">标题 *</label>
                  <Input
                    value={editTarget.title}
                    onChange={e => setEditTarget(s => s ? { ...s, title: e.target.value } : s)}
                    placeholder="设定名称"
                    autoFocus
                  />
                </div>
                <div className="w-32">
                  <label className="text-xs font-medium text-zinc-500 block mb-1">分类</label>
                  <Select
                    value={editTarget.category}
                    onChange={e => setEditTarget(s => s ? { ...s, category: e.target.value } : s)}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="自定义">自定义</option>
                  </Select>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-zinc-500">内容</label>
                  <div className="flex gap-1">
                  <AIFieldButton
                    onGenerate={() => generateForWorld({
                      project: project || { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() },
                      setting: editTarget,
                      instruction: '',
                      allChars: characters,
                      allWorld: settings,
                    })}
                    onResult={result => setEditTarget(s => s ? { ...s, content: result } : s)}
                    label="AI生成"
                  />
                  <AIPolishButton
                    value={editTarget.content}
                    fieldLabel={`${editTarget.title || '设定'}内容`}
                    projectTitle={project?.title}
                    onApply={result => setEditTarget(s => s ? { ...s, content: result } : s)}
                  />
                  </div>
                </div>
                <Textarea
                  value={editTarget.content}
                  onChange={e => setEditTarget(s => s ? { ...s, content: e.target.value } : s)}
                  placeholder="详细描述这个设定..."
                  rows={8}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">标签</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {editTarget.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pr-1">
                      <Tag className="h-3 w-3" />
                      {tag}
                      <button onClick={() => removeTag(i)} className="hover:text-red-500">
                        <span className="text-xs">×</span>
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    placeholder="添加关键词标签"
                    className="h-7 text-sm"
                    onKeyDown={e => e.key === 'Enter' && addTag()}
                  />
                  <Button size="sm" variant="outline" onClick={addTag} className="h-7">添加</Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditTarget(null); setModuleCtx(null); }}>取消</Button>
              <Button onClick={handleSave} disabled={!editTarget.title.trim()}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>删除设定</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            确定删除「{deleteTarget?.title}」？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 续写世界观 */}
      {aiContOpen && (
        <AIContinueDialog<WorldDraft>
          title="AI 续写世界观"
          noun="设定"
          defaultCount={4}
          maxCount={12}
          onGenerate={(instruction, count) => generateWorldContinuation({
            project: project || { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() },
            existingWorld: settings,
            existingChars: characters,
            instruction, count,
          })}
          renderItem={(s) => (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{s.title}</span>
                <span className="text-xs text-ink-600 dark:text-ink-400">{s.category}</span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{s.content}</p>
            </div>
          )}
          onSave={async (drafts) => {
            for (const d of drafts) {
              await saveWorldSetting({ id: uuidv4(), projectId, ...d });
            }
            await refresh();
          }}
          onClose={() => setAiContOpen(false)}
        />
      )}
    </div>
  );
}
