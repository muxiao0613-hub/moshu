/**
 * 删除大纲节点的确认弹窗。
 *
 * 拆分位置：原 `OutlineTree.tsx` 内的「删除节点」Dialog；真正的删除由主容器
 * `handleDelete` 调用 api 完成，这里只负责确认与关闭（`target` 为 null 时处于关闭态）。
 * 依赖方向：依赖 `@/shared/ui/*` 与 `@/shared/types`，不依赖主容器。
 */

import type { Outline } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';

interface OutlineDeleteDialogProps {
  target: Outline | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function OutlineDeleteDialog({ target, onClose, onConfirm }: OutlineDeleteDialogProps) {
  return (
    <Dialog open={!!target} onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-sm">
        <DialogHeader><DialogTitle>删除节点</DialogTitle></DialogHeader>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">确定删除「{target?.title}」？</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant="destructive" onClick={onConfirm}>删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
