/**
 * 章节编辑器（主容器）。
 *
 * 拆分位置：本文件是门面/编排层 —— 取数与保存编排全部在 `editor/useChapterEditor.ts`，
 * 工具栏 / 标题区 / 正文挂载 / 各类提示条 / 底部状态栏分别在 `editor/Chapter*.tsx`，
 * 草稿备份读写与伏笔判断是纯函数模块（`editor/localDraftBackup.ts`、`editor/threadScan.ts`）。
 * 对外导出保持 `export function ChapterEditor` 不变，调用点无需改动。
 * 依赖方向：容器 → editor/* 子模块与同目录的 FormatCheckBar / SceneBar；子模块不反向依赖容器。
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { checkChapterEnding } from '@/shared/lib/antiAiDetector';
import { DraftConflictPanel } from '@/shared/ui/DraftConflictPanel';
import { FormatCheckBar } from './FormatCheckBar';
import { SceneBar } from './SceneBar';
import { ChapterBackupBanner } from './editor/ChapterBackupBanner';
import { ChapterBody } from './editor/ChapterBody';
import { ChapterFooterBar } from './editor/ChapterFooterBar';
import {
  ChapterEndingBar, ChapterStateUpdateBar, ChapterThreadScanBar,
} from './editor/ChapterNoticeBars';
import { ChapterTitleSection } from './editor/ChapterTitleSection';
import { ChapterToolbar } from './editor/ChapterToolbar';
import { useChapterEditor } from './editor/useChapterEditor';

interface ChapterEditorProps { projectId: string; }

export function ChapterEditor({ projectId }: ChapterEditorProps) {
  const { cid } = useParams<{ cid: string }>();
  const [showThreadScan, setShowThreadScan] = useState(false);
  const [showEndingCheck, setShowEndingCheck] = useState(false);
  const [showScenes, setShowScenes] = useState(false);
  const {
    chapter, loadError, retryLoad, chapters, editor, saveState, wordCount, threads, projectPlatform,
    stateUpdateMsg, conflict, resolveConflict, backupToRestore, currentIndex, prevChapter, nextChapter,
    saveNow, syncCharacters, profileSyncBusy, saveTitle, handleStatusChange, handlePacingChange,
    handleConflictTypeChange, handleRestoreBackup, handleDiscardBackup, applyChapterChange,
  } = useChapterEditor(projectId, cid);

  if (!chapter) {
    if (loadError) return <div className="flex items-center justify-center h-full gap-3 text-sm text-zinc-500">
      <span>{loadError}</span><button onClick={retryLoad} className="text-ink-600 underline">重试</button>
    </div>;
    return (
      <div className="flex items-center justify-center h-full gap-2 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  const content = editor?.getHTML() || chapter.content;
  const endingCheck = showEndingCheck ? checkChapterEnding(content) : null;

  return (
    <div className="flex flex-col h-full">
      {/* ── 本地备份恢复提示 ── */}
      {conflict && <DraftConflictPanel local={editor?.getHTML() ?? conflict.local} remote={conflict.remote.content} onResolve={resolveConflict} />}
      {backupToRestore && (
        <ChapterBackupBanner
          backup={backupToRestore}
          onRestore={handleRestoreBackup}
          onDiscard={handleDiscardBackup}
        />
      )}

      {/* ── 工具栏（手机端横向滚动）── */}
      <ChapterToolbar
        projectId={projectId}
        chapter={chapter}
        editor={editor}
        saveState={saveState}
        showThreadScan={showThreadScan}
        showEndingCheck={showEndingCheck}
        showScenes={showScenes}
        onToggleThreadScan={() => setShowThreadScan(v => !v)}
        onToggleEndingCheck={() => setShowEndingCheck(v => !v)}
        onToggleScenes={() => setShowScenes(v => !v)}
        onStatusChange={handleStatusChange}
        onSyncCharacters={syncCharacters}
        profileSyncBusy={profileSyncBusy}
        onSave={() => saveNow(true)}
      />

      {/* ── 定稿提取人物状态消息 ── */}
      {stateUpdateMsg && <ChapterStateUpdateBar message={stateUpdateMsg} />}

      {/* ── 伏笔扫描条 ── */}
      {showThreadScan && (
        <ChapterThreadScanBar editor={editor} chapter={chapter} threads={threads} />
      )}

      {/* ── 章末检测条 ── */}
      {showEndingCheck && endingCheck && <ChapterEndingBar check={endingCheck} />}

      {/* ── 场景条 ── */}
      {showScenes && (
        <SceneBar
          projectId={projectId}
          chapter={chapter}
          onChapterChange={applyChapterChange}
        />
      )}

      {/* ── 章节标题区 ── */}
      <ChapterTitleSection chapter={chapter} onTitleCommit={saveTitle} />

      {/* ── 正文编辑区 ── */}
      <ChapterBody editor={editor} />

      {/* ── 格式体检条（本地正则、实时、不发请求）── */}
      <FormatCheckBar
        projectId={projectId}
        content={editor?.getHTML() || chapter.content || ''}
        projectPlatform={projectPlatform}
      />

      {/* ── 底部状态栏：翻章导航 + 字数 + 节奏/事件标签 ── */}
      <ChapterFooterBar
        projectId={projectId}
        chapter={chapter}
        chapterCount={chapters.length}
        currentIndex={currentIndex}
        wordCount={wordCount}
        prevChapter={prevChapter}
        nextChapter={nextChapter}
        onPacingChange={handlePacingChange}
        onConflictTypeChange={handleConflictTypeChange}
      />
    </div>
  );
}
