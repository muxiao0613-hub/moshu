/**
 * AI 续写大纲弹窗：输入要求与章数 → 生成草稿预览 → 一次追加入大纲。
 *
 * 拆分位置：原 `OutlineTree.tsx` 内的「AI 续写大纲对话框」及其状态（章数 / 要求 / loading / 预览）。
 * 入口按钮在 `OutlineTreeToolbar.tsx`，挂载与刷新由主容器控制（`onSaved` 回调触发重新取数）。
 * 依赖方向：依赖 `@/api`、`@/features/ai/aiService`、`@/shared/ui/*` 与同目录 `outlineTreeUtils`
 * 的节点工厂；不依赖主容器。
 */

import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { saveOutline } from '@/api';
import type { OutlineContinuationDraft } from '@/features/ai/aiService';
import { generateOutlineContinuation } from '@/features/ai/aiService';
import type { Character, Outline, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { createContinuationNode, getLastRootVolume, getNextChapterOrder } from './outlineTreeUtils';

interface OutlineContinuationDialogProps {
  projectId: string;
  project: Project | null;
  outlines: Outline[];
  characters: Character[];
  onClose: () => void;
  /** 追加完成后重新拉取大纲/章节等数据。 */
  onSaved: () => Promise<void>;
}

export function OutlineContinuationDialog({
  projectId, project, outlines, characters, onClose, onSaved,
}: OutlineContinuationDialogProps) {
  const [aiContCount, setAiContCount] = useState('5');
  const [aiContInstr, setAiContInstr] = useState('');
  const [aiContLoading, setAiContLoading] = useState(false);
  const [aiContPreview, setAiContPreview] = useState<OutlineContinuationDraft[]>([]);

  const handleAIContinue = async () => {
    if (!project) return;
    setAiContLoading(true);
    setAiContPreview([]);
    try {
      const drafts = await generateOutlineContinuation({
        project,
        existingOutlines: outlines,
        characters: characters,
        instruction: aiContInstr,
        count: parseInt(aiContCount) || 5,
      });
      setAiContPreview(drafts);
    } catch (e) {
      toast.error('AI续写大纲失败：' + (e as Error).message);
    } finally {
      setAiContLoading(false);
    }
  };

  const handleSaveAICont = async () => {
    const lastChapterOrder = getNextChapterOrder(outlines);
    // 找挂载的父节点（最后一个卷）
    const lastVolume = getLastRootVolume(outlines);

    for (let i = 0; i < aiContPreview.length; i++) {
      await saveOutline(createContinuationNode({
        id: uuidv4(),
        projectId,
        draft: aiContPreview[i],
        fallbackParentId: lastVolume?.id ?? null,
        order: lastChapterOrder + i + 1,
      }));
    }
    setAiContPreview([]);
    onClose();
    await onSaved();
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>AI 续写大纲</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-500 block mb-1">续写要求（可选）</label>
              <Textarea
                value={aiContInstr}
                onChange={e => setAiContInstr(e.target.value)}
                placeholder="如：主角开始踏上修炼之路，引入第一个大反派…"
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <div className="w-20 shrink-0">
              <label className="text-xs font-medium text-zinc-500 block mb-1">续写章数</label>
              <Input
                type="number"
                min={1} max={30}
                value={aiContCount}
                onChange={e => setAiContCount(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Button onClick={handleAIContinue} disabled={aiContLoading} className="w-full gap-2">
            {aiContLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" />生成中…</>
              : <><Wand2 className="h-4 w-4" />生成续写大纲</>
            }
          </Button>

          {/* 预览 */}
          {aiContPreview.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5">
                预览（共 {aiContPreview.length} 章，点「保存到大纲」追加）
              </p>
              <div className="space-y-1.5 max-h-52 overflow-auto">
                {aiContPreview.map((d, i) => (
                  <div key={i} className="px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{d.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{d.summary}</p>
                    {d.keyEvents?.length > 0 && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        关键：{d.keyEvents.slice(0, 3).join('；')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSaveAICont}
            disabled={aiContPreview.length === 0}
          >
            保存到大纲 ({aiContPreview.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
