/**
 * 质量中枢 · 取数 hook：把跨六张表的读取与刷新收敛成一个只读数据源（CONVENTIONS §2.4）。
 *
 * 本文件是 ./lab 的内部实现，由 ./useQualityLab 消费；面板只看到最终数据，不直接请求接口。
 * 依赖方向：@/api、@/shared/types（HTTP 层，无 UI）。
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  getChapterBeatCards,
  getCharacters,
  getChaptersWithContent,
  getFactLedger,
  getProject,
  getQualityReports,
  getStoryBible,
  getThreads,
  getTopicCandidates,
  getWorldSettings,
} from '@/api';
import { toast } from '@/shared/ui/toast';
import type { Chapter } from '@/shared/types';

/** 页面一次加载需要的全部数据 + 刷新入口（写操作由 ./useQualityLab 负责） */
export interface QualityLabData {
  project: Awaited<ReturnType<typeof getProject>>;
  chapters: Chapter[];
  characters: Awaited<ReturnType<typeof getCharacters>>;
  worldSettings: Awaited<ReturnType<typeof getWorldSettings>>;
  threads: Awaited<ReturnType<typeof getThreads>>;
  topics: Awaited<ReturnType<typeof getTopicCandidates>>;
  storyBible: Awaited<ReturnType<typeof getStoryBible>>;
  beatCards: Awaited<ReturnType<typeof getChapterBeatCards>>;
  facts: Awaited<ReturnType<typeof getFactLedger>>;
  reports: Awaited<ReturnType<typeof getQualityReports>>;
  /** 改稿覆盖正文后需要就地更新章节列表 */
  setChapters: Dispatch<SetStateAction<Chapter[]>>;
  refreshTopics: () => Promise<void>;
  refreshFacts: () => Promise<void>;
  refreshReports: () => Promise<void>;
  refreshBeatCards: () => Promise<void>;
  refreshStoryBible: () => Promise<void>;
}

export function useQualityLabData(projectId: string): QualityLabData {
  const [project, setProject] = useState<Awaited<ReturnType<typeof getProject>>>(undefined);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Awaited<ReturnType<typeof getCharacters>>>([]);
  const [worldSettings, setWorldSettings] = useState<Awaited<ReturnType<typeof getWorldSettings>>>([]);
  const [threads, setThreads] = useState<Awaited<ReturnType<typeof getThreads>>>([]);
  const [topics, setTopics] = useState<Awaited<ReturnType<typeof getTopicCandidates>>>([]);
  const [storyBible, setStoryBible] = useState<Awaited<ReturnType<typeof getStoryBible>>>(undefined);
  const [beatCards, setBeatCards] = useState<Awaited<ReturnType<typeof getChapterBeatCards>>>([]);
  const [facts, setFacts] = useState<Awaited<ReturnType<typeof getFactLedger>>>([]);
  const [reports, setReports] = useState<Awaited<ReturnType<typeof getQualityReports>>>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getProject(projectId),
      getChaptersWithContent(projectId),
      getCharacters(projectId),
      getWorldSettings(projectId),
      getThreads(projectId),
      getTopicCandidates(projectId),
      getStoryBible(projectId),
      getChapterBeatCards(projectId),
      getFactLedger(projectId),
      getQualityReports(projectId),
    ]).then(([proj, chs, chars, ws, ths, tops, bible, beats, fcts, reps]) => {
      if (cancelled) return;
      setProject(proj);
      setChapters(chs);
      setCharacters(chars);
      setWorldSettings(ws);
      setThreads(ths);
      setTopics(tops);
      setStoryBible(bible);
      setBeatCards(beats);
      setFacts(fcts);
      setReports(reps);
    }).catch(() => { if (!cancelled) toast.error('评审素材读取失败，请重试'); });
    return () => { cancelled = true; };
  }, [projectId]);

  const refreshTopics = () => getTopicCandidates(projectId).then(setTopics);
  const refreshFacts = () => getFactLedger(projectId).then(setFacts);
  const refreshReports = () => getQualityReports(projectId).then(setReports);
  const refreshBeatCards = () => getChapterBeatCards(projectId).then(setBeatCards);
  const refreshStoryBible = () => getStoryBible(projectId).then(setStoryBible);

  return {
    project,
    chapters,
    characters,
    worldSettings,
    threads,
    topics,
    storyBible,
    beatCards,
    facts,
    reports,
    setChapters,
    refreshTopics,
    refreshFacts,
    refreshReports,
    refreshBeatCards,
    refreshStoryBible,
  };
}
