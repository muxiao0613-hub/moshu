/**
 * AI 助手面板 · 生成调用编排（续写 / 润色 / 章节检查 / 实体生成 / 全局一致性检查）。
 *
 * 位置：./panel 的生成层，由 AIPanel.tsx 容器把所有输入（取数结果 + 编辑上下文 + 当前模式）
 * 作为单个 params 对象传入；本 hook 只持有输出态（result/streaming/error/contextInfo/ragChunks）。
 * 依赖方向：@/api、@/features/ai/aiService、@/features/ai/ragService、@/features/context/contextPrefs、
 * @/shared/contexts（ModuleContext 类型）→ ./types；不引用展示组件。
 */
import { useEffect, useRef, useState } from 'react';
import { getChapter, getChaptersWithContent } from '@/features/chapter/api';
import { chapterHandoff } from '@/shared/lib/chapterSources';
import { getCharacters } from '@/features/character/api';

import {
  AIAbortError,
  callNovelAI,
  generateForCharacter,
  generateForOutline,
  generateForThread,
  generateForTimeline,
  generateForWorld,
  globalConsistencyCheck,
} from '@/features/ai/aiService';
import { indexChapter, retrieveRelevantChapters } from '@/features/ai/ragService';
import { ensureProjectIndex } from '@/features/ai/ragIndex';
import { loadContextPrefs } from '@/features/context/contextPrefs';
import { getAIErrorMessage } from '@/shared/lib/utils';
import type { ModuleContext } from '@/shared/contexts/EditorContext';
import type {
  AIContextInfo, Chapter, Character, FactLedger, Outline, PlotThread, Project, RagChunk,
  StoryBible, TimelineEvent, WorldSetting,
} from '@/shared/types';

import type { PanelMode } from './types';

export interface AIPanelGenerateParams {
  projectId: string;
  mode: PanelMode;
  instruction: string;
  project: Project | undefined;
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  chapters: Chapter[];
  timelineEvents: TimelineEvent[];
  storyBible: StoryBible | null;
  factLedger: FactLedger[];
  moduleCtx: ModuleContext | null;
  currentChapter: Chapter | null;
  currentContent: string;
  selectedText: string;
}

export function useAIPanelGenerate(p: AIPanelGenerateParams) {
  const {
    projectId, mode, instruction, project, characters, worldSettings, outlines, threads,
    chapters, timelineEvents, storyBible, factLedger, moduleCtx, currentChapter, currentContent,
    selectedText,
  } = p;

  const [result, setResult]           = useState('');
  const [streaming, setStreaming]     = useState(false);
  const [error, setError]             = useState('');
  const [contextInfo, setContextInfo] = useState<AIContextInfo | null>(null);
  const [ragChunks, setRagChunks]     = useState<RagChunk[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const scopeKey = `${projectId}:${mode}:${currentChapter?.id || ''}:${moduleCtx?.type || ''}:${moduleCtx?.entityId || ''}`;
  const latest = useRef(p); latest.current = p;
  const liveKey = useRef(scopeKey); liveKey.current = scopeKey;
  const source = useRef<{ key: string; content: string; entity: string } | null>(null);

  const styleFingerprint = (project as Project & { styleFingerprint?: string | null })?.styleFingerprint ?? null;

  const handleStop = () => abortRef.current?.abort();

  /** 切换模块上下文时清空上一轮输出 */
  const resetOutput = () => {
    abortRef.current?.abort(); abortRef.current = null; source.current = null; setStreaming(false);
    setResult('');
    setError('');
    setContextInfo(null); setRagChunks([]);
  };

  useEffect(() => { resetOutput(); return () => { abortRef.current?.abort(); }; }, [scopeKey]);
  const validateResult = () => {
    const saved = source.current;
    if (!saved || saved.key !== liveKey.current) throw new Error('已切换章节或功能，请重新生成');
    if (currentChapter && saved.content !== latest.current.currentContent) throw new Error('正文已改动，请重新生成候选，避免混入旧稿');
    if (saved.entity !== JSON.stringify(latest.current.moduleCtx?.entitySnapshot || {})) throw new Error('设定已改动，请重新生成候选');
  };

  const getPrevChapterSummary = async (): Promise<string> => {
    if (!currentChapter || !chapters) return '';
    const idx = chapters.findIndex(c => c.id === currentChapter.id);
    if (idx <= 0) return '';
    return chapterHandoff(await getChapter(chapters[idx - 1].id, projectId));
  };

  const handleGenerate = async () => {
    if (!project || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    source.current = { key: scopeKey, content: currentContent, entity: JSON.stringify(moduleCtx?.entitySnapshot || {}) };
    const belongs = () => abortRef.current === controller && liveKey.current === scopeKey;
    const append = (c: string) => { if (belongs() && !controller.signal.aborted) setResult(r => r + c); };
    const check = () => { if (!belongs() || controller.signal.aborted) throw new AIAbortError(); };
    setResult(''); setError(''); setContextInfo(null); setStreaming(true);

    try {
      const freshCharacters = currentChapter ? await getCharacters(projectId) : characters;
      check();
      if (mode === 'global') {
        // 全局一致性检查
        await globalConsistencyCheck({
          project,
          characters: characters || [],
          worldSettings: worldSettings || [],
          chapters: await getChaptersWithContent(projectId),
          outlines: outlines || [],
          threads: threads || [],
          onChunk: append,
          signal: controller.signal,
        });
      } else if (mode === 'generate' && moduleCtx && moduleCtx.type !== 'chapter') {
        // 各模块实体生成
        const snap = moduleCtx.entitySnapshot || {};
        let content = '';

        if (moduleCtx.type === 'character') {
          content = await generateForCharacter({
            project,
            character: snap as Parameters<typeof generateForCharacter>[0]['character'],
            field: (snap.targetField as string) || 'personality',
            fieldLabel: (snap.targetFieldLabel as string) || '性格',
            instruction,
            allChars: characters || [],
            allWorld: worldSettings || [],
            onChunk: append,
          });
        } else if (moduleCtx.type === 'world') {
          content = await generateForWorld({
            project,
            setting: snap as Parameters<typeof generateForWorld>[0]['setting'],
            instruction,
            allChars: characters || [],
            allWorld: worldSettings || [],
            onChunk: append,
          });
        } else if (moduleCtx.type === 'outline') {
          const siblings = (outlines || []).filter(o => o.parentId === (snap.parentId as string | null));
          content = await generateForOutline({
            project,
            outline: snap as Parameters<typeof generateForOutline>[0]['outline'],
            field: (snap.targetField as 'summary' | 'keyEvents') || 'summary',
            instruction,
            allChars: characters || [],
            allWorld: worldSettings || [],
            siblings,
            onChunk: append,
          });
        } else if (moduleCtx.type === 'thread') {
          content = await generateForThread({
            project,
            thread: snap as Parameters<typeof generateForThread>[0]['thread'],
            field: (snap.targetField as 'description' | 'notes') || 'description',
            instruction,
            allChars: characters || [],
            allWorld: worldSettings || [],
            onChunk: append,
          });
        } else if (moduleCtx.type === 'timeline') {
          const nearbyEvents = (timelineEvents || []).filter(e => e.line === (snap.line as string || '主线')).slice(0, 3);
          content = await generateForTimeline({
            project,
            event: snap as Parameters<typeof generateForTimeline>[0]['event'],
            instruction,
            allChars: characters || [],
            nearbyEvents,
            onChunk: append,
          });
        }
        check(); setResult(content);
      } else if (currentChapter) {
        // 续写前先确保当前章节已建立 RAG 索引
        if (mode === 'continue') {
          await ensureProjectIndex(projectId);
          await indexChapter({ ...currentChapter, content: currentContent }, projectId);
        }

        // RAG 检索相关历史章节
        let chunks: RagChunk[] = [];
        if (mode === 'continue' || mode === 'check') {
          if (mode === 'check') await ensureProjectIndex(projectId);
          const queryText = `${currentChapter.title} ${currentChapter.summary || ''} ${currentContent.replace(/<[^>]*>/g, '').slice(-500)}`;
          chunks = await retrieveRelevantChapters({
            projectId,
            queryText,
            excludeChapterIds: [currentChapter.id],
            topK: 3,
            beforeOrder: currentChapter.order,
          });
          check(); setRagChunks(chunks);
        }

        check();
        const previous = await getPrevChapterSummary(); check();
        const fakeChapter = { ...currentChapter, content: currentContent };
        // 上下文抽屉里的开关 / 固定 / 排除 / 预算 / 档位：与抽屉读同一份偏好
        const contextPrefs = loadContextPrefs(projectId);
        const { content, contextInfo: ctx } = await callNovelAI({
          prefs: contextPrefs,
          mode: mode as 'continue' | 'polish' | 'check',
          instruction,
          project,
          chapter: fakeChapter,
          characters: freshCharacters || [],
          worldSettings: worldSettings || [],
          outlines: outlines || [],
          threads: threads || [],
          prevChapterSummary: previous,
          selectedText: mode === 'polish' ? selectedText : undefined,
          storyBible,
          factLedger: factLedger || [],
          styleFingerprint,
          ragChunks: chunks,
          onChunk: append,
          signal: controller.signal,
        });
        check(); setResult(content);
        setContextInfo(ctx);
      }
    } catch (e) {
      // 用户主动停止：保留已生成的部分，不视为错误
      if (belongs() && !(e instanceof AIAbortError)) setError(getAIErrorMessage(e));
    } finally {
      if (belongs()) { setStreaming(false); abortRef.current = null; }
    }
  };

  return {
    result, streaming, error, contextInfo, ragChunks,
    handleGenerate, handleStop, resetOutput, validateResult,
  };
}
