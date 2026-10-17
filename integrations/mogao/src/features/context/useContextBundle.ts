import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getProject } from '@/features/project/api';
import { getCharacters } from '@/features/character/api';
import { getWorldSettings } from '@/features/world/api';
import { getThreads } from '@/features/thread/api';
import { getOutlines } from '@/features/outline/api';
import { getChapter, getChapters } from '@/features/chapter/api';
import { getStoryBible, getFactLedger } from '@/features/quality/api';
import { retrieveRelevantChapters } from '@/features/ai/ragService';
import { ensureProjectIndex } from '@/features/ai/ragIndex';
import { chapterHandoff } from '@/shared/lib/chapterSources';
import { stripHtml } from '@/shared/lib/contentFormat';
import { onLibraryChanged } from '@/shared/lib/libraryEvents';
import type {
  Chapter, Character, FactLedger, Outline, PlotThread, Project, RagChunk,
  StoryBible, WorldSetting,
} from '@/shared/types';

/**
 * 上下文抽屉的数据层。
 *
 * `buildContextPlan` / `buildChapterSystemPrompt` 需要的原始材料横跨八个 feature，
 * 这些查询只应该有一处：放在组件里会让「上下文抽屉」同时承担取数与渲染两件事，
 * 也让跨模块依赖散落在 JSX 之间。这里把它们收敛成一个只读 hook。
 */

/** 生成上下文所需的全部原料。 */
export interface ContextBundle {
  project: Project;
  chapter: Chapter | undefined;
  chapters: Chapter[];
  storyBible: StoryBible | undefined;
  facts: FactLedger[];
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  ragChunks: RagChunk[];
}

/** 上一章摘要：按 order 取前一章（与 AIPanel 续写时同口径）。 */
export function pickPrevChapterSummary(chapters: Chapter[], chapterId?: string): string {
  if (!chapterId) return '';
  const sorted = [...chapters].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(c => c.id === chapterId);
  return idx > 0 ? chapterHandoff(sorted[idx - 1]) : '';
}

export function useContextBundle(projectId: string, chapterId?: string) {
  const [bundle, setBundle] = useState<ContextBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const [project, characters, worldSettings, threads, storyBible, facts, chapter, outlines, chapters] = await Promise.all([
        getProject(projectId),
        getCharacters(projectId),
        getWorldSettings(projectId),
        getThreads(projectId),
        getStoryBible(projectId),
        getFactLedger(projectId),
        chapterId ? getChapter(chapterId, projectId) : Promise.resolve(undefined),
        getOutlines(projectId),
        getChapters(projectId),
      ]);

      if (!project) throw new Error('作品不存在');
      // 与写作面板同口径，先加载历史全文再检索；失败明确显示，避免把不可用伪装成没有依据。
      let ragChunks: RagChunk[] = [];
      if (chapter) {
          await ensureProjectIndex(projectId);
          const queryText = `${chapter.title} ${chapter.summary || ''} ${stripHtml(chapter.content).slice(-500)}`;
          ragChunks = await retrieveRelevantChapters({
            projectId,
            queryText,
            excludeChapterIds: [chapter.id],
            topK: 3,
            beforeOrder: chapter.order,
          });
      }

      const sorted = [...chapters].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(c => c.id === chapterId);
      if (idx > 0) { const previous = await getChapter(sorted[idx - 1].id, projectId); if (previous) chapters[chapters.findIndex(c => c.id === previous.id)] = previous; }
      if (request !== requestRef.current) return;
      setBundle({
        project,
        chapter,
        chapters,
        storyBible,
        facts,
        characters,
        worldSettings,
        outlines,
        threads,
        ragChunks,
      });
    } catch {
      if (request !== requestRef.current) return;
      setFailed(true);
      setBundle(null);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [projectId, chapterId]);

  useEffect(() => {
    void reload();
    const unsubscribe = onLibraryChanged(() => { void reload(); });
    return () => { requestRef.current += 1; unsubscribe(); };
  }, [reload]);

  const prevSummary = useMemo(
    () => pickPrevChapterSummary(bundle?.chapters ?? [], bundle?.chapter?.id),
    [bundle],
  );

  return { bundle, loading, failed, reload, prevSummary };
}
