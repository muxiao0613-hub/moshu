import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, CheckCircle, Clock, Edit3, AlignLeft, Loader2, Wand2, AlertTriangle, History } from 'lucide-react';
import { analyzePacing, PACING_COLORS, PACING_LABELS, CONFLICT_LABELS } from '@/shared/lib/pacingTracker';
import { toast } from '@/shared/ui/toast';
import {
  getChapters, saveChapter, deleteChapter, syncOutlinesToChapters,
  getOutlines, getProject, getCharacters, getWorldSettings, getThreads,
} from '@/api';
import { generateNextChapterBrief } from '@/features/ai/aiService';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Badge } from '@/shared/ui/badge';
import { Textarea } from '@/shared/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { formatDate, formatWordCount } from '@/shared/lib/utils';
import type { Chapter, Outline } from '@/shared/types';
import { workChapterPath } from '@/shared/lib/workRoutes';

interface ChapterListProps {
  projectId: string;
}

const statusConfig = {
  draft: { label: '草稿', variant: 'secondary' as const },
  revised: { label: '修改中', variant: 'warning' as const },
  final: { label: '定稿', variant: 'success' as const },
};

const statusIcon = {
  draft: Edit3,
  revised: Clock,
  final: CheckCircle,
};

export function ChapterList({ projectId }: ChapterListProps) {
  const navigate = useNavigate();
  const [showPacingReference, setShowPacingReference] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiCount, setAiCount] = useState('20');
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  const refresh = useCallback(async () => {
    const [chs, ols] = await Promise.all([getChapters(projectId), getOutlines(projectId)]);
    setChapters(chs);
    setOutlines(ols);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const existingChapterIds = new Set(chapters.map(c => c.id));
  const unsyncedOutlineChapters = outlines.filter(
    o => o.type === 'chapter' && (!o.chapterId || !existingChapterIds.has(o.chapterId))
  );

  const handleSyncFromOutline = async () => {
    setSyncing(true);
    try {
      const count = await syncOutlinesToChapters(projectId);
      if (count === 0) toast.info('大纲中没有可导入的章节节点，请先在「大纲」中添加章节。');
      else await refresh();
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    const order = chapters.length + 1;
    const chapter = await saveChapter({
      projectId, title: newTitle.trim(), order,
      content: '', wordCount: 0, status: 'draft',
      summary: '', createdAt: new Date(), updatedAt: new Date(),
    });
    setNewTitle('');
    setCreateOpen(false);
    await refresh();
    navigate(workChapterPath(projectId, chapter.id));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteChapter(deleteTarget.id, projectId);
    setDeleteTarget(null);
    await refresh();
  };

  const handleAIContinueGenerate = async () => {
    if (aiGenerating) return;
    const count = Math.max(1, Math.min(500, parseInt(aiCount) || 1));
    setAiGenerating(true);
    try {
      const [project, currentChapters, characters, worldSettings, threads] = await Promise.all([
        getProject(projectId), getChapters(projectId), getCharacters(projectId),
        getWorldSettings(projectId), getThreads(projectId),
      ]);
      if (!project) { toast.error('项目不存在，无法继续生成。'); return; }

      const sorted = currentChapters.slice().sort((a, b) => a.order - b.order);
      const seed = sorted.map(ch => ({ title: ch.title, summary: ch.summary, content: ch.content }));
      const chapterOutlines = outlines.filter(o => o.type === 'chapter');
      let nextOrder = (sorted[sorted.length - 1]?.order || 0) + 1;

      for (let i = 0; i < count; i++) {
        const brief = await generateNextChapterBrief({
          project, existingChapters: seed, outlines: chapterOutlines,
          threads, characters, worldSettings, instruction: aiInstruction,
        });
        const chapter = await saveChapter({
          projectId, title: brief.title || `第${nextOrder}章`,
          order: nextOrder, content: '', wordCount: 0, status: 'draft',
          summary: brief.summary || '', createdAt: new Date(), updatedAt: new Date(),
        });
        seed.push({ title: chapter.title, summary: chapter.summary, content: '' });
        nextOrder++;
      }
      await refresh();
      setAiOpen(false);
    } catch (e) {
      toast.error(`AI继续生成失败：${(e as Error).message}`);
    } finally {
      setAiGenerating(false);
    }
  };

  const totalWords = chapters.reduce((sum, c) => sum + c.wordCount, 0);

  const lastEditedChapter = useMemo(() => {
    if (chapters.length === 0) return null;
    return chapters.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  }, [chapters]);

  const pacingWarnings = useMemo(() => {
    if (!showPacingReference) return [];
    if (!chapters || chapters.length === 0) return [];
    return analyzePacing(chapters.map(c => ({
      id: c.id, order: c.order, title: c.title,
      pacingTag: c.pacingTag, conflictType: c.conflictType,
    })));
  }, [chapters, showPacingReference]);

  const warningsByChapter = useMemo(() => {
    const map: Record<string, number> = {};
    for (const w of pacingWarnings) map[w.chapterId] = (map[w.chapterId] || 0) + 1;
    return map;
  }, [pacingWarnings]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-700">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">章节列表</h2>
          <p className="text-xs text-zinc-500 mt-0.5">共 {chapters.length} 章 · {formatWordCount(totalWords)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lastEditedChapter && (
            <Button onClick={() => navigate(workChapterPath(projectId, lastEditedChapter.id))} size="sm" variant="outline" className="gap-1.5" title={`上次编辑：${lastEditedChapter.title}`}>
              <History className="h-3.5 w-3.5" />继续上次
            </Button>
          )}
          <Button onClick={() => setAiOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />AI继续生成
          </Button>
          {unsyncedOutlineChapters.length > 0 && (
            <Button onClick={handleSyncFromOutline} disabled={syncing} size="sm" variant="outline" className="gap-1.5" title={`从大纲导入 ${unsyncedOutlineChapters.length} 个章节`}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlignLeft className="h-3.5 w-3.5" />}
              从大纲导入 ({unsyncedOutlineChapters.length})
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新建章节
          </Button>
        </div>
      </div>

      <label className="px-6 py-2 text-xs text-zinc-500 flex gap-2"><input type="checkbox" checked={showPacingReference} onChange={e => setShowPacingReference(e.target.checked)} />查看连载节奏参考（可选，不作为质量错误）</label>
      {pacingWarnings.length > 0 && (
        <div className="mx-4 sm:mx-6 mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-medium mb-1">
            <AlertTriangle className="h-3.5 w-3.5" />连载节奏参考（{pacingWarnings.length}条）
          </div>
          {pacingWarnings.slice(0, 3).map((w, i) => (
            <p key={i} className="text-amber-600 dark:text-amber-400">{w.message}</p>
          ))}
          {pacingWarnings.length > 3 && <p className="text-amber-500">还有 {pacingWarnings.length - 3} 条警告...</p>}
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {chapters.length === 0 ? (
          <div className="text-center py-16 text-zinc-400">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm mb-4">还没有章节，点击「新建章节」开始创作</p>
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />新建章节
            </Button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {chapters.map((chapter) => {
              const StatusIcon = statusIcon[chapter.status];
              const { label, variant } = statusConfig[chapter.status];
              return (
                <div key={chapter.id} className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-ink-300 dark:hover:border-ink-600 hover:shadow-sm transition-all cursor-pointer group"
                  onClick={() => navigate(workChapterPath(projectId, chapter.id))}>
                  <span className="text-xs text-zinc-400 w-6 text-right shrink-0">{chapter.order}</span>
                  <StatusIcon className="h-4 w-4 text-zinc-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{chapter.title}</p>
                      {chapter.pacingTag && (
                        <span className={`hidden lg:inline text-[10px] px-1.5 py-0.5 rounded font-medium ${PACING_COLORS[chapter.pacingTag]}`}>{PACING_LABELS[chapter.pacingTag]}</span>
                      )}
                      {chapter.conflictType && chapter.conflictType !== 'none' && (
                        <span className="hidden xl:inline text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300">{CONFLICT_LABELS[chapter.conflictType]}</span>
                      )}
                      {warningsByChapter[chapter.id] && (
                        <span title={`${warningsByChapter[chapter.id]}条节奏警告`}>
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        </span>
                      )}
                    </div>
                    {chapter.summary && <p className="text-xs text-zinc-500 truncate mt-0.5">{chapter.summary}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-zinc-400 hidden sm:block">{formatWordCount(chapter.wordCount)}</span>
                    <Badge variant={variant} className="hidden sm:inline-flex">{label}</Badge>
                    <span className="text-xs text-zinc-400 hidden md:block">{formatDate(chapter.updatedAt)}</span>
                    <button onClick={e => { e.stopPropagation(); setDeleteTarget(chapter); }}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onClose={() => setCreateOpen(false)} className="max-w-sm">
          <DialogHeader><DialogTitle>新建章节</DialogTitle></DialogHeader>
          <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="章节标题，如：第一章 踏上征途" autoFocus onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!newTitle.trim()}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)} className="max-w-sm">
          <DialogHeader><DialogTitle>删除章节</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">确定删除《{deleteTarget?.title}》？此操作不可撤销。</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={open => !open && !aiGenerating && setAiOpen(false)}>
        <DialogContent onClose={() => !aiGenerating && setAiOpen(false)} className="max-w-md">
          <DialogHeader><DialogTitle>AI继续生成章节</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">生成章节数</label>
              <Input value={aiCount} onChange={e => setAiCount(e.target.value)} placeholder="例如：20" inputMode="numeric" />
              <p className="text-xs text-zinc-400 mt-1">将基于已有章节上下文追加到本卷后续章节</p>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">额外要求（可选）</label>
              <Textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} placeholder="例如：保持悬疑节奏，主角逐步升级，伏笔在20章内回收" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiOpen(false)} disabled={aiGenerating}>取消</Button>
            <Button onClick={handleAIContinueGenerate} disabled={aiGenerating} className="gap-1.5">
              {aiGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              {aiGenerating ? '生成中...' : '开始生成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
