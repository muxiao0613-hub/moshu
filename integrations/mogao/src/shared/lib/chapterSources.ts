/** 统一小说来源有效性及章节范围；纯函数，写作、评审和检查均通过此口径消费。 */
import type { Chapter, FactLedger, QualityReport } from '@/shared/types';
import { stripHtml } from './contentFormat';

export function usableFacts(facts: FactLedger[] = [], throughOrder?: number): FactLedger[] {
  return facts.filter(f => f.status === 'confirmed' && !!f.sourceHash && !!f.quote
    && (throughOrder === undefined || (f.sourceChapterOrder !== undefined && f.sourceChapterOrder <= throughOrder)));
}
export function chapterHandoff(chapter: Pick<Chapter, 'continuity' | 'content' | 'summary'> | undefined): string {
  if (!chapter) return '';
  if (chapter.continuity?.status === 'current') return chapter.continuity.text;
  const tail = stripHtml(chapter.content ?? '').slice(-1200);
  return tail ? `上章末尾原文（实际摘要尚未更新）：\n${tail}` : '';
}
export function currentReport(report: QualityReport | undefined): boolean {
  return !!report?.sourceHash && report.status === 'current';
}
