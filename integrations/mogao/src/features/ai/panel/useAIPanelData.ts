/**
 * AI 助手面板 · 知识库取数（9 个 getter 的 Promise.all 与刷新）。
 *
 * 位置：./panel 的取数层，被 AIPanel.tsx 容器调用，取数结果以参数形式交给
 * useAIPanelGenerate（生成上下文）与 useModuleFix（修复时比对原文）。
 * 依赖方向：@/api → 只回传 state，不产生渲染副作用；不引用展示组件与其它 hook。
 */
import { useEffect, useRef, useState } from 'react';

import {
  getCharacters, getChapters, getFactLedger, getOutlines, getProject, getStoryBible,
  getThreads, getTimelineEvents, getWorldSettings,
} from '@/api';
import { onLibraryChanged } from '@/shared/lib/libraryEvents';
import type {
  Chapter, Character, FactLedger, Outline, PlotThread, Project, StoryBible, TimelineEvent,
  WorldSetting,
} from '@/shared/types';
import { toast } from '@/shared/ui/toast';

export function useAIPanelData(projectId: string) {
  const requestRef = useRef(0);
  const [characters, setCharacters]             = useState<Character[]>([]);
  const [worldSettings, setWorldSettings]       = useState<WorldSetting[]>([]);
  const [outlines, setOutlines]                 = useState<Outline[]>([]);
  const [threads, setThreads]                   = useState<PlotThread[]>([]);
  const [chapters, setChapters]                 = useState<Chapter[]>([]);
  const [project, setProject]                   = useState<Project | undefined>(undefined);
  const [timelineEvents, setTimelineEvents]     = useState<TimelineEvent[]>([]);
  const [storyBible, setStoryBible]             = useState<StoryBible | null>(null);
  const [factLedger, setFactLedger]             = useState<FactLedger[]>([]);

  const refreshAll = () => {
    const request = ++requestRef.current;
    Promise.all([
      getCharacters(projectId),
      getWorldSettings(projectId),
      getOutlines(projectId),
      getThreads(projectId),
      getChapters(projectId),
      getProject(projectId),
      getTimelineEvents(projectId),
      getStoryBible(projectId),
      getFactLedger(projectId),
    ]).then(([chars, worlds, outs, ts, chaps, proj, events, bible, ledger]) => {
      if (request !== requestRef.current) return;
      setCharacters(chars);
      setWorldSettings(worlds);
      setOutlines(outs);
      setThreads(ts);
      setChapters(chaps);
      setProject(proj);
      setTimelineEvents(events);
      setStoryBible(bible ?? null);
      setFactLedger(ledger);
    }).catch(() => { if (request === requestRef.current) toast.error('写作上下文读取失败，请刷新后重试'); });
  };

  useEffect(() => {
    refreshAll();
    const unsubscribe = onLibraryChanged(refreshAll);
    return () => { requestRef.current += 1; unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return {
    characters, worldSettings, outlines, threads, chapters,
    project, timelineEvents, storyBible, factLedger,
    refreshAll,
  };
}
