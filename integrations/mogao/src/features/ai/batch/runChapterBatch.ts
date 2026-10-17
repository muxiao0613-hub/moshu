/**
 * AI 批量生成 · 章节正文批量生成编排（含逐场落库与失败兜底）。
 *
 * 位置：./batch 的取数编排层，被 useBatchGenerate 的 handleGenerate 在知识库五步之后调用；
 * 本文件不持有 React state，进度与流式文本通过回调写回 hook（章节文本是整段替换，故用 setRawText）。
 * 依赖方向：@/api、@/features/ai/aiService、@/features/ai/ragService、@/features/chapter/formatPrefs
 * → ./batchUtils、./types；不引用展示组件。
 */
import {
  expandChapterContent,
  generateChapterFromPlotPoints,
  generateChapterPlotPoints,
  generateFullChapterContent,
} from '@/features/ai/aiService';
import { buildProjectIndex, retrieveRelevantChapters } from '@/features/ai/ragService';
import { characterSyncReportText, synchronizeChapter } from '@/features/chapter/writeback';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { chapterHandoff } from '@/shared/lib/chapterSources';
import { platformOverride } from '@/features/chapter/formatPrefs';
import {
  countWords,
  getCharacters,
  getChapter,
  getChapters,
  getChaptersWithContent,
  getFactLedger,
  getOutlines,
  getStoryBible,
  getWorldSettings,
  saveChapter,
  saveChapterBeatCard,
} from '@/api';
import type { Chapter, CharacterSyncPreferences, Project } from '@/shared/types';

import { pickChaptersToGenerate } from './batchUtils';
import type { ChapterBatchItem, PendingScenes, StepKey, StepState } from './types';

export interface ChapterBatchParams {
  project: Project;
  projectId: string;
  existingChapters: Chapter[];
  instruction: string;
  chapterWordCount: string;
  layeredMode: boolean;
  characterSyncPreferences?: CharacterSyncPreferences;
  /** 每章开始前检查用户是否点了「停止」 */
  isAborted: () => boolean;
  updateStep: (key: StepKey, patch: Partial<StepState>) => void;
  /** 章节步骤的文本是整段替换（带进度前缀），不走增量追加 */
  setRawText: (key: StepKey, text: string) => void;
  /** 失败提示等需要保留既有流式文本时走追加 */
  appendRawText: (key: StepKey, chunk: string) => void;
  setChapterProgress: (p: { current: number; total: number }) => void;
}

export async function runChapterBatch(p: ChapterBatchParams): Promise<void> {
  const { project, projectId, instruction, layeredMode } = p;

  const freshChapters = await getChaptersWithContent(projectId);
  const chaptersToGenerate = pickChaptersToGenerate(freshChapters);
  if (chaptersToGenerate.length === 0) {
    p.updateStep('chapters', {
      status: 'error',
      error: '没有找到需要生成正文的章节（已有内容的章节不会被覆盖）',
    });
    return;
  }

  p.updateStep('chapters', { status: 'running' });
  p.setChapterProgress({ current: 0, total: chaptersToGenerate.length });
  const chapterResults: ChapterBatchItem[] = [];
  let failedCount = 0;
  const profileErrors: string[] = [];

  // 先为已有章节建立 RAG 索引（静默）
  const existingWithContent = freshChapters.filter(c => c.content?.trim());
  if (existingWithContent.length > 0) {
    await buildProjectIndex(projectId, existingWithContent);
  }

  for (let i = 0; i < chaptersToGenerate.length; i++) {
    if (p.isAborted()) break;
    const ch = chaptersToGenerate[i];
    p.setChapterProgress({ current: i + 1, total: chaptersToGenerate.length });

    let content = '';
    // 逐场景生成时回传的场景卡（含每场正文），生成后随章一起落库
    let pendingScenes: PendingScenes | null = null;
    try {
      // 找对应大纲
      const allOutlines = await getOutlines(projectId);
      const outline = allOutlines.find(o => o.chapterId === ch.id);
      const chars = await getCharacters(projectId);
      const worlds = await getWorldSettings(projectId);
      const allChaps = await getChapters(projectId);
      const idx = allChaps.findIndex(c => c.id === ch.id);
      const prevSummary = chapterHandoff(idx > 0 ? await getChapter(allChaps[idx - 1].id, projectId) : undefined);

      const [storyBible, factLedger] = await Promise.all([
        getStoryBible(projectId),
        getFactLedger(projectId),
      ]);

      // RAG 检索相关历史章节
      const ragChunks = await retrieveRelevantChapters({
        projectId,
        queryText: `${ch.title} ${outline?.summary || ''} ${ch.summary || ''}`,
        excludeChapterIds: [ch.id],
        topK: 3,
        beforeOrder: ch.order,
      });

      const targetWC = parseInt(p.chapterWordCount) || 4000;

      if (layeredMode) {
        // ── 分层生成：先剧情骨架，再正文 ──────────────────────────
        p.setRawText('chapters', `第 ${i + 1} 章：正在生成剧情骨架...`);
        const plotPoints = await generateChapterPlotPoints({
          project,
          chapter: ch,
          outlineSummary: outline?.summary || ch.title,
          keyEvents: outline?.keyEvents || [],
          characters: chars,
          worldSettings: worlds, factLedger,
          prevSummary,
          storyBible: storyBible ?? null,
          ragChunks,
        });

        if (plotPoints.length > 0) {
          p.setRawText(
            'chapters',
            `第 ${i + 1} 章：骨架完成（${plotPoints.length}个场景），正在生成正文...`
          );
          content = await generateChapterFromPlotPoints({
            project, chapter: ch,
            plotPoints, characters: chars, worldSettings: worlds,
            prevSummary, targetWordCount: targetWC,
            storyBible: storyBible ?? null,
            factLedger, styleFingerprint: project.styleFingerprint ?? null,
            ragChunks,
            onChunk: c => {
              content += c;
              p.setRawText('chapters', `正在生成第 ${i + 1}/${chaptersToGenerate.length} 章（分层模式）：《${ch.title}》\n\n${content}`);
            },
          });
        }
      } else {
        // ── 直接生成（原流程）────────────────────────────────────────
        content = await generateFullChapterContent({
          project, chapter: ch,
          outlineSummary: outline?.summary || ch.title,
          keyEvents: outline?.keyEvents || [],
          characters: chars, worldSettings: worlds,
          prevSummary, targetWordCount: targetWC,
          instruction,
          storyBible: storyBible ?? null,
          factLedger: factLedger || [],
          styleFingerprint: project.styleFingerprint ?? null,
          ragChunks,
          onChunk: c => {
            content += c;
            p.setRawText('chapters', `正在生成第 ${i + 1}/${chaptersToGenerate.length} 章：《${ch.title}》\n\n${content}`);
          },
          onPhase: label => {
            p.setRawText('chapters', `第 ${i + 1}/${chaptersToGenerate.length} 章《${ch.title}》 · ${label}${content ? '\n\n' + content : ''}`);
          },
          onScenes: (scenes, beat) => { pendingScenes = { scenes, beat }; },
          platform: platformOverride(projectId),
        });
      }

      if (content.trim()) {
        const actualWC = countWords(content);
        // 字数不足 80% 时自动扩写一次
        if (actualWC < targetWC * 0.8) {
          p.setRawText('chapters', `第 ${i + 1} 章字数不足（${actualWC}/${targetWC}字），正在扩写...`);
          try {
            let expanding = '';
            const expandedContent = await expandChapterContent({
              project,
              chapter: ch,
              characters: chars,
              worldSettings: worlds, storyBible, factLedger, styleFingerprint: project.styleFingerprint, ragChunks,
              currentContent: content,
              targetWordCount: targetWC,
              onChunk: c => { expanding += c; p.setRawText('chapters', `第 ${i + 1} 章正在扩写…\n\n${content}${expanding}`); },
            });
            content = content + expandedContent;
          } catch {
            // 扩写失败不影响已有内容
          }
        }

        const savedChapter = await saveChapter({
          id: ch.id,
          projectId,
          content,
          wordCount: countWords(content),
          updatedAt: new Date(),
        });
        // 后面的章必须能检索到本轮刚写完的正文。
        freshChapters[freshChapters.findIndex(c => c.id === savedChapter.id)] = savedChapter;
        // 场景卡与正文一起落库（失败不影响正文保存）
        if (pendingScenes) {
          const snap = pendingScenes as PendingScenes;
          if (snap.beat) {
            try {
              await saveChapterBeatCard({
                ...snap.beat, sourceHash: await chapterMemoryHash(savedChapter.content), status: 'current',
                id: snap.beat.id || `beat-${ch.id}`,
                projectId,
                chapterId: ch.id,
                scenes: snap.scenes,
                updatedAt: new Date(),
              });
            } catch { /* 场景卡保存失败不阻塞生成 */ }
          }
          pendingScenes = null;
        }
        chapterResults.push({ chapter: savedChapter, content });
        if (!p.isAborted()) {
          try {
            p.setRawText('chapters', `《${ch.title}》正文已保存，正在按角色更新档案…`);
            const report = await synchronizeChapter(savedChapter, p.characterSyncPreferences);
            if (report.errors.length) profileErrors.push(ch.title);
            p.appendRawText('chapters', `\n${characterSyncReportText(report)}`);
          } catch (error) {
            profileErrors.push(ch.title);
            p.appendRawText('chapters', `\n正文已保存，人物档案更新失败：${error instanceof Error ? error.message : '请重试'}`);
          }
        }
      }
    } catch (e) {
      failedCount++;
      // 单章失败不中断整体；若已流式拿到部分文本，则保留
      if (content.trim()) {
        await saveChapter({
          id: ch.id,
          projectId,
          content,
          wordCount: countWords(content),
          updatedAt: new Date(),
        });
        chapterResults.push({ chapter: ch, content });
      }
      p.appendRawText('chapters', `\n\n第 ${i + 1} 章《${ch.title}》生成失败：${(e as Error).message}`);
    }
  }

  const sel = new Set<number>(chapterResults.map((_, i) => i));
  p.updateStep('chapters', {
    status: 'done',
    data: chapterResults,
    selected: sel,
    error: [failedCount > 0 ? `有 ${failedCount} 章生成失败，已保留可用内容` : '',
      profileErrors.length ? `${profileErrors.length} 章人物档案未完整更新，可在档案页重试` : ''].filter(Boolean).join('；') || undefined,
  });
}
