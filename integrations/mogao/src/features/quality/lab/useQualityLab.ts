/**
 * 质量中枢 · 编排 hook：AI 生成、保存与改稿动作全在这里，数据读取由 ./useQualityLabData 提供。
 *
 * 本文件是 ./lab 的内部实现，对外只由 ../QualityLab 页面级组件使用。
 * 依赖方向：@/api、@/features/quality/qualityService、@/shared/lib/*、./types、./useQualityLabData、./utils。
 */
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  confirmFact,
  adoptTopicCandidate,
  deleteFact,
  deleteTopicCandidate,
  getChapterBeatCard,
  getQualityReport,
  saveChapterBeatCard,
  saveFacts,
  saveQualityReport,
  saveStoryBible,
  saveTopicCandidates,
} from '@/api';
import { getChapter } from '@/features/chapter/api';
import {
  extractFactsFromChapter,
  generateChapterBeatCard,
  generateStoryBible,
  generateTopicCandidates,
  reviewChapterQuality,
  rewriteChapterByQualityReport,
} from '@/features/quality/qualityService';
import type { AntiAiReport } from '@/shared/lib/antiAiDetector';
import { getAIErrorMessage } from '@/shared/lib/utils';
import type { FactLedger } from '@/shared/types';
import type { Chapter, ChapterBeatCard, QualityReport, StoryBible } from '@/shared/types';
import { adoptQualityRewrite, type RewriteSource } from '../adoptRewrite';
import type { BibleForm, LoadingKey } from './types';
import { useQualityLabData, type QualityLabData } from './useQualityLabData';
import { arrayToLines, linesToArray } from './utils';

/** 页面全部状态与动作的形状：面板组件只从这里取自己需要的那几项 */
export interface QualityLabController {
  project: QualityLabData['project'];
  chapters: Chapter[];
  topics: QualityLabData['topics'];
  beatCards: QualityLabData['beatCards'];
  facts: QualityLabData['facts'];
  reports: QualityLabData['reports'];
  storyBible: QualityLabData['storyBible'];
  selectedChapter: Chapter | undefined;
  currentBeatCard: ChapterBeatCard | undefined;
  currentReport: QualityReport | undefined;
  tab: string;
  setTab: (value: string) => void;
  loading: LoadingKey;
  error: string;
  streamText: string;
  platform: string;
  setPlatform: (value: string) => void;
  topicBrief: string;
  setTopicBrief: (value: string) => void;
  researchNotes: string;
  setResearchNotes: (value: string) => void;
  topicCount: number;
  setTopicCount: (value: number) => void;
  selectedTopicId: string;
  setSelectedTopicId: (value: string) => void;
  selectedChapterId: string;
  setSelectedChapterId: (value: string) => void;
  beatInstruction: string;
  setBeatInstruction: (value: string) => void;
  rewriteText: string;
  setRewriteText: (value: string) => void;
  bibleForm: BibleForm;
  setBibleForm: Dispatch<SetStateAction<BibleForm>>;
  antiAiChapterId: string;
  setAntiAiChapterId: (value: string) => void;
  antiAiReport: AntiAiReport | null;
  setAntiAiReport: (report: AntiAiReport | null) => void;
  handleGenerateTopics: () => Promise<void>;
  handleAdoptTopic: (id: string) => Promise<void>;
  handleGenerateBible: () => Promise<void>;
  handleSaveBible: () => Promise<void>;
  handleGenerateBeat: () => Promise<void>;
  handleReview: () => Promise<void>;
  handleRewrite: () => Promise<void>;
  handleApplyRewrite: () => Promise<void>;
  handleExtractFacts: () => Promise<void>;
  handleDeleteTopic: (id: string) => Promise<void>;
  handleConfirmFact: (fact: FactLedger) => Promise<void>;
  handleDeleteFact: (id: string) => Promise<void>;
}

export function useQualityLab(projectId: string): QualityLabController {
  const {
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
  } = useQualityLabData(projectId);

  const [tab, setTab] = useState('review');
  const [antiAiReport, setAntiAiReport] = useState<AntiAiReport | null>(null);
  const [antiAiChapterId, setAntiAiChapterId] = useState('');
  const [loading, setLoading] = useState<LoadingKey>(null);
  const [error, setError] = useState('');
  const [streamText, setStreamText] = useState('');
  const [platform, setPlatform] = useState('番茄');
  const [topicBrief, setTopicBrief] = useState(
    '想要高质量、能长期连载、有强钩子和爽点的题材，优先避免套路化和AI味。'
  );
  const [researchNotes, setResearchNotes] = useState('');
  const [topicCount, setTopicCount] = useState(12);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [beatInstruction, setBeatInstruction] = useState('');
  const [rewriteText, setRewriteText] = useState('');
  const rewriteSource = useRef<RewriteSource | null>(null);
  const activeChapter = useRef(selectedChapterId); activeChapter.current = selectedChapterId;
  const [bibleForm, setBibleForm] = useState<BibleForm>({
    coreHook: '',
    targetReader: '',
    protagonistDesire: '',
    mainConflict: '',
    powerRules: '',
    hardRules: '',
    tone: '',
    taboo: '',
  });

  const [currentBeatCard, setCurrentBeatCard] = useState<ChapterBeatCard | undefined>(undefined);
  const [currentReport, setCurrentReport] = useState<QualityReport | undefined>(undefined);

  useEffect(() => {
    if (project) { setPlatform(project.targetPlatform || '自由创作'); setTopicBrief(project.qualityGoal || '按作品原有方向探索题材，保留作者叙事偏好'); }
  }, [project?.id]);

  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) setSelectedChapterId(chapters[0].id);
  }, [chapters, selectedChapterId]);
  useEffect(() => {
    if (!antiAiChapterId && chapters.length > 0) setAntiAiChapterId(chapters[0].id);
  }, [chapters, antiAiChapterId]);
  useEffect(() => {
    if (topics.length > 0 && !selectedTopicId) setSelectedTopicId(topics.find(t => t.selected)?.id || topics[0].id);
  }, [topics, selectedTopicId]);
  useEffect(() => {
    if (!storyBible) return;
    setBibleForm({
      coreHook: storyBible.coreHook,
      targetReader: storyBible.targetReader,
      protagonistDesire: storyBible.protagonistDesire,
      mainConflict: storyBible.mainConflict,
      powerRules: arrayToLines(storyBible.powerRules),
      hardRules: arrayToLines(storyBible.hardRules),
      tone: storyBible.tone,
      taboo: arrayToLines(storyBible.taboo),
    });
  }, [storyBible]);

  useEffect(() => {
    let alive = true;
    setCurrentBeatCard(undefined); setCurrentReport(undefined); setRewriteText(''); rewriteSource.current = null;
    if (selectedChapterId) Promise.all([getChapterBeatCard(selectedChapterId, projectId), getQualityReport(selectedChapterId, projectId)])
      .then(([beat, report]) => { if (alive) { setCurrentBeatCard(beat); setCurrentReport(report); } })
      .catch(() => { if (alive) setError('读取章节依据失败，请重试'); });
    return () => { alive = false; };
  }, [selectedChapterId, projectId]);

  const selectedChapter = useMemo(
    () => chapters.find(ch => ch.id === selectedChapterId),
    [chapters, selectedChapterId]
  );
  const selectedTopic = useMemo(() => topics.find(t => t.id === selectedTopicId), [topics, selectedTopicId]);

  const runAction = async (key: LoadingKey, action: () => Promise<void>) => {
    setLoading(key);
    setError('');
    setStreamText('');
    try {
      await action();
    } catch (e) {
      setError(getAIErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateTopics = () =>
    runAction('topics', async () => {
      if (!project) return;
      const items = await generateTopicCandidates({
        project,
        brief: topicBrief,
        researchNotes,
        platform,
        count: topicCount,
        onChunk: c => setStreamText(t => t + c),
      });
      await saveTopicCandidates(items);
      await refreshTopics();
      if (items[0]) setSelectedTopicId(items[0].id);
    });

  const handleAdoptTopic = (id: string) => runAction('topics', async () => {
    await adoptTopicCandidate(projectId, id); await refreshTopics(); setSelectedTopicId(id);
    setStreamText('题材已采用到作品简介，起步规划已写入章节大纲。可到故事圣经生成并确认规则，再从大纲同步空章节。');
  });

  const handleGenerateBible = () =>
    runAction('bible', async () => {
      if (!project) return;
      const bible = await generateStoryBible({
        project,
        chosenTopic: selectedTopic || null,
        instruction: `目标平台：${platform}。${topicBrief}`,
        onChunk: c => setStreamText(t => t + c),
      });
      await saveStoryBible(bible);
      await refreshStoryBible();
    });

  const handleSaveBible = () =>
    runAction('bible', async () => {
      const bible: StoryBible = {
        id: storyBible?.id || uuidv4(),
        projectId,
        coreHook: bibleForm.coreHook,
        targetReader: bibleForm.targetReader,
        protagonistDesire: bibleForm.protagonistDesire,
        mainConflict: bibleForm.mainConflict,
        powerRules: linesToArray(bibleForm.powerRules),
        hardRules: linesToArray(bibleForm.hardRules),
        tone: bibleForm.tone,
        taboo: linesToArray(bibleForm.taboo),
        updatedAt: new Date(),
      };
      await saveStoryBible(bible);
      await refreshStoryBible();
    });

  const handleGenerateBeat = () =>
    runAction('beat', async () => {
      if (!project || !selectedChapter) return;
      const card = await generateChapterBeatCard({
        project,
        chapter: await getChapter(selectedChapter.id, projectId) || selectedChapter,
        storyBible: storyBible || null,
        factLedger: facts,
        characters,
        worldSettings,
        threads,
        instruction: beatInstruction,
        onChunk: c => setStreamText(t => t + c),
      });
      await saveChapterBeatCard({ ...card, id: currentBeatCard?.id || card.id, projectId });
      await refreshBeatCards();
      if (activeChapter.current === selectedChapterId) await getChapterBeatCard(selectedChapterId, projectId).then(card => { if (activeChapter.current === selectedChapterId) setCurrentBeatCard(card); });
    });

  const handleReview = () =>
    runAction('review', async () => {
      if (!project || !selectedChapter) return;
      const report = await reviewChapterQuality({
        project,
        chapter: await getChapter(selectedChapter.id, projectId) || selectedChapter,
        storyBible: storyBible || null,
        beatCard: currentBeatCard || null,
        factLedger: facts,
        characters,
        worldSettings,
        threads,
        onChunk: c => setStreamText(t => t + c),
      });
      await saveQualityReport({ ...report, projectId });
      await refreshReports();
      if (activeChapter.current === selectedChapterId) await getQualityReport(selectedChapterId, projectId).then(report => { if (activeChapter.current === selectedChapterId) setCurrentReport(report); });
    });

  const handleRewrite = () =>
    runAction('rewrite', async () => {
      if (!project || !selectedChapter || !currentReport) return;
      if (currentReport.chapterId !== selectedChapter.id || currentReport.projectId !== projectId) throw new Error('评审不属于当前章节，请刷新');
      if (!currentReport.sourceHash || currentReport.status !== 'current') throw new Error('请先重新评审当前正文');
      const text = await rewriteChapterByQualityReport({
        project,
        chapter: await getChapter(selectedChapter.id, projectId) || selectedChapter,
        report: currentReport,
        characters, worldSettings, threads,
        storyBible: storyBible || null,
        beatCard: currentBeatCard || null,
        factLedger: facts,
        onChunk: c => setStreamText(t => t + c),
      });
      if (activeChapter.current !== selectedChapter.id) return;
      rewriteSource.current = { chapterId: selectedChapter.id, projectId, sourceHash: currentReport.sourceHash };
      setRewriteText(text);
    });

  const handleApplyRewrite = () =>
    runAction('rewrite', async () => {
      if (!selectedChapter || !rewriteText.trim()) return;
      const source = rewriteSource.current;
      if (!source || source.chapterId !== selectedChapter.id) throw new Error('改稿不属于当前章节，请重新生成');
      const { chapter: saved, report } = await adoptQualityRewrite(source, rewriteText);
      await Promise.all([refreshReports(), refreshFacts()]);
      setChapters(prev => prev.map(ch => ch.id === saved.id ? saved : ch));
      if (activeChapter.current === saved.id) { setCurrentReport(report); setRewriteText(''); rewriteSource.current = null; }

    });

  const handleExtractFacts = () =>
    runAction('facts', async () => {
      if (!project || !selectedChapter) return;
      const newFacts = await extractFactsFromChapter({
        project,
        chapter: await getChapter(selectedChapter.id, projectId) || selectedChapter,
        existingFacts: facts,
        onChunk: c => setStreamText(t => t + c),
      });
      await saveFacts(newFacts);
      await refreshFacts();
    });

  const handleDeleteTopic = (id: string) => deleteTopicCandidate(id, projectId).then(refreshTopics);
  const handleConfirmFact = (fact: FactLedger) => runAction('facts', async () => { await confirmFact(fact); await refreshFacts(); });
  const handleDeleteFact = (id: string) => runAction('facts', async () => { await deleteFact(id, projectId); await refreshFacts(); });

  return {
    project,
    chapters,
    topics,
    beatCards,
    facts,
    reports,
    storyBible,
    selectedChapter,
    currentBeatCard,
    currentReport,
    tab,
    setTab,
    loading,
    error,
    streamText,
    platform,
    setPlatform,
    topicBrief,
    setTopicBrief,
    researchNotes,
    setResearchNotes,
    topicCount,
    setTopicCount,
    selectedTopicId,
    setSelectedTopicId,
    selectedChapterId,
    setSelectedChapterId,
    beatInstruction,
    setBeatInstruction,
    rewriteText,
    setRewriteText,
    bibleForm,
    setBibleForm,
    antiAiChapterId,
    setAntiAiChapterId,
    antiAiReport,
    setAntiAiReport,
    handleGenerateTopics,
    handleAdoptTopic, handleGenerateBible,
    handleSaveBible,
    handleGenerateBeat,
    handleReview,
    handleRewrite,
    handleApplyRewrite,
    handleExtractFacts,
    handleDeleteTopic,
    handleConfirmFact,
    handleDeleteFact,
  };
}
