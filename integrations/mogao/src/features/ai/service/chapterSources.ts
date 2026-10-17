/** 已保存正文的实际摘要与全书事实候选；分段覆盖全文，逐字依据校验后才交给写回层。 */
import { v4 as uuidv4 } from 'uuid';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { stripHtml } from '@/shared/lib/contentFormat';
import type { Chapter, FactLedger, Project } from '@/shared/types';
import { parseJsonFromAI } from './json';
import { streamChat } from './transport';

export async function extractChapterSources(project: Project, chapter: Chapter, signal?: AbortSignal): Promise<{ text: string; facts: FactLedger[] }> {
  const body = stripHtml(chapter.content), hash = await chapterMemoryHash(chapter.content), summaries: string[] = [];
  const facts = new Map<string, FactLedger>();
  for (let offset = 0; offset < body.length; offset += 6000) {
    signal?.throwIfAborted();
    const source = body.slice(offset, offset + 6000);
    const raw = parseJsonFromAI<{ summary: string; facts: Array<Partial<FactLedger>> }>(await streamChat(
      '你整理小说已发生的正文，不能写作者规划或猜测。只输出JSON。summary概括本段真实事件、人物选择、场景落点及尚未完成的动作，最多250字。facts只提取影响后文的客观事实，每段最多8条，每条提供本段逐字quote，fact最多300字、quote最多400字。没有事实返回空数组。',
      `作品：${project.title}\n第${chapter.order}章《${chapter.title}》片段${Math.floor(offset / 6000) + 1}\n原文：\n${source}\n输出：{"summary":"实际事件与落点","facts":[{"subject":"主体","type":"character|world|plot|relationship|item|ability","fact":"客观事实","quote":"逐字原文","importance":"critical|major|minor"}]}`,
      undefined, 4000, { signal, jsonMode: true, temperature: 0.2 }));
    if (typeof raw.summary !== 'string' || !raw.summary.trim() || !Array.isArray(raw.facts)) throw new Error('实际摘要格式无效，请重试同步');
    summaries.push(raw.summary.trim().slice(0, 250));
    for (const item of raw.facts) {
      if (typeof item.fact !== 'string' || !item.fact.trim() || item.fact.length > 300 || typeof item.subject !== 'string'
        || !item.subject.trim() || typeof item.quote !== 'string' || !item.quote.trim() || item.quote.length > 400 || !source.includes(item.quote.trim())) throw new Error('全书事实缺少有效的正文引用');
      const key = `${item.subject}:${item.fact.replace(/\s/g, '')}`;
      facts.set(key, { id: uuidv4(), projectId: project.id, sourceChapterId: chapter.id, sourceChapterOrder: chapter.order,
        sourceHash: hash, quote: item.quote.trim(), subject: item.subject.trim(), fact: item.fact.trim(),
        type: ['character', 'world', 'plot', 'relationship', 'item', 'ability'].includes(item.type ?? '') ? item.type! : 'plot',
        importance: ['critical', 'major', 'minor'].includes(item.importance ?? '') ? item.importance! : 'major',
        status: 'pending', locked: false, createdAt: new Date() });
    }
  }
  if (!summaries.length) throw new Error('正文为空，无法整理实际摘要');
  return { text: summaries.map((text, i) => `片段${i + 1}：${text}`).join('\n') + `\n章末原文：${body.slice(-500)}`, facts: [...facts.values()] };
}
