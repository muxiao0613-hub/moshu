/**
 * 短篇写作台 · AI 生成 hook：右侧面板的全部状态、流式画布与 12 个 AI 动作（成稿/骨架/内核/开头/全文/续写/改写/质检/结尾/精修/补足/终审）。
 *
 * 在拆分中的位置：workspace 的两大 hook 之一（另一为 useStoryEditor），由 StoryWorkspaceView 组合；
 * 对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./types + ./utils + ./useStoryEditor（仅类型）+ @/features/short-story 门面服务，
 * 不依赖 workspace 的视图组件（视图反向依赖本 hook）。
 */
import { useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { countWords, saveShortStory } from '@/api';
import { stripHtml } from '@/features/ai/aiService';
import {
  generateStoryStructure, generateFullShortStory, generateStoryTitle,
  generateMultipleOpenings, generateMultipleEndings, reviewShortStoryQuality,
  rewriteSelection, continueShortStory, enhanceStoryPremise, reviseFullShortStory,
  completeShortStoryToTarget,
} from '@/features/short-story/shortStoryService';
import { getTemplateForGenre } from '@/features/short-story/shortStoryTemplates';
import { ensureChapterHtml } from '@/shared/lib/contentFormat';
import { getAIErrorMessage } from '@/shared/lib/utils';
import type { ShortStory, ShortStoryQualityReport, ShortStoryVersion } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import { generateStoryDraft } from './draftPipeline';
import { useStoryRequests, type StoryRequestScope } from './requestScope';
import type { Canvas, PanelTab, ResultMode, StoryGenerationApi } from './types';
import type { StoryEditorApi } from './useStoryEditor';
import {
  isAcceptableFinalDraft, mergeEnhancementConstraint,
} from './utils';

export function useStoryGeneration(editorApi: StoryEditorApi): StoryGenerationApi {
  const { story, storyRef, setStory, editor, saveDraft, setTitleInput, tryAutoTitle } = editorApi;

  const [tab,            setTab]            = useState<PanelTab>('full');
  const [loading,        setLoading]        = useState<string | null>(null);
  const [error,          setError]          = useState('');
  const [canvas,         setCanvas]         = useState<Canvas>('idle');
  const [streamText,     setStreamText]     = useState('');
  const [resultText,     setResultText]     = useState('');
  const [resultMode,     setResultMode]     = useState<ResultMode>(null);
  const [streamLabel,    setStreamLabel]    = useState('');
  const [continueInstr,  setContinueInstr]  = useState('');
  const [rewriteInstr,   setRewriteInstr]   = useState('');
  const [qualityReport,  setQualityReport]  = useState<ShortStoryQualityReport | null>(null);
  const [copied,         setCopied]         = useState<string | null>(null);
  const [expandedPt,     setExpandedPt]     = useState<string | null>(null);
  const [styleOpen,      setStyleOpen]      = useState(false);
  const [openings,       setOpenings]       = useState<string[]>([]);
  const [chosenIdx,      setChosenIdx]      = useState<number | null>(null);
  const [openingsLoading,setOpeningsLoading]= useState(false);
  const [craftOpen,      setCraftOpen]      = useState(false);
  const [endings, setEndings] = useState<string[]>([]);
  const candidate = useRef<StoryRequestScope | null>(null);
  const [revisionInstr,  setRevisionInstr]  = useState('');

  useEffect(() => {
    setQualityReport(story?.qualityReport?.status === 'current' ? story.qualityReport : null);
    setOpenings([]); setChosenIdx(null); setEndings([]); setResultText(''); setResultMode(null);
    setStreamText(''); setCanvas('idle'); setError(''); setLoading(null); setOpeningsLoading(false); candidate.current = null;
  }, [story?.id]);
  useEffect(() => { if (story?.qualityReport?.status === 'stale') setQualityReport(null); }, [story?.qualityReport]);

  useEffect(() => {
    const edited = () => setQualityReport(null);
    editor?.on('update', edited); return () => { editor?.off('update', edited); };
  }, [editor]);

  // ── 画布 ──────────────────────────────────────────────────────────────────
  const appendStream = (c: string) => {
    setStreamText(t => t + c);
    if (editorApi.canvasRef.current) editorApi.canvasRef.current.scrollTop = editorApi.canvasRef.current.scrollHeight;
  };

  const requests = useStoryRequests(storyRef, editor, appendStream);
  const finishStream = (text: string, mode: ResultMode = null) => {
    setStreamText(''); setResultText(text); setResultMode(mode); setCanvas('done');
  };

  const clearCanvas = () => { requests.cancel(); setLoading(null); setOpeningsLoading(false); setEndings([]); candidate.current = null; setResultText(''); setResultMode(null); setCanvas('idle'); };

  const run = async (key: string, label: string, fn: (scope: StoryRequestScope) => Promise<void>) => {
    if (loading) return;
    const scope = requests.start(); candidate.current = scope; setEndings([]);
    setLoading(key); setError('');
    setCanvas('streaming'); setStreamText(''); setResultText('');
    setStreamLabel(label);
    try { await fn(scope); }
    catch (e) { if (!scope.current()) return; setCanvas('idle'); setError(getAIErrorMessage(e)); }
    finally { if (scope.current()) setLoading(null); }
  };

  // ── 插入 / 替换全文 ───────────────────────────────────────────────────────
  const insertResult = async (text: string, replace = false) => {
    const scope = candidate.current, s = storyRef.current;
    if (!scope || !s || !editor) return;
    try {
      scope.checkContent();
      const html = ensureChapterHtml(text), oldHtml = editor.getHTML();
      if (replace) editor.commands.setContent(html);
      else if (resultMode === 'selection') editor.chain().focus().insertContentAt(scope.selection, html).run();
      else editor.chain().focus().insertContent(html).run();
      const saved = await saveDraft(s, editor.getHTML(), { status: 'revised',
        versions: [...(s.versions || []), { id: uuidv4(), content: oldHtml, savedAt: new Date(), note: '采用候选前版本' }] });
      if (!saved) return;
      if (!scope.current()) return;
      clearCanvas(); setQualityReport(null); toast.success('已采用并保存，原稿已存版本'); tryAutoTitle(text);
    } catch (e) { setError(getAIErrorMessage(e)); }
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text); setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const replaceMiddleDraft = async (text: string, note: string, expectedId: string, status: ShortStory['status'] = 'revised') => {
    const s = storyRef.current;
    if (!editor || !s) throw new Error('编辑器尚未就绪，生成稿未采用');
    if (s.id !== expectedId) throw new Error('已切换故事，生成结果未覆盖新故事');
    const oldHtml = editor.getHTML();
    const html = ensureChapterHtml(text);
    editor.commands.setContent(html);
    const saved = await saveDraft(s, html, {
      status,
      updatedAt: new Date(),
      versions: [...(s.versions || []), { id: uuidv4(), content: oldHtml || s.content, savedAt: new Date(), note } as ShortStoryVersion],
    });
    if (!saved) throw new Error('生成稿保存失败，正文已留在编辑器和可用的本地备份中');
  };

  // ── AI 操作 ───────────────────────────────────────────────────────────────
  const handleOneClickFullDraft = async () => {
    const initial = storyRef.current;
    if (!initial || loading) return;

    const existingPlain = stripHtml(editor?.getHTML() || initial.content || '').trim();
    if (existingPlain.length > 200) {
      const ok = window.confirm('当前正文已经有内容。一键自动成稿会生成新稿并替换编辑器正文，建议先点「保存版本」。是否继续？');
      if (!ok) return;
    }

    await run('oneClickFull', '深化内核 → 骨架 → 开头 → 全文', async scope => {
      const draft = await generateStoryDraft(initial, scope, setStory);
      scope.checkContent();
      await replaceMiddleDraft(draft.content, '一键成稿前版本', initial.id);
      scope.check();
      await saveShortStory({ id: initial.id, title: draft.story.title });
      scope.check(); setTitleInput(draft.story.title); clearCanvas(); setTab('review');
      toast.success('全文已保存，原稿已存版本，请做质检');
    });
  };

  const handleGenerateStructure = async () => {
    const s = storyRef.current;
    if (!s || loading) return;
    const scope = requests.start(); candidate.current = scope;
    setLoading('structure'); setError('');
    try {
      const template = getTemplateForGenre(s.genre);
      const pts = await generateStoryStructure({ story: s, templateLabels: template.points.map(p => p.label), onChunk: () => {} });

      scope.check();
      const noTitle = !s.title || s.title === '无标题故事';
      let autoGenTitle = '';
      if (noTitle) {
        try {
          const structContent = `故事核心：${s.premise || ''}\n` + pts.map(p => `${p.label}：${p.content}`).join('\n');
          autoGenTitle = await generateStoryTitle({ story: s, content: structContent });
        } catch { /* 标题生成失败不影响骨架保存 */ }
      }

      scope.check();
      const updated = {
        ...s,
        plotPoints: pts,
        ...(autoGenTitle ? { title: autoGenTitle } : {}),
        updatedAt: new Date(),
      };
      setStory(updated);
      await saveShortStory({ id: s.id, plotPoints: pts, ...(autoGenTitle ? { title: autoGenTitle } : {}) });
      scope.check(); if (autoGenTitle) setTitleInput(autoGenTitle);
      setExpandedPt(pts[0]?.id ?? null);
      toast.success(`骨架已生成 ${pts.length} 个节点${autoGenTitle ? `，标题：《${autoGenTitle}》` : ''}`);
    } catch (e) { if (scope.current()) setError(getAIErrorMessage(e, '骨架生成失败')); }
    finally { if (scope.current()) setLoading(null); }
  };

  const handleEnhancePremise = async () => {
    const s = storyRef.current;
    if (!s || loading) return;
    const scope = requests.start(); candidate.current = scope;
    setLoading('premise'); setError('');
    try {
      const res = await enhanceStoryPremise({ story: s, onChunk: () => {} });
      scope.check();
      const updated = {
        ...s,
        premise: s.premise,
        styleConstraint: mergeEnhancementConstraint(s.styleConstraint, res.premise, res.styleConstraint),
        updatedAt: new Date(),
      };
      setStory(updated);
      await saveShortStory({ id: s.id, styleConstraint: updated.styleConstraint });
      scope.check(); setStyleOpen(true);
      toast.success(res.editorNote || '已补强故事内核，并保留你的原始核心一句话');
    } catch (e) { if (scope.current()) setError(getAIErrorMessage(e, '故事内核深化失败')); }
    finally { if (scope.current()) setLoading(null); }
  };

  const handleGenerateOpenings = async () => {
    const s = storyRef.current;
    if (!s) return;
    const scope = requests.start(); candidate.current = scope;
    setOpeningsLoading(true); setOpenings([]); setChosenIdx(null); setError('');
    try {
      const res = await generateMultipleOpenings({ story: s, plotPoints: s.plotPoints });
      scope.check(); setOpenings(res);
      if (res.length > 0) setChosenIdx(0);
    } catch (e) { if (scope.current()) setError(getAIErrorMessage(e)); }
    finally { if (scope.current()) setOpeningsLoading(false); }
  };

  const handleGenerateFull = (skipOpening = false) => run('full', '正在生成完整故事', async scope => {
    const s = storyRef.current;
    if (!s) return;
    const chosenOpening = (!skipOpening && chosenIdx !== null && openings[chosenIdx]) ? openings[chosenIdx] : undefined;
    const content = await generateFullShortStory({ story: s, plotPoints: s.plotPoints, chosenOpening, onChunk: scope.append });
    scope.check(); finishStream(content, 'full');
    tryAutoTitle(content);
  });

  const handleContinue = () => run('continue', '正在续写', async scope => {
    const s = storyRef.current;
    if (!s) return;
    const result = await continueShortStory({ story: { ...s, content: scope.content }, plotPoints: s.plotPoints, instruction: continueInstr, onChunk: scope.append });
    scope.check(); finishStream(result, 'continue');
  });

  const handleRewrite = () => run('rewrite', '正在改写', async scope => {
    const s = storyRef.current;
    if (!s || !editorApi.selectedText.trim()) { setError('请先在编辑器中选中要改写的文字'); return; }
    const result = await rewriteSelection({
      story: s,
      selectedText: editorApi.selectedText,
      contextBefore: editorApi.selectionCtx,
      instruction: rewriteInstr,
      onChunk: scope.append,
    });
    scope.check(); finishStream(result, 'selection');
  });

  const handleReview = () => run('review', '正在深度质检', async scope => {
    const s = storyRef.current;
    if (!s) return;
    if (!await saveDraft(s, scope.content)) throw new Error('正文未保存，不能保存质检依据');
    scope.checkContent();
    const report = await reviewShortStoryQuality({ story: { ...s, content: editor?.getHTML() || s.content }, onChunk: scope.append });
    scope.checkContent();
    setQualityReport(report);
    const updated = { ...storyRef.current!, qualityReport: report, updatedAt: new Date() };
    await saveShortStory({ id: s.id, qualityReport: report });
    scope.checkContent(); setStory(updated);
    scope.check(); setCanvas('idle'); setStreamText(''); setTab('review');
  });

  const handleGenerateEndings = () => run('ending', '正在生成 3 种结尾', async scope => {
    const s = storyRef.current;
    if (!s) return;
    if (scope.selection.from === scope.selection.to) throw new Error('请先在正文中选中要替换的结尾段落，再生成结尾候选');
    const alternatives = await generateMultipleEndings({ story: { ...s, content: scope.content }, currentContent: scope.content, onChunk: scope.append });
    scope.check(); setEndings(alternatives); setResultMode('selection'); setStreamText(''); setCanvas('done');

  });

  const handleReviseFull = () => run('reviseFull', '正在进行全文精修', async scope => {
    const s = storyRef.current;
    if (!s) return;
    const result = await reviseFullShortStory({ story: { ...s, content: editor?.getHTML() || s.content }, instruction: revisionInstr, onChunk: scope.append });
    scope.check(); finishStream(result, 'full');
  });

  const handleCompleteToTarget = () => run('completeTarget', '正在补足正文并回收结尾', async scope => {
    const s = storyRef.current;
    if (!s) return;
    const result = await completeShortStoryToTarget({
      story: { ...s, content: editor?.getHTML() || s.content },
      instruction: continueInstr || '补足到目标字数，重点补关键场景、人物选择、结尾回收。',
      onChunk: scope.append,
    });
    scope.check(); finishStream(result, 'full');
  });

  const handlePublishReadyRevise = async () => {
    const s = storyRef.current;
    if (!s || !editor || loading) return;
    const originalPlain = stripHtml(editor.getHTML() || s.content || '');
    if (originalPlain.trim().length < 300) { setError('当前正文太短，请先一键自动成稿或生成完整正文'); return; }
    const scope = requests.start(); candidate.current = scope;
    setLoading('publishReady'); setError(''); setCanvas('streaming'); setStreamText(''); setResultText('');
    setStreamLabel('上线前终审：结构校准 → 语言去AI味 → 结尾回收 → 安全替换');
    try {
      const result = await reviseFullShortStory({
        story: { ...s, content: editor.getHTML() || s.content },
        instruction: revisionInstr || '按照可直接发布标准做最后一轮精修：加强开头钩子、补足中段推进、删除AI味总结、强化结尾回收。',
        onChunk: scope.append,
      });
      scope.checkContent();
      if (!isAcceptableFinalDraft(result, countWords(originalPlain))) throw new Error('终审稿疑似不完整，已拒绝替换正文');
      await replaceMiddleDraft(result, '上线前终审前版本', s.id, 'final');
      scope.check(); setCanvas('idle'); setStreamText(''); setResultText(''); setQualityReport(null);
      toast.success('已完成上线前终审，终稿已写入中间正文区');
    } catch (e) {
      if (!scope.current()) return;
      setCanvas('idle');
      setError(getAIErrorMessage(e, '上线前终审失败'));
    } finally {
      if (scope.current()) setLoading(null);
    }
  };

  return {
    tab, setTab, loading, error, setError, canvas, streamText, resultText, resultMode, streamLabel,
    continueInstr, setContinueInstr, rewriteInstr, setRewriteInstr, qualityReport, copied,
    expandedPt, setExpandedPt, styleOpen, setStyleOpen, openings, setOpenings, chosenIdx, setChosenIdx,
    openingsLoading, craftOpen, setCraftOpen, revisionInstr, setRevisionInstr,
    endings, clearCanvas, insertResult, copyText,
    handleOneClickFullDraft, handleGenerateStructure, handleEnhancePremise, handleGenerateOpenings,
    handleGenerateFull, handleContinue, handleRewrite, handleReview, handleGenerateEndings,
    handleReviseFull, handleCompleteToTarget, handlePublishReadyRevise,
  };
}
