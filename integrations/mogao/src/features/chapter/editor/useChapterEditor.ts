/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 章节编辑器的取数与保存编排。
 *
 * 拆分位置：`ChapterEditor.tsx` 是主容器（只做渲染编排），本 hook 承担原来混在
 * 容器里的全部非渲染逻辑 —— 取数、TipTap 实例、自动保存 / 卸载兜底、定稿后提取
 * 人物状态、节奏与事件标签写入、本地备份恢复。渲染交给 `editor/Chapter*`
 * 各组件，备份读写交给 `editor/localDraftBackup.ts`。
 * 依赖方向：`useChapterEditor` → `localDraftBackup` + `@/api` + `@/features/ai` +
 * `@/shared/*`；不反向依赖任何 `editor/Chapter*.tsx` 组件。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import CharacterCount from '@tiptap/extension-character-count';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor as useTipTapEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  countWords, getChapter, getChapters, getProject, getThreads,
  saveChapter, saveChapterVersion,
} from '@/api';
import { characterSyncReportText, synchronizeChapter } from '@/features/chapter/writeback';
import { useEditor } from '@/shared/contexts/EditorContext';
import { useDraftSaver } from '@/shared/lib/useDraftSaver';
import type { DraftConflict } from '@/shared/lib/draftConflict';
import { registerDraftFlush } from '@/shared/lib/draftFlush';
import { ensureChapterHtml } from '@/shared/lib/contentFormat';
import type { ConflictType, PacingTag } from '@/shared/lib/pacingTracker';
import type { Chapter, CharacterSyncPreferences, PlotThread } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import type { LocalDraftBackup } from './localDraftBackup';
import { clearLocalBackup, clearMatchingBackup, readLocalBackup, writeLocalBackup } from './localDraftBackup';

/** 工具栏右上角保存状态：已保存 / 有改动未保存 / 保存中。 */
export type SaveState = 'saved' | 'unsaved' | 'saving';

/** 主容器渲染所需的全部数据与回调（组件不再自己取数）。 */
export interface ChapterEditorModel {
  chapter: Chapter | undefined;
  conflict: DraftConflict<Chapter> | null;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  loadError: string;
  retryLoad: () => void;
  chapters: Chapter[];
  editor: Editor | null;
  saveState: SaveState;
  wordCount: number;
  threads: PlotThread[];
  projectPlatform: string | undefined;
  stateUpdateMsg: string;
  backupToRestore: LocalDraftBackup | null;
  currentIndex: number;
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  saveNow: (addVersion?: boolean) => Promise<Chapter | undefined>;
  syncCharacters: () => Promise<void>;
  profileSyncBusy: boolean;
  saveTitle: (title: string) => Promise<void>;
  handleStatusChange: (status: string) => Promise<void>;
  handlePacingChange: (pacingTag: string) => Promise<void>;
  handleConflictTypeChange: (conflictType: string) => Promise<void>;
  handleRestoreBackup: () => void;
  handleDiscardBackup: () => void;
  /** 场景条重写后回写章对象与编辑器正文（同原来 SceneBar 的 onChapterChange）。 */
  applyChapterChange: (next: Chapter) => void;
}

export function useChapterEditor(projectId: string, cid: string | undefined): ChapterEditorModel {
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setCurrentChapter, setCurrentContent, setSelectedText, setInsertCallback, setModuleCtx } = useEditor();

  const [chapter, setChapter] = useState<Chapter | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [stateUpdateMsg, setStateUpdateMsg] = useState('');
  const [profileSyncBusy, setProfileSyncBusy] = useState(false);
  const [backupToRestore, setBackupToRestore] = useState<LocalDraftBackup | null>(null);
  const [projectPlatform, setProjectPlatform] = useState<string | undefined>(undefined);
  const activeIdRef = useRef(cid);
  activeIdRef.current = cid;
  const backupWarningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setChapter(undefined);
    setLoadError('');
    if (cid && projectId) {
      getChapter(cid, projectId).then(ch => {
        if (!cancelled) { setChapter(ch); if (ch) drafts.loaded(ch); }
        if (!cancelled && !ch) setLoadError('章节不存在，请返回章节列表');
      }).catch(() => { if (!cancelled) setLoadError('章节读取失败，请重试'); });
      getChapters(projectId).then(list => { if (!cancelled) setChapters(list); }).catch(() => toast.error('章节列表读取失败'));
      getThreads(projectId).then(list => { if (!cancelled) setThreads(list); }).catch(() => toast.error('伏笔读取失败'));
      // 只为「格式体检条」取目标平台，取不到就用 自由创作
      getProject(projectId).then(p => setProjectPlatform(p?.targetPlatform)).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [cid, projectId, loadAttempt]);

  const editor = useTipTapEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始写作...' }),
      CharacterCount,
    ],
    content: '',
    onUpdate({ editor }) {
      if(editor.view.composing)return;
      const html = editor.getHTML();
      const ch = latestRef.current.chapter;
      if (!ch || ch.id !== activeIdRef.current) return;
      const backedUp = writeLocalBackup(ch.id, html);
      if (!backedUp && !backupWarningRef.current) {
        backupWarningRef.current = true;
        toast.error('本地备份不可用，请及时保存，保存成功前不要关闭页面');
      }
      setCurrentContent(html);
      setSaveState('unsaved');
      scheduleAutoSave();
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        const text = editor.state.doc.textBetween(from, to, '\n');
        setSelectedText(text);
      } else {
        setSelectedText('');
      }
    },
    editorProps: { attributes: { class: 'tiptap-editor ProseMirror focus:outline-none min-h-full' } },
  });

  const latestRef = useRef({ editor, chapter, saveState });
  latestRef.current = { editor, chapter, saveState };

  const drafts = useDraftSaver<Chapter>({
    save: (ch, content, patch, condition) => saveChapter({ id: ch.id, projectId: ch.projectId, ...patch, content, wordCount: countWords(content), ...condition }),
    backupVersion: (ch, content) => saveChapterVersion(ch.id, ch.projectId, content, '选择远端前的本机稿').then(() => undefined),
    current: () => ({ id: activeIdRef.current, content: latestRef.current.editor?.getHTML(), composing:latestRef.current.editor?.view.composing }),
    applied: (saved, content) => {
      clearMatchingBackup(saved.id, content);
      if (content !== saved.content) writeLocalBackup(saved.id, content);
      if (activeIdRef.current !== saved.id) return;
      if (latestRef.current.editor?.getHTML() !== content) latestRef.current.editor?.commands.setContent(content, {emitUpdate:false});
      setCurrentContent(content); setChapter(saved);
      latestRef.current.chapter = saved;
      setSaveState(content === saved.content ? 'saved' : 'unsaved');
    },
    failed: (_error, conflict) => { setSaveState('unsaved'); toast.error(conflict ? '正文修改重叠，请在对照面板选择；两份稿均保留'
      : backupWarningRef.current ? '保存失败且本地备份不可用，请复制正文并重试' : '保存失败，草稿保留在本地，请重试'); },
  });
  const persistContent = useCallback(async (ch: Chapter, content: string): Promise<Chapter | undefined> => {
    backupWarningRef.current = !writeLocalBackup(ch.id, content);
    if (backupWarningRef.current) toast.error('本地备份不可用，请复制正文');
    return drafts.persist(ch, content);
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const { editor: ed, chapter: ch } = latestRef.current;
      if (!ed || !ch || ch.id !== activeIdRef.current || drafts.blocked()) return;
      if(ed.view.composing){scheduleAutoSave();return;}
      const content = ed.getHTML();
      if (content === ch.content) { setSaveState('saved'); clearMatchingBackup(ch.id, content); return; }
      setSaveState('saving');
      await persistContent(ch, content);
    }, 3000);
  }, [persistContent]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const { editor: ed, chapter: ch } = latestRef.current;
      if (!ed || !ch || ch.id !== cid || ed.view.composing) return;
      const content = ed.getHTML();
      if (content !== ch.content) {
        // 卸载时尽力保存；失败则留本地备份，下次打开可恢复
        void persistContent(ch, content);
      }
    };
  }, [cid, projectId, persistContent]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const { editor: ed, chapter: ch } = latestRef.current;
      if (ed && ch && ed.getHTML() !== ch.content) {
        writeLocalBackup(ch.id, ed.getHTML());
        e.preventDefault();
        e.returnValue = '有未保存的内容，确定要离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!editor) return;
    setInsertCallback(() => async (text: string, options?: { characterSync?: CharacterSyncPreferences }) => {
      const current = latestRef.current.chapter;
      if (!current || current.id !== activeIdRef.current) throw new Error('章节已切换，请重新生成');
      const html = ensureChapterHtml(text);
      editor.chain().focus().insertContent(html).run();
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      const saved = await persistContent(current, editor.getHTML());
      if (!saved) throw new Error('正文已插入但保存失败，请在编辑器重试保存；档案尚未更新');
      if (activeIdRef.current === saved.id) setStateUpdateMsg('正文已保存，正在选择性更新人物档案…');
      try {
        const report = await synchronizeChapter(saved, options?.characterSync);
        if (activeIdRef.current === saved.id) setStateUpdateMsg(characterSyncReportText(report));
        if (report.errors.length) throw new Error('部分人物档案更新失败，可在人物档案页重试');
      } catch (error) {
        if (activeIdRef.current === saved.id) setStateUpdateMsg('正文已保存，人物档案更新失败，可在档案页重试');
        throw error;
      }
    });
    return () => setInsertCallback(null);
  }, [editor, persistContent, setInsertCallback]);

  useEffect(() => {
    if (!editor || !chapter) return;
    if (editor.getHTML() !== chapter.content) {
      editor.commands.setContent(chapter.content || '', {emitUpdate:false});
    }
    setSaveState('saved');
    setCurrentChapter(chapter);
    setCurrentContent(chapter.content || '');
    setModuleCtx({ type: 'chapter', label: chapter.title, entityId: chapter.id });

    // 存在与服务端不同的本地备份（上次保存失败遗留）→ 提示恢复
    const backup = readLocalBackup(chapter.id);
    if (backup && backup.content && backup.content !== (chapter.content || '')) {
      setBackupToRestore(backup);
    } else {
      setBackupToRestore(null);
      if (backup) clearLocalBackup(chapter.id); // 内容已一致，清理陈旧备份
    }
  }, [chapter?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = useCallback(async (addVersion = true) => {
    if (!editor || !chapter) return;
    if(editor.view.composing)return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setSaveState('saving');
    const content = editor.getHTML();
    if (addVersion && chapter.content) {
      try { await saveChapterVersion(chapter.id, chapter.projectId, chapter.content); }
      catch { toast.error('版本备份失败，正文仍会保存'); }
    }
    return persistContent(chapter, content);
  }, [editor, chapter, persistContent]);

  const saveMetadata = async (patch: Partial<Chapter>) => {
    const current = latestRef.current.chapter;
    if (!current) return;
    try {
      const saved = await saveChapter({ id: current.id, projectId: current.projectId, ...patch });
      if (activeIdRef.current === saved.id) setChapter(saved);
      return saved;
    } catch { toast.error('章节信息保存失败，请重试'); return undefined; }
  };

  const saveTitle = async (title: string) => {
    if (!chapter || title === chapter.title) return;
    await saveMetadata({ title });
  };

  const handleStatusChange = async (status: string) => {
    if (!chapter) return;
    const prevStatus = chapter.status;
    const current = await persistContent(chapter, editor?.getHTML() ?? chapter.content);
    if (!current) return;
    const saved = await saveMetadata({ status: status as Chapter['status'] });
    if (saved && status === 'final' && prevStatus !== 'final') void triggerCharacterStateUpdate(saved);
  };

  const triggerCharacterStateUpdate = async (saved: Chapter) => {
    if (activeIdRef.current === saved.id) setStateUpdateMsg('正在按写作设置更新本章人物档案…');
    try {
      const report = await synchronizeChapter(saved);
      if (activeIdRef.current === saved.id) setStateUpdateMsg(characterSyncReportText(report));
    } catch (error) {
      if (activeIdRef.current === saved.id) setStateUpdateMsg(`正文已保存，人物档案更新失败：${error instanceof Error ? error.message : '请重试'}`);
    }
  };
  const syncCharacters = async () => {
    const current = latestRef.current;
    if (!current.chapter || !current.editor || profileSyncBusy) return;
    setProfileSyncBusy(true);
    try {
      const saved = await persistContent(current.chapter, current.editor.getHTML());
      if (saved) await triggerCharacterStateUpdate(saved);
    } finally { setProfileSyncBusy(false); }
  };

  const handlePacingChange = async (pacingTag: string) => {
    if (!chapter) return;
    await saveMetadata({ pacingTag: (pacingTag as PacingTag) || undefined });
  };

  const handleConflictTypeChange = async (conflictType: string) => {
    if (!chapter) return;
    await saveMetadata({ conflictType: (conflictType as ConflictType) || undefined });
  };

  const handleRestoreBackup = () => {
    if (!editor || !backupToRestore) return;
    editor.commands.setContent(backupToRestore.content);
    setCurrentContent(backupToRestore.content);
    setSaveState('unsaved');
    setBackupToRestore(null);
    scheduleAutoSave();
    toast.success('已恢复本地备份，将自动重新保存');
  };

  const handleDiscardBackup = () => {
    if (chapter) clearLocalBackup(chapter.id);
    setBackupToRestore(null);
  };

  const applyChapterChange = (next: Chapter) => {
    drafts.loaded(next);
    setChapter(next);
    if (next.content && editor) {
      editor.commands.setContent(next.content);
      setCurrentContent(next.content);
    }
  };

  const currentIndex = chapters.findIndex(c => c.id === cid);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex >= 0 && currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;
  const wordCount = chapter ? countWords(editor?.getHTML() || chapter.content) : 0;

  useEffect(() => {
    if (!cid) return;
    return registerDraftFlush(projectId, cid, async () => {
      if (activeIdRef.current !== cid) throw new Error('章节正在切换，请稍后导出');
      const saved = await saveNow(false);
      if (!saved) throw new Error('当前草稿保存失败，导出已取消，请先保存正文');
    });
  }, [projectId, cid, saveNow]);

  return {
    conflict: drafts.conflict, resolveConflict: drafts.resolve,
    chapter,
    loadError,
    retryLoad: () => setLoadAttempt(n => n + 1),
    chapters,
    editor,
    saveState,
    wordCount,
    threads,
    projectPlatform,
    stateUpdateMsg,
    backupToRestore,
    currentIndex,
    prevChapter,
    nextChapter,
    saveNow,
    syncCharacters,
    profileSyncBusy,
    saveTitle,
    handleStatusChange,
    handlePacingChange,
    handleConflictTypeChange,
    handleRestoreBackup,
    handleDiscardBackup,
    applyChapterChange,
  };
}
