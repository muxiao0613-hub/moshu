/** TXT 导入与 .mgao 恢复共用原子接口；所有章节绑定大纲，失败不留下半本作品。 */
import { v4 as uuidv4 } from 'uuid';
import { restoreProjectBackup } from '@/features/project/backup';
import type { DetectedChapter } from '@/shared/lib/chapterSplitter';
import { chapterTextToHtml } from './parsers';
import type { ExtractedMeta } from './types';
export interface ImportPayload { title: string; genre: string; chapters: DetectedChapter[]; meta: ExtractedMeta | null }
export async function persistImportedNovel({ title, genre, chapters, meta }: ImportPayload): Promise<string> {
  const chapterRows = chapters.map(ch => ({ id: uuidv4(), title: ch.title, order: ch.order,
    content: chapterTextToHtml(ch.content), wordCount: ch.wordCount, status: 'draft', summary: '' }));
  const result = await restoreProjectBackup({ version: 4,
    project: { title, genre, synopsis: meta?.outlineSummary || '' }, chapters: chapterRows,
    outlines: chapterRows.map(c => ({ id: uuidv4(), title: c.title, order: c.order, type: 'chapter', chapterId: c.id,
      parentId: null, summary: '', keyEvents: [], characters: [] })),
    characters: (meta?.characters ?? []).map(c => ({ id: uuidv4(), name: c.name || '未知', role: c.role || 'supporting',
      personality: c.personality || '', background: c.background || '', aliases: [], relationships: [] })),
    worldSettings: (meta?.worldSettings ?? []).map(w => ({ id: uuidv4(), title: w.title || '设定', category: w.category || '其他', content: w.content || '', tags: [] })),
  });
  return result.id;
}
