import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import { emitLibraryChanged } from '@/shared/lib/libraryEvents';
import type { Outline } from '@/shared/types';
import { getChapters, saveChapter } from '@/features/chapter/api';

export async function getOutlines(projectId: string): Promise<Outline[]> {
  const res = await apiClient.get(`/projects/${projectId}/outlines`);
  return normalizeList<Outline>(unwrap(res));
}

export async function saveOutline(outline: Partial<Outline> & { projectId: string }): Promise<Outline> {
  const res = await apiClient.post(`/projects/${outline.projectId}/outlines`, outline);
  // 卷名与「哪一章属于哪一卷」都来自大纲，左栏章节树按卷分组，所以大纲一改也要通知列表
  emitLibraryChanged();
  return normalize<Outline>(unwrap(res));
}

export async function deleteOutline(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/outlines/${id}`);
  emitLibraryChanged();
}

export async function syncOutlinesToChapters(projectId: string): Promise<number> {
  const [outlines, existingChapters] = await Promise.all([
    getOutlines(projectId),
    getChapters(projectId),
  ]);

  const existingIds = new Set(existingChapters.map(c => c.id));

  function collectChapterNodes(parentId: string | null): Outline[] {
    return outlines
      .filter(o => o.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .flatMap(o => {
        if (o.type === 'chapter') return [o];
        return collectChapterNodes(o.id);
      });
  }

  const allNodes = collectChapterNodes(null);
  for (const outline of allNodes) {
    const linked = existingChapters.find(c => c.id === outline.chapterId);
    if (linked && (linked.title !== outline.title || linked.summary !== (outline.summary || ''))) {
      await saveChapter({ id: linked.id, projectId, title: outline.title, summary: outline.summary || '' });
    }
  }
  const chapterNodes = allNodes.filter(o => !o.chapterId || !existingIds.has(o.chapterId));

  if (chapterNodes.length === 0) return 0;

  const startOrder = existingChapters.length + 1;
  for (let i = 0; i < chapterNodes.length; i++) {
    const outline = chapterNodes[i];
    const chapter = await saveChapter({
      projectId,
      title: outline.title,
      order: startOrder + i,
      content: '',
      wordCount: 0,
      status: 'draft',
      summary: outline.summary || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await saveOutline({ ...outline, chapterId: chapter.id });
  }

  return chapterNodes.length;
}
