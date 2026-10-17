/**
 * 大纲节点编辑弹窗：标题 / 类型 / 概要（含 AI 生成）/ 关联正文章节。
 *
 * 拆分位置：原 `OutlineTree.tsx` 内的「Edit Dialog」；弹窗不自己保存，
 * `onChange` 把编辑中的节点回传给主容器（它同时维护 AI 面板的模块上下文），
 * `onSave` 才真正落库。标题为空时禁用保存按钮（与拆分前一致）。
 * 依赖方向：依赖 `@/shared/ui/*`、`@/features/ai/AIFieldButton`、`@/features/ai/aiService`，
 * 以及同目录 `outlineTreeUtils` 的标题/兄弟节点纯函数；不依赖主容器。
 */

import { generateForOutline } from '@/features/ai/aiService';
import { AIFieldButton } from '@/features/ai/AIFieldButton';
import type { Chapter, Character, Outline, Project, WorldSetting } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { getEditDialogTitle, getSiblingNodes } from './outlineTreeUtils';

interface OutlineEditDialogProps {
  target: Outline;
  projectId: string;
  project: Project | null;
  outlines: Outline[];
  chapters: Chapter[];
  characters: Character[];
  worldSettings: WorldSetting[];
  /** 编辑中节点的回传（标题 / 类型 / 概要 / 关联章节任一字段变化）。 */
  onChange: (next: Outline) => void;
  /** 关闭弹窗（仅收起弹窗）。 */
  onClose: () => void;
  /** 取消：除关闭外还要清掉 AI 面板的模块上下文。 */
  onCancel: () => void;
  onSave: () => void;
}

export function OutlineEditDialog({
  target, projectId, project, outlines, chapters, characters, worldSettings,
  onChange, onClose, onCancel, onSave,
}: OutlineEditDialogProps) {
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{getEditDialogTitle(target.type)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-3">
            <Input
              value={target.title}
              onChange={e => onChange({ ...target, title: e.target.value })}
              placeholder="标题"
              className="flex-1"
              autoFocus
            />
            <Select
              value={target.type}
              onChange={e => onChange({ ...target, type: e.target.value as Outline['type'] })}
              className="w-24"
            >
              <option value="volume">卷</option>
              <option value="arc">篇</option>
              <option value="chapter">章</option>
            </Select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-zinc-500">概要</label>
              <AIFieldButton
                onGenerate={() => generateForOutline({
                  project: project || { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() },
                  outline: target,
                  field: 'summary',
                  instruction: '',
                  allChars: characters,
                  allWorld: worldSettings,
                  siblings: getSiblingNodes(outlines, target.parentId, target.id),
                })}
                onResult={result => onChange({ ...target, summary: result })}
                label="AI生成"
              />
            </div>
            <Textarea
              value={target.summary}
              onChange={e => onChange({ ...target, summary: e.target.value })}
              placeholder="本章节发生了什么..."
              rows={3}
            />
          </div>
          {target.type === 'chapter' && (
            <div>
              <label className="text-xs font-medium text-zinc-500 block mb-1">关联正文章节</label>
              <Select
                value={target.chapterId || ''}
                onChange={e => onChange({ ...target, chapterId: e.target.value || undefined })}
              >
                <option value="">不关联</option>
                {chapters.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>取消</Button>
          <Button onClick={onSave} disabled={!target.title.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
