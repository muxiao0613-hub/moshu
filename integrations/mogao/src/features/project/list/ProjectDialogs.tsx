/**
 * 长篇的新建/编辑表单弹窗。
 *
 * 在拆分中的位置：受控表单组件，对外门面是 `features/project/ProjectList.tsx`
 * （门面持有表单状态与提交动作，两个弹窗只负责渲染与回传 patch）。
 * 依赖方向：`./constants`（GENRES）+ `@/shared/ui/*` →（本文件）→ 门面。
 */
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { GENRES } from './constants';
import type { NovelFormValue } from './types';

/** 长篇表单弹窗的公共契约：值 + patch 回调 + 提交/关闭。 */
export interface NovelFormProps {
  value: NovelFormValue;
  onChange: (patch: Partial<NovelFormValue>) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function QualityGoalField({ value, onChange }: Pick<NovelFormProps, 'value' | 'onChange'>) {
  return <div>
    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">创作与评审目标（可选）</label>
    <Textarea value={value.qualityGoal ?? ''} onChange={e => onChange({ qualityGoal: e.target.value })}
      placeholder="例如：慢热群像，保留心理描写；不要求每章悬念。AI 写作和评审将优先遵循这些目标。" rows={2} />
  </div>;
}

export function CreateProjectDialog({ open, onClose, value, onChange, onSubmit }: NovelFormProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              书名 <span className="text-red-500">*</span>
            </label>
            <Input
              value={value.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="请输入书名"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && onSubmit()}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">类型</label>
            <Select value={value.genre} onChange={e => onChange({ genre: e.target.value })}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">简介</label>
            <Textarea
              value={value.synopsis}
              onChange={e => onChange({ synopsis: e.target.value })}
              placeholder="用几句话描述你的故事..."
              rows={3}
            />
          </div>
          <QualityGoalField value={value} onChange={onChange} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit} disabled={!value.title.trim()}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EditProjectDialog({ open, onClose, value, onChange, onSubmit }: NovelFormProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose}>
        <DialogHeader>
          <DialogTitle>编辑项目信息</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
              书名 <span className="text-red-500">*</span>
            </label>
            <Input
              value={value.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="请输入书名"
              autoFocus
            />
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">类型</label>
            <Select value={value.genre} onChange={e => onChange({ genre: e.target.value })}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">简介</label>
            <Textarea
              value={value.synopsis}
              onChange={e => onChange({ synopsis: e.target.value })}
              placeholder="用几句话描述你的故事..."
              rows={3}
            />
          </div>
          <QualityGoalField value={value} onChange={onChange} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit} disabled={!value.title.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
