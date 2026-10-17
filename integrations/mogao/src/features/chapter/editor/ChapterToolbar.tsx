/**
 * 章节编辑器顶部工具栏：返回、排版按钮、伏笔/章末/场景入口、版本历史、状态与保存。
 *
 * 拆分位置：`ChapterEditor.tsx` 主容器只负责把 hook 的状态传下来，
 * 工具栏自身的展开状态（显示伏笔条 / 章末条 / 场景条）由主容器持有并通过 props 传入。
 * 依赖方向：只依赖 `@/shared/ui`、`@/shared/lib` 与类型，取数与保存走主容器传入的回调。
 */

import type { Editor } from '@tiptap/react';
import {
  AlertTriangle, Bold, Bookmark, CheckCircle2, ChevronLeft, Circle, Heading1, Heading2,
  Italic, Layers, Users, List, ListOrdered, Loader2, Quote, Redo, Save, Undo,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { workBase } from '@/shared/lib/workRoutes';
import type { Chapter } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { VersionHistory } from '../VersionHistory';
import type { SaveState } from './useChapterEditor';

const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'revised', label: '修改中' },
  { value: 'final', label: '定稿' },
];

interface ChapterToolbarProps {
  projectId: string;
  chapter: Chapter;
  editor: Editor | null;
  saveState: SaveState;
  showThreadScan: boolean;
  showEndingCheck: boolean;
  showScenes: boolean;
  onToggleThreadScan: () => void;
  onToggleEndingCheck: () => void;
  onToggleScenes: () => void;
  onStatusChange: (status: string) => void;
  onSave: () => void;
  onSyncCharacters: () => void;
  profileSyncBusy: boolean;
}

export function ChapterToolbar({
  projectId, chapter, editor, saveState,
  showThreadScan, showEndingCheck, showScenes,
  onToggleThreadScan, onToggleEndingCheck, onToggleScenes,
  onStatusChange, onSave, onSyncCharacters, profileSyncBusy,
}: ChapterToolbarProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shrink-0 overflow-x-auto">
      {/* 左：返回 + 排版按钮 */}
      <div className="flex items-center gap-0.5 shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate(workBase(projectId))} title="返回章节列表" className="mr-1 h-7 w-7">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-600 mx-1" />
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('bold') && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('italic') && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('heading', { level: 1 }) && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('heading', { level: 2 }) && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('bulletList') && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('orderedList') && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className={cn('h-7 w-7', editor?.isActive('blockquote') && 'bg-zinc-100 dark:bg-zinc-700')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Button>
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-600 mx-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor?.chain().focus().undo().run()}><Undo className="h-3.5 w-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editor?.chain().focus().redo().run()}><Redo className="h-3.5 w-3.5" /></Button>
      </div>

      {/* 桌面端把右侧功能区推到末端；手机端则随工具栏一起横向滚动 */}
      <div className="flex-1 min-w-[8px]" />

      {/* 右：功能按钮 + 状态 + 保存 */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* 保存状态 */}
        <span className="flex items-center gap-1 text-xs mr-1">
          {saveState === 'saved' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
          {saveState === 'unsaved' && <Circle className="h-3.5 w-3.5 text-amber-400" />}
          {saveState === 'saving' && <Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" />}
        </span>
        <Button variant="ghost" size="sm" onClick={onToggleThreadScan}
          className={cn('h-7 text-xs gap-1 px-2', showThreadScan && 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400')} title="伏笔标注">
          <Bookmark className="h-3.5 w-3.5" /><span className="hidden md:inline">伏笔</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleEndingCheck}
          className={cn('h-7 text-xs gap-1 px-2', showEndingCheck && 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400')} title="章末悬念检测">
          <AlertTriangle className="h-3.5 w-3.5" /><span className="hidden md:inline">章末</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onToggleScenes}
          className={cn('h-7 text-xs gap-1 px-2', showScenes && 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400')} title="场景条：按场景查看与重写">
          <Layers className="h-3.5 w-3.5" /><span className="hidden md:inline">场景</span>
        </Button>
        <Button variant="ghost" size="sm" disabled={profileSyncBusy} onClick={onSyncCharacters}
          className="h-7 text-xs gap-1 px-2" title="保存当前正文并按写作设置同步人物档案，也可重试失败的同步">
          {profileSyncBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}<span className="hidden md:inline">人物</span>
        </Button>
        <VersionHistory chapter={chapter} onRestore={content => editor?.commands.setContent(content)} />
        <Select value={chapter.status} onChange={e => onStatusChange(e.target.value)} className="w-20 h-7 text-xs">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Button size="sm" onClick={onSave} className="gap-1 h-7 text-xs px-2.5">
          <Save className="h-3.5 w-3.5" />保存
        </Button>
      </div>
    </div>
  );
}
