/** 分段正文一致性审查：所有正文覆盖，冲突必须逐字引用；历史参考有预算，明确其边界。 */
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { characterProfile } from '@/shared/lib/characterProfile';
import { usableFacts } from '@/shared/lib/chapterSources';
import { stripHtml } from '@/shared/lib/contentFormat';
import type { Chapter, Character, Outline, PlotThread, Project, WorldSetting } from '@/shared/types';
import { streamChat } from './transport';
export interface ConsistencyIssue {
  chapterId: string; quote: string; type: string; problem: string; suggestion: string;
  referenceChapterId?: string; referenceQuote?: string;
}
export interface ConsistencyResult {
  issues: ConsistencyIssue[]; sources: Record<string, string>; coverage: string; checkedAt: string;
}
export interface ConsistencyParams {
  project: Project; characters: Character[]; worldSettings: WorldSetting[];
  chapters: Chapter[]; outlines: Outline[]; threads: PlotThread[];
  onChunk?: (c: string) => void; signal?: AbortSignal;
}
export async function checkConsistency(params: ConsistencyParams): Promise<ConsistencyResult> {
  const ordered = [...params.chapters].sort((a, b) => a.order - b.order);
  const sources: Record<string, string> = {};
  const history: Array<{ chapterId: string; quote: string; fact: string }> = [];
  const issues: ConsistencyIssue[] = [];
  let chars = 0, segments = 0;
  for (const chapter of ordered) {
    const body = stripHtml(chapter.content);
    sources[chapter.id] = await chapterMemoryHash(chapter.content);
    for (let offset = 0; offset < body.length; offset += 6000) {
      if (params.signal?.aborted) throw new Error('检查已停止');
      const part = body.slice(offset, offset + 6000);
      const cast = params.characters.filter(c => [c.name, ...(c.aliases ?? [])].some(n => n && part.includes(n)));
      const tokens = new Set(part.match(/[\u4e00-\u9fff]{2}|[a-zA-Z]{3,}/g) ?? []);
      const relevant = [...history].sort((a, b) => {
        const score = (s: string) => [...tokens].reduce((n, t) => n + Number(s.includes(t)), 0);
        return score(b.fact) - score(a.fact);
      }).slice(0, 30);
      const raw = await streamChat('你是小说事实核查编辑。只输出 JSON。人物变化、谎言、不可靠叙述与有意留白不自动算矛盾。',
        `作品：${params.project.title}\n作者方向：${params.project.qualityGoal || '尊重原叙事'}\n作者故事圣经：${params.project.storyBible ? JSON.stringify(params.project.storyBible) : '暂无'}\n本章序号：${chapter.order}，ID：${chapter.id}\n` +
        `【出场人物档案】\n${cast.map(c => characterProfile(c, params.characters, 120, { throughOrder: chapter.order })).join('\n')}\n` +
        `【世界规则】\n${params.worldSettings.map(w => `${w.title}：${w.content}`).join('\n').slice(0, 5000)}\n` +
        `【已确认事实】\n${JSON.stringify(usableFacts(params.project.factLedger ?? [], chapter.order).slice(-30))}\n` +
        `【相关历史正文证据，按相关度选取】\n${JSON.stringify(relevant)}\n` +
        `【当前实际正文，第${offset + 1}—${offset + part.length}字】\n${part}\n` +
        '只列有明确证据的矛盾。quote 必须逐字引用当前段；涉及之前剧情须 referenceChapterId 和 referenceQuote 逐字引用历史证据。大纲是计划，不能充当已发生事实。输出 {"observations":[{"quote":"原句","fact":"客观事件"}],"issues":[{"quote":"原句","type":"人物/规则/时间/知情","problem":"矛盾说明","suggestion":"修正方向","referenceChapterId":"可选","referenceQuote":"可选"}]}，观察最多12条，问题最多8条。',
        undefined, 3200, { signal: params.signal, jsonMode: true, temperature: 0.2 });
      const value = JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as { observations?: unknown[]; issues?: unknown[] };
      if (!Array.isArray(value.observations) || !Array.isArray(value.issues)) throw new Error('一致性结果格式不完整，请重试');
      for (const item of value.issues) {
        if (!item || typeof item !== 'object') continue;
        const i = item as Partial<ConsistencyIssue>;
        if (typeof i.quote !== 'string' || !i.quote.trim() || !part.includes(i.quote) || typeof i.problem !== 'string' || !i.problem.trim()) continue;
        if (i.referenceChapterId || i.referenceQuote) {
          const prior = ordered.find(c => c.id === i.referenceChapterId && c.order <= chapter.order);
          if (!prior || typeof i.referenceQuote !== 'string' || !i.referenceQuote.trim() || !stripHtml(prior.content).includes(i.referenceQuote)) continue;
        }
        issues.push({ chapterId: chapter.id, quote: i.quote, type: i.type || '事实', problem: i.problem,
          suggestion: typeof i.suggestion === 'string' ? i.suggestion : '', referenceChapterId: i.referenceChapterId, referenceQuote: i.referenceQuote });
      }
      for (const item of value.observations) {
        if (!item || typeof item !== 'object') continue;
        const o = item as { quote?: string; fact?: string };
        if (typeof o.quote === 'string' && o.quote.trim() && part.includes(o.quote) && typeof o.fact === 'string') history.push({ chapterId: chapter.id, quote: o.quote.slice(0, 400), fact: o.fact.slice(0, 300) });
      }
      chars += part.length; segments++;
      params.onChunk?.(`已检查《${chapter.title}》第${offset + 1}—${offset + part.length}字\n`);
    }
  }
  return { issues, sources, checkedAt: new Date().toISOString(),
    coverage: `实际读取 ${ordered.filter(c => stripHtml(c.content).trim()).length}/${ordered.length} 章，${chars} 字，${segments} 段。每段最多参考30条相关历史证据和30条有效事实、5000字世界规则；不保证发现所有跨章矛盾。` };
}
export async function globalConsistencyCheck(params: ConsistencyParams): Promise<string> {
  const result = await checkConsistency(params);
  const report = `${result.coverage}\n\n` + (result.issues.map((i, n) => `${n + 1}. [${i.type}]《${params.chapters.find(c => c.id === i.chapterId)?.title}》「${i.quote}」\n${i.problem}\n建议：${i.suggestion}`).join('\n\n') || '本次未发现有原文证据的矛盾。');
  params.onChunk?.(report); return report;
}
