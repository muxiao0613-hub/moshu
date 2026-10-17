/**
 * 作品库的只读数据层：长篇列表、短篇列表、各长篇字数。
 *
 * 在拆分中的位置：取数 hook，对外门面是 `features/project/ProjectList.tsx`，
 * 门面把返回的 setter 交给 `useProjectActions` / `useStoryActions` 完成写回。
 * 依赖方向：`@/api` →（本文件）→ 门面与写回 hooks；本文件不依赖任何 list/ 组件。
 */
import { useEffect, useState } from 'react';
import { getChapters, getProjects, getShortStories } from '@/api';
import type { Project, ShortStory } from '@/shared/types';
import type { ProjectSetter, ShortStorySetter } from './types';

/** 作品库需要的全部原始材料 + 供写回 hooks 复用的 setter。 */
export interface ProjectLibrary {
  projects: Project[];
  setProjects: ProjectSetter;
  shortStories: ShortStory[];
  setShortStories: ShortStorySetter;
  /** projectId → 已写章节总字数（长篇封面上的「字数」）。 */
  wordCounts: Record<string, number>;
  loadingProjects: boolean;
  loadingStories: boolean;
}

export function useProjectLibrary(): ProjectLibrary {
  const [projects, setProjects] = useState<Project[]>([]);
  const [shortStories, setShortStories] = useState<ShortStory[]>([]);
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingStories, setLoadingStories] = useState(true);

  useEffect(() => {
    getProjects().then(p => { setProjects(p); setLoadingProjects(false); });
  }, []);

  useEffect(() => {
    getShortStories().then(s => { setShortStories(s); setLoadingStories(false); });
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    Promise.all(
      projects.map(p => getChapters(p.id).then(chapters => ({ id: p.id, total: chapters.reduce((sum, c) => sum + c.wordCount, 0) })))
    ).then(results => {
      const counts: Record<string, number> = {};
      results.forEach(r => { counts[r.id] = r.total; });
      setWordCounts(counts);
    });
  }, [projects]);

  return { projects, setProjects, shortStories, setShortStories, wordCounts, loadingProjects, loadingStories };
}
