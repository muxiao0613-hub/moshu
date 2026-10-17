/**
 * 本地草稿备份的恢复提示条。
 *
 * 拆分位置：原 `ChapterEditor.tsx` 顶部的第一条提示；主容器只在
 * `useChapterEditor` 返回 backupToRestore 时渲染，恢复/忽略由 hook 的回调处理。
 * 依赖方向：只依赖 `@/shared/ui`，不取数、不落盘（落盘在 localDraftBackup.ts）。
 */

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { LocalDraftBackup } from './localDraftBackup';

interface ChapterBackupBannerProps {
  backup: LocalDraftBackup;
  onRestore: () => void;
  onDiscard: () => void;
}

export function ChapterBackupBanner({ backup, onRestore, onDiscard }: ChapterBackupBannerProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400 shrink-0">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        检测到本地未保存备份（{new Date(backup.savedAt).toLocaleString()}），可能是上次保存失败遗留。是否恢复？
      </span>
      <Button size="sm" className="h-6 text-xs px-2" onClick={onRestore}>恢复</Button>
      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={onDiscard}>忽略</Button>
    </div>
  );
}
