/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 短篇写作台 · 故事数据与编辑器 hook：加载故事、tiptap 编辑器、自动保存、标题/字段/骨架写入。
 *
 * 在拆分中的位置：workspace 的两大 hook 之一（另一为 useStoryGeneration），由 StoryWorkspaceView 组合；
 * 对外门面是 ../ShortStoryWorkspace.tsx（App 只依赖该门面）。
 * 依赖方向：./types + ./utils + @/api + @/features/ai 的标题服务，不依赖 workspace 的视图组件与生成 hook。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useEditor as useTipTap } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { countWords, getShortStory, saveShortStory } from '@/api';
import { generateStoryTitle } from '@/features/short-story/shortStoryService';
import { clearLocalBackup, clearMatchingBackup, readLocalBackup, writeLocalBackup, type LocalDraftBackup } from '@/features/chapter/editor/localDraftBackup';
import {registerDraftFlush} from '@/shared/lib/draftFlush';
import { useDraftSaver } from '@/shared/lib/useDraftSaver';
import type { DraftConflict } from '@/shared/lib/draftConflict';
import { toast } from '@/shared/ui/toast';
import type { ShortStory, StoryPlotPoint, ShortStoryVersion } from '@/shared/types';
import type { SaveState, TipTapEditor } from './types';
import { fallbackTitle } from './utils';

export interface StoryEditorApi {
  story: ShortStory | undefined;
  conflict: DraftConflict<ShortStory> | null;
  resolveConflict: (choice: 'local' | 'remote') => Promise<void>;
  loadError: string;
  retryLoad: () => void;
  backupToRestore: LocalDraftBackup | null;
  restoreBackup: () => void;
  discardBackup: () => void;
  /** story 的最新值，供异步回调使用 */
  storyRef: MutableRefObject<ShortStory | undefined>;
  setStory: (s: ShortStory | undefined) => void;
  titleInput: string;
  setTitleInput: Dispatch<SetStateAction<string>>;
  saveState: SaveState;
  setSaveState: Dispatch<SetStateAction<SaveState>>;
  saveStateRef: MutableRefObject<SaveState>;
  editor: TipTapEditor;
  selectedText: string;
  selectionCtx: string;
  canvasRef: RefObject<HTMLDivElement>;
  doSave: (addVersion?: boolean) => Promise<void>;
  saveDraft: (s: ShortStory, html: string, patch?: Partial<ShortStory>) => Promise<ShortStory | undefined>;
  updateField: (field: Partial<ShortStory>) => void;
  updatePlotPoint: (ptId: string, content: string) => void;
  applyTitle: (newTitle: string) => void;
  tryAutoTitle: (content: string) => void;
  /** 标题输入框失焦时落库（空标题回落为「无标题故事」） */
  updateTitle: (value: string) => void;
}

export function useStoryEditor(): StoryEditorApi {
  const { id } = useParams<{ id: string }>();
  const activeIdRef = useRef(id);
  activeIdRef.current = id;
  const editorRef = useRef<TipTapEditor | null>(null);
  const backupWarningRef = useRef(false);

  // ── story state + ref（ref 始终是最新值，供异步回调使用）──────────────────
  const [story, _setStory] = useState<ShortStory | undefined>();
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [backupToRestore, setBackupToRestore] = useState<LocalDraftBackup | null>(null);
  const storyRef = useRef<ShortStory | undefined>();
  const setStory = useCallback((s: ShortStory | undefined) => {
    if (s && s.id !== activeIdRef.current) return;
    storyRef.current = s;
    _setStory(s);
  }, []);

  // ── 标题单独提成 state，与 story.title 解耦，保证 input 立即响应 ──────────
  const [titleInput, setTitleInput] = useState('');

  // ── 其他 UI state ─────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const saveStateRef = useRef<SaveState>('saved');
  useEffect(() => { saveStateRef.current = saveState; }, [saveState]);

  const [selectedText,   setSelectedText]   = useState('');
  const [selectionCtx,   setSelectionCtx]   = useState('');

  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // ── 加载故事 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setStory(undefined);
    setLoadError('');
    getShortStory(id).then(s => {
      if (cancelled) return;
      if (!s) { setLoadError('故事不存在，请返回作品库'); return; }
      drafts.loaded(s);
      setStory(s);
      setTitleInput(s.title === '无标题故事' ? '' : (s.title || ''));
    }).catch(() => { if (!cancelled) setLoadError('故事读取失败，请重试'); });
    return () => { cancelled = true; };
  }, [id, loadAttempt]); // eslint-disable-line

  // ── 编辑器 ───────────────────────────────────────────────────────────────
  const editor = useTipTap({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始写作，或使用右侧 AI 生成...' }),
      CharacterCount,
    ],
    content: '',
    onUpdate({ editor: ed }) {
      if(ed.view.composing)return;
      const s = storyRef.current;
      if (!s || s.id !== activeIdRef.current) return;
      if (!writeLocalBackup(`story:${s.id}`, ed.getHTML()) && !backupWarningRef.current) {
        backupWarningRef.current = true;
        toast.error('本地备份不可用，请及时保存，保存成功前不要关闭页面');
      }
      setSaveState('unsaved'); scheduleAutoSave();
    },
    onSelectionUpdate({ editor }) {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        setSelectedText(editor.state.doc.textBetween(from, to, '\n'));
        setSelectionCtx(editor.state.doc.textBetween(Math.max(0, from - 250), from, '\n'));
      } else {
        setSelectedText(''); setSelectionCtx('');
      }
    },
    editorProps: { attributes: { class: 'focus:outline-none min-h-full' } },
  });
  editorRef.current = editor;

  const drafts = useDraftSaver<ShortStory>({
    save: (s, content, patch, condition) => saveShortStory({ ...patch, id: s.id, content, wordCount: countWords(content), ...condition }),
    backupVersion: (s, content) => saveShortStory({ id: s.id, versions: [{ id: uuidv4(), content, savedAt: new Date(), note: '选择远端前的本机稿' }] }).then(() => undefined),
    current: () => ({ id: activeIdRef.current, content: editorRef.current?.getHTML(),composing:editorRef.current?.view.composing }),
    applied: (saved, content) => {
      clearMatchingBackup(`story:${saved.id}`, content);
      if (content !== saved.content) writeLocalBackup(`story:${saved.id}`, content);
      if (editorRef.current?.getHTML() !== content) editorRef.current?.commands.setContent(content, {emitUpdate:false});
      setStory({ ...saved, ...(storyRef.current ?? {}), content: saved.content, wordCount: saved.wordCount,
        versions: saved.versions, qualityReport: saved.qualityReport, updatedAt: saved.updatedAt });
      setSaveState(content === saved.content ? 'saved' : 'unsaved');
    },
    failed: (_error, conflict) => { setSaveState('unsaved'); toast.error(conflict ? '正文修改重叠，请在对照面板选择；两份稿均保留'
      : backupWarningRef.current ? '保存失败且本地备份不可用，请复制正文并重试' : '保存失败，草稿保留在本地，请重试'); },
  });
  const persistContent = useCallback(async (s: ShortStory, html: string, patch: Partial<ShortStory> = {}) => {
    backupWarningRef.current = !writeLocalBackup(`story:${s.id}`, html);
    if (backupWarningRef.current) toast.error('本地备份不可用，请复制正文');
    return drafts.persist(s, html, patch);
  }, []);

  // 不能按 updatedAt 丢弃本地正文：一次标题保存也会刷新服务器时间。不同版本交由作者选择。
  useEffect(() => {
    if (!story || !editor) return;
    const backup = readLocalBackup(`story:${story.id}`);
    setBackupToRestore(backup && backup.content !== story.content ? backup : null);
    editor.commands.setContent(story.content || '', {emitUpdate:false});
    setSaveState('saved');
  }, [story?.id, editor]); // eslint-disable-line

  const scheduleAutoSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const s = storyRef.current;
      const ed = editorRef.current;
      if (!ed || !s || s.id !== activeIdRef.current || drafts.blocked()) return;
      if(ed.view.composing){scheduleAutoSave();return;}
      const html = ed.getHTML();
      if (html === s.content) return;
      setSaveState('saving');
      await persistContent(s, html);
    }, 3000);
  }, [persistContent]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const s = storyRef.current;
    const ed = editorRef.current;
    if (!ed || !s || s.id !== id || ed.view.composing) return;
    const html = ed.getHTML();
    if (html !== s.content) void persistContent(s, html);
  }, [id, persistContent]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const s = storyRef.current, ed = editorRef.current;
      if (s && ed && ed.getHTML() !== s.content) {
        writeLocalBackup(`story:${s.id}`, ed.getHTML());
        e.preventDefault(); e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // ── 保存 ──────────────────────────────────────────────────────────────────
  const doSave = useCallback(async (addVersion = false) => {
    const s = storyRef.current;
    if (!editor || !s) return;
    if(editor.view.composing)return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState('saving');
    const html = editor.getHTML();
    const saved = await persistContent(s, html, addVersion ? { versions:
        [...(s.versions || []), { id: uuidv4(), content: s.content, savedAt: new Date(), note: '手动保存' } as ShortStoryVersion] } : {});
    if (saved && addVersion) toast.success('版本已保存');
  }, [editor, persistContent]);

  useEffect(() => {
    if (!id) return;
    return registerDraftFlush(`story:${id}`, id, async () => {
      const s = storyRef.current, ed = editorRef.current;
      if (!s || !ed || s.content === ed.getHTML()) return;
      if (ed.view.composing) throw new Error('请完成输入后再离开。');
      if (!await persistContent(s, ed.getHTML())) throw new Error('故事尚未保存。');
    });
  }, [id, persistContent]);

  const updateField = (field: Partial<ShortStory>) => {
    const s = storyRef.current;
    if (!s) return;
    const updated = { ...s, ...field, updatedAt: new Date() } as ShortStory;
    setStory(updated);
    saveShortStory({ id: s.id, ...field }).catch(() => toast.error('故事设定保存失败，请重试'));
  };

  const updatePlotPoint = (ptId: string, content: string) => {
    const s = storyRef.current;
    if (!s) return;
    const pts = (s.plotPoints as StoryPlotPoint[] || []).map(p => p.id === ptId ? { ...p, content } : p);
    const updated = { ...s, plotPoints: pts, updatedAt: new Date() };
    setStory(updated);
    saveShortStory({ id: s.id, plotPoints: pts }).catch(() => toast.error('故事骨架保存失败，请重试'));
  };

  const updateTitle = (value: string) => {
    const t = value.trim() || '无标题故事';
    setTitleInput(t === '无标题故事' ? '' : t);
    const s = storyRef.current;
    if (!s || t === s.title) return;
    const updated = { ...s, title: t, updatedAt: new Date() };
    setStory(updated);
    saveShortStory({ id: s.id, title: t }).catch(() => toast.error('标题保存失败，请重试'));
  };

  // ── 自动生成标题 ─────────────────────────────────────────────────────────
  const applyTitle = (newTitle: string) => {
    const s = storyRef.current;
    if (!s) return;
    setTitleInput(newTitle);
    const updated = { ...s, title: newTitle, updatedAt: new Date() };
    setStory(updated);
    saveShortStory({ id: s.id, title: newTitle })
      .then(() => toast.success(`已自动生成标题：《${newTitle}》`))
      .catch(() => toast.error('标题保存失败，请重试'));
  };

  const tryAutoTitle = (content: string) => {
    const s = storyRef.current;
    if (!s) return;
    if (s.title && s.title !== '无标题故事') return;

    generateStoryTitle({ story: s, content })
      .then(raw => {
        if (storyRef.current?.id !== s.id) return;
        const newTitle = (raw || '').trim() || fallbackTitle(content);
        applyTitle(newTitle);
      })
      // AI 失败也兜底：从正文提取，保证一定有标题
      .catch(() => { if (storyRef.current?.id === s.id) applyTitle(fallbackTitle(content)); });
  };

  const restoreBackup = () => {
    if (!backupToRestore || !editor) return;
    editor.commands.setContent(backupToRestore.content);
    setBackupToRestore(null);
    toast.success('已恢复本地草稿，将重新保存');
  };
  const discardBackup = () => {
    if (story) clearLocalBackup(`story:${story.id}`);
    setBackupToRestore(null);
  };

  return {
    conflict: drafts.conflict, resolveConflict: drafts.resolve,
    story, loadError, retryLoad: () => setLoadAttempt(n => n + 1), storyRef, setStory, titleInput, setTitleInput, saveState, setSaveState, saveStateRef,
    editor, selectedText, selectionCtx, canvasRef, doSave, updateField, updatePlotPoint,
    applyTitle, tryAutoTitle, updateTitle, saveDraft: persistContent,
    backupToRestore, restoreBackup, discardBackup,
  };
}
