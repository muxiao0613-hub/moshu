import { useState, useEffect } from 'react';
import { Clock, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { computeDiff } from '@/shared/lib/diff';
import { formatDate } from '@/shared/lib/utils';
import { cn } from '@/shared/lib/utils';
import { stripHtml } from '@/features/ai/aiService';
import { getChapterVersions, getChapterVersionContent } from '@/api';
import type { Chapter, ChapterVersion } from '@/shared/types';

interface VersionHistoryProps {
  chapter: Chapter;
  onRestore: (content: string) => void;
}

export function VersionHistory({ chapter, onRestore }: VersionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<ChapterVersion[]>([]);
  const [selected, setSelected] = useState<ChapterVersion | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showDiff, setShowDiff] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoadingList(true);
    getChapterVersions(chapter.id, chapter.projectId)
      .then(setVersions)
      .finally(() => setLoadingList(false));
    setSelected(null);
  }, [open, chapter.id, chapter.projectId]);

  const handleSelectVersion = async (v: ChapterVersion) => {
    if (v.content) { setSelected(v); return; }
    setLoadingContent(true);
    try {
      const full = await getChapterVersionContent(chapter.id, v.id, chapter.projectId);
      setSelected(full);
      setVersions(prev => prev.map(x => x.id === full.id ? full : x));
    } finally {
      setLoadingContent(false);
    }
  };

  const currentText = stripHtml(chapter.content);
  const selectedText = selected?.content ? stripHtml(selected.content) : '';
  const diff = selected?.content ? computeDiff(selectedText, currentText) : null;

  const handleRestore = () => {
    if (!selected?.content) return;
    onRestore(selected.content);
    setOpen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title="历史版本（手动保存后生成）"
        className="gap-1.5 h-7 text-xs"
      >
        <Clock className="h-3.5 w-3.5" />
        历史版本
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClose={() => setOpen(false)} className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>历史版本 · {chapter.title}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-4 min-h-0" style={{ maxHeight: '70vh' }}>
            {/* 左：版本列表 */}
            <div className="w-48 shrink-0 border-r border-zinc-200 dark:border-zinc-700 pr-4 overflow-auto">
              <p className="text-xs text-zinc-400 mb-2">点击版本查看差异</p>
              {loadingList ? (
                <p className="text-xs text-zinc-400">加载中...</p>
              ) : versions.length === 0 ? (
                <p className="text-xs text-zinc-400">暂无记录</p>
              ) : (
                <div className="space-y-1">
                  {versions.map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVersion(v)}
                      className={cn(
                        'w-full text-left px-2 py-2 rounded-md text-xs transition-colors',
                        selected?.id === v.id
                          ? 'bg-ink-100 dark:bg-ink-900/30 text-ink-700 dark:text-ink-300'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                      )}
                    >
                      <p className="font-medium">{formatDate(v.createdAt)}</p>
                      {v.note && <p className="text-zinc-400 mt-0.5 truncate">{v.note}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 右：diff 视图 */}
            <div className="flex-1 overflow-auto min-w-0">
              {!selected ? (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  选择左侧版本查看与当前内容的差异
                </div>
              ) : loadingContent ? (
                <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
                  加载版本内容...
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span>版本时间：{formatDate(selected.createdAt)}</span>
                      <span className="text-zinc-300">·</span>
                      <span>当前：{currentText.length} 字</span>
                      <span>版本：{selectedText.length} 字</span>
                    </div>
                    <button
                      onClick={() => setShowDiff(d => !d)}
                      className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      {showDiff ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {showDiff ? '纯文本' : '差异对比'}
                    </button>
                  </div>

                  {showDiff && (
                    <div className="flex gap-3 mb-2 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-red-100 dark:bg-red-900/40 rounded" />
                        <span className="text-zinc-500">版本有，当前已删</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-3 h-3 bg-green-100 dark:bg-green-900/40 rounded" />
                        <span className="text-zinc-500">当前新增</span>
                      </span>
                    </div>
                  )}

                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-serif p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-auto max-h-96"
                    style={{ fontFamily: 'Noto Serif SC, SimSun, serif' }}>
                    {showDiff && diff
                      ? diff.map((token, i) => (
                          <span key={i} className={cn(
                            token.type === 'delete' && 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 line-through',
                            token.type === 'insert' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
                          )}>
                            {token.value}
                          </span>
                        ))
                      : currentText
                    }
                  </div>

                  <div className="flex justify-end mt-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRestore}
                      disabled={!selected.content}
                      className="gap-1.5 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      恢复为此版本
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
