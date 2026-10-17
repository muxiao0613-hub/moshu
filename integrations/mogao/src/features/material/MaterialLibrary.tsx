/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, Sparkles, Search, Tag, Loader2, BookMarked, Copy, Check, X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getMaterials, saveMaterial, deleteMaterial } from '@/api';
import { expandMaterial } from '@/features/ai/aiService';
import { TopBar } from '@/shared/layout/TopBar';
import { formatDate, cn } from '@/shared/lib/utils';
import type { Material, MaterialCategory } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { MaterialAdopt } from './MaterialAdopt';
import { MaterialBackup } from './MaterialBackup';

const CATEGORIES: MaterialCategory[] = ['角色设定', '世界观', '情节', '对话', '场景描写', '主题', '其他'];

const CAT_STYLE: Record<MaterialCategory, { bar: string; dot: string; badge: string }> = {
  '角色设定': { bar: 'bg-amber-400',  dot: 'bg-amber-400',  badge: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  '世界观':   { bar: 'bg-blue-400',   dot: 'bg-blue-400',   badge: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  '情节':     { bar: 'bg-purple-400', dot: 'bg-purple-400', badge: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  '对话':     { bar: 'bg-green-400',  dot: 'bg-green-400',  badge: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  '场景描写': { bar: 'bg-teal-400',   dot: 'bg-teal-400',   badge: 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
  '主题':     { bar: 'bg-rose-400',   dot: 'bg-rose-400',   badge: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  '其他':     { bar: 'bg-zinc-400',   dot: 'bg-zinc-400',   badge: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' },
};

function emptyMaterial(cat: MaterialCategory = '其他'): Material {
  return { id: uuidv4(), title: '', rawContent: '', expandedContent: '', category: cat, tags: [], createdAt: new Date(), updatedAt: new Date() };
}

const len = (s: string) => (s || '').replace(/\s/g, '').length;
const preview = (m: Material) => (m.expandedContent || m.rawContent || '').replace(/\s+/g, ' ').trim();

export function MaterialLibrary() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string>('');
  const [sortBy, setSortBy] = useState<'recent' | 'category'>('recent');

  // 快捷捕获
  const [quickText, setQuickText] = useState('');
  const [quickCat, setQuickCat] = useState<MaterialCategory>('其他');

  // 编辑抽屉
  const [editing, setEditing] = useState<Material | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);

  const refresh = useCallback(() => getMaterials().then(setMaterials), []);
  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let arr = materials.filter(m => {
      const matchSearch = !q || m.title.toLowerCase().includes(q) || m.rawContent.toLowerCase().includes(q)
        || m.expandedContent.toLowerCase().includes(q) || m.tags.some(t => t.toLowerCase().includes(q));
      return matchSearch && (!filterCat || m.category === filterCat);
    });
    if (sortBy === 'category') arr = [...arr].sort((a, b) => a.category.localeCompare(b.category));
    else arr = [...arr].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return arr;
  }, [materials, search, filterCat, sortBy]);

  const countByCat = (c: string) => materials.filter(m => m.category === c).length;

  // ── 快捷捕获：一行记一条 ──────────────────────────────────────────────────
  const quickCapture = async () => {
    const text = quickText.trim();
    if (!text) return;
    const firstLine = text.split('\n')[0].slice(0, 24);
    await saveMaterial({ ...emptyMaterial(quickCat), title: firstLine || '速记', rawContent: text, updatedAt: new Date() });
    setQuickText('');
    await refresh();
    toast.success('已记下');
  };

  const openEdit = (m: Material) => { setEditing({ ...m }); setIsNew(false); };
  const openNew = () => { setEditing(emptyMaterial(filterCat as MaterialCategory || '其他')); setIsNew(true); };

  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900">
      <TopBar onBack={() => navigate('/')} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-5">
          {/* 标题 */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BookMarked className="h-5 w-5 text-ink-500" />
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">素材库</h1>
              <span className="text-sm text-zinc-400">{materials.length}</span>
            </div>
            <MaterialBackup onRestored={refresh} />
            <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />新建</Button>
          </div>

          {/* 快捷捕获 */}
          <div className="flex gap-2 mb-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 p-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-400" />
              <input
                value={quickText} onChange={e => setQuickText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); quickCapture(); } }}
                placeholder="💡 随手记下一个灵感，回车保存…"
                className="w-full bg-transparent pl-9 pr-2 py-2 text-sm focus:outline-none text-zinc-800 dark:text-zinc-100"
              />
            </div>
            <Select value={quickCat} onChange={e => setQuickCat(e.target.value as MaterialCategory)} className="w-28 shrink-0">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Button size="sm" onClick={quickCapture} disabled={!quickText.trim()}>记下</Button>
          </div>

          {/* 筛选栏 */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Chip active={!filterCat} onClick={() => setFilterCat('')} label={`全部 ${materials.length}`} />
            {CATEGORIES.map(c => {
              const n = countByCat(c);
              if (n === 0 && filterCat !== c) return null;
              return <Chip key={c} active={filterCat === c} onClick={() => setFilterCat(c)} dot={CAT_STYLE[c].dot} label={`${c} ${n}`} />;
            })}
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索" className="pl-8 h-9 w-40" />
            </div>
            <Select value={sortBy} onChange={e => setSortBy(e.target.value === 'category' ? 'category' : 'recent')} className="w-28 h-9">
              <option value="recent">最近更新</option>
              <option value="category">按分类</option>
            </Select>
          </div>

          {/* 卡片墙 */}
          {filtered.length === 0 ? (
            <div className="text-center text-zinc-400 py-20">
              <BookMarked className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="whitespace-pre-line">{search || filterCat ? '未找到匹配素材' : '还没有素材\n在上方随手记下第一个灵感吧'}</p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
              {filtered.map(m => (
                <Card key={m.id} m={m} onClick={() => openEdit(m)} onDelete={() => setDeleteTarget(m)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 编辑抽屉 */}
      {editing && (
        <EditDrawer
          material={editing} isNew={isNew}
          onClose={() => setEditing(null)}
          onSaved={async () => { await refresh(); }}
          onDelete={() => setDeleteTarget(editing)}
        />
      )}

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)} className="max-w-sm">
          <DialogHeader><DialogTitle>删除素材</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-500 py-2">确定删除「{deleteTarget?.title || '该素材'}」？此操作不可恢复。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button className="bg-red-500 hover:bg-red-600" onClick={async () => {
              if (!deleteTarget) return;
              await deleteMaterial(deleteTarget.id);
              if (editing?.id === deleteTarget.id) setEditing(null);
              setDeleteTarget(null); await refresh();
            }}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── 卡片 ────────────────────────────────────────────────────────────────────
function Card({ m, onClick, onDelete }: { m: Material; onClick: () => void; onDelete: () => void }) {
  const st = CAT_STYLE[m.category];
  return (
    <div onClick={onClick}
      className="group relative mb-4 break-inside-avoid rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 overflow-hidden cursor-pointer hover:shadow-md hover:border-ink-300 transition-all">
      <div className={cn('h-1', st.bar)} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-zinc-800 dark:text-zinc-100 leading-snug line-clamp-2">
            {m.title || '（无标题）'}
          </h3>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-red-500 transition-opacity shrink-0">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 line-clamp-4 whitespace-pre-wrap">{preview(m) || '（空）'}</p>

        {m.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2.5">
            {m.tags.slice(0, 4).map((t, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300">#{t}</span>
            ))}
            {m.tags.length > 4 && <span className="text-[10px] text-zinc-400">+{m.tags.length - 4}</span>}
          </div>
        )}

        <div className="flex items-center justify-between mt-3 text-[11px] text-zinc-400">
          <span className={cn('px-1.5 py-0.5 rounded-full font-medium', st.badge)}>{m.category}</span>
          <span className="flex items-center gap-2">
            {m.expandedContent && <span className="inline-flex items-center gap-0.5 text-amber-500"><Sparkles className="h-3 w-3" />已扩写</span>}
            <span>{len(m.expandedContent || m.rawContent)} 字</span>
            <span>{formatDate(m.updatedAt)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── 编辑/扩写抽屉 ─────────────────────────────────────────────────────────────
function EditDrawer({ material, isNew, onClose, onSaved, onDelete }: {
  material: Material; isNew: boolean;
  onClose: () => void; onSaved: () => Promise<void>; onDelete: () => void;
}) {
  const [m, setM] = useState<Material>(material);
  const [tab, setTab] = useState<'raw' | 'expanded'>(material.expandedContent ? 'expanded' : 'raw');
  const [newTag, setNewTag] = useState('');
  const [expandInstr, setExpandInstr] = useState('');
  const [expanding, setExpanding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    if (!m.title.trim() && !m.rawContent.trim()) { toast.error('请填写标题或内容'); return; }
    setSaving(true);
    await saveMaterial({ ...m, title: m.title.trim() || m.rawContent.slice(0, 24) || '未命名', updatedAt: new Date() });
    setSaving(false);
    await onSaved();
    toast.success('已保存');
    onClose();
  };

  const expand = async () => {
    if (!m.rawContent.trim()) { toast.error('请先填写原始灵感'); return; }
    setExpanding(true); setTab('expanded');
    let acc = '';
    try {
      await expandMaterial({
        title: m.title, rawContent: m.rawContent, category: m.category, instruction: expandInstr || undefined,
        onChunk: c => { acc += c; setM(s => ({ ...s, expandedContent: acc })); },
      });
      setM(s => ({ ...s, expandedContent: acc }));
    } catch (e) { toast.error('AI 扩写失败：' + (e as Error).message); }
    finally { setExpanding(false); }
  };

  const copy = () => {
    const text = m.expandedContent || m.rawContent;
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const addTag = () => { if (newTag.trim()) { setM(s => ({ ...s, tags: [...s.tags, newTag.trim()] })); setNewTag(''); } };

  return (
    <div data-mogao-form className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-xl bg-white dark:bg-zinc-900 h-full overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <span className="text-sm font-medium text-zinc-500">{isNew ? '新建素材' : '编辑素材'}</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-4">
          {/* 标题 + 类别 */}
          <Input value={m.title} onChange={e => setM(s => ({ ...s, title: e.target.value }))} placeholder="素材标题" className="text-base font-medium" />
          <div className="flex items-center gap-2">
            <Select value={m.category} onChange={e => setM(s => ({ ...s, category: e.target.value as MaterialCategory }))} className="w-36">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>

          {/* 标签 */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {m.tags.map((t, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                  #{t}<button onClick={() => setM(s => ({ ...s, tags: s.tags.filter((_, j) => j !== i) }))}><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} placeholder="加标签，回车" className="pl-8 h-8 text-sm" />
              </div>
              <Button size="sm" variant="outline" onClick={addTag}>添加</Button>
            </div>
          </div>

          {/* 原始 / 扩写 Tab */}
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 w-fit">
            {(['raw', 'expanded'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-3 py-1 rounded-lg text-sm font-medium', tab === t ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500')}>
                {t === 'raw' ? '原始灵感' : 'AI 扩写'}{t === 'expanded' && m.expandedContent ? ' ✨' : ''}
              </button>
            ))}
          </div>

          {tab === 'raw' ? (
            <div>
              <Textarea value={m.rawContent} onChange={e => setM(s => ({ ...s, rawContent: e.target.value }))}
                placeholder="写下原始想法、片段、设定…" rows={8} className="resize-none" />
              <div className="flex gap-2 mt-2">
                <Input value={expandInstr} onChange={e => setExpandInstr(e.target.value)} placeholder="扩写要求（可选）" className="flex-1 h-9 text-sm" />
                <Button size="sm" onClick={expand} disabled={expanding || !m.rawContent.trim()}>
                  {expanding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}AI 扩写
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {m.expandedContent ? (
                <Textarea value={m.expandedContent} onChange={e => setM(s => ({ ...s, expandedContent: e.target.value }))} rows={12} className="resize-none" />
              ) : (
                <div className="text-center text-zinc-400 text-sm py-12 border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl">
                  还没有扩写内容<br />去「原始灵感」点 AI 扩写
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/40">
          {!isNew ? (
            <button onClick={onDelete} className="text-sm text-red-500 hover:text-red-600 inline-flex items-center gap-1"><Trash2 className="h-4 w-4" />删除</button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={copy} disabled={!m.expandedContent && !m.rawContent}>
              {copied ? <Check className="h-4 w-4 mr-1 text-green-500" /> : <Copy className="h-4 w-4 mr-1" />}复制
            </Button>
            <MaterialAdopt material={m} />
            <Button size="sm" onClick={save} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, label, dot }: { active: boolean; onClick: () => void; label: string; dot?: string }) {
  return (
    <button onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
        active ? 'bg-ink-500 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-ink-300')}>
      {dot && <span className={cn('h-2 w-2 rounded-full', dot)} />}{label}
    </button>
  );
}
