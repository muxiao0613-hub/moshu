/**
 * 短篇生成 · 质检：AI 深度质量评审（五维打分 + 总评 + 建议 + 平台格式问题）
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/short-story/shortStoryService 导出。
 * 依赖方向：./transport + ./text + ./prompts（只依赖底层，不反向）。
 */
import type { ShortStory, ShortStoryQualityReport } from '@/shared/types';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { qualityPolicy } from '@/shared/lib/qualityPolicy';
import { buildPlatformHint } from './prompts';
import { parseJsonFromAI } from './text';
import { streamChat } from './transport';

async function reviewSegment(params: {
  story: ShortStory;
  onChunk?: (c: string) => void;
}): Promise<ShortStoryQualityReport> {
  const { story } = params;
  const text = story.content.replace(/<[^>]*>/g, '').slice(0, 10000);

  const raw = await streamChat(
    '你是资深短篇小说责任编辑，尊重作者创作方向，评分为编辑意见。只输出纯 JSON 对象，不含 markdown。',
    `评审以下短篇故事的质量。请根据实际内容打分，不要给虚高分。

${buildPlatformHint(story)}
${qualityPolicy({ platform: story.platform, genre: story.genre, qualityGoal: story.styleConstraint })}
故事核心：${story.premise || '暂无'}

━━━ 正文 ━━━
${text}

━━━ 评审维度（0-100分，严格评定）━━━
- hookScore：开篇是否适合这部作品的创作方向？慢热作品不强制前三句冲突。
- structureScore：结构是否实现作者意图？情节型作品的选择与后果是否清楚？抒情或实验作品不强制传统高潮。
- emotionArcScore：情绪是否通过场景和动作呈现？人物是否有真实变化？
- endingScore：结尾是否回收前文细节？是否有余韵/反转/共鸣？
- infoDensityScore：段落是否服务情节、人物或语言意图？不要把有意的抒情或留白判为缺陷。

━━━ 输出格式 ━━━
{
  "hookScore": 数字,
  "structureScore": 数字,
  "emotionArcScore": 数字,
  "endingScore": 数字,
  "infoDensityScore": 数字,
  "totalScore": 数字,
  "verdict": "一句话总评，必须指出最核心的问题或优点",
  "suggestions": [
    "具体可操作建议，最好指出开头/中段/结尾某处如何改",
    "建议2",
    "建议3"
  ],
  "formatIssues": ["平台格式不符合的具体问题，若无则空数组"]
}`,
    params.onChunk,
    2400
  );

  try {
    const r = parseJsonFromAI<Partial<ShortStoryQualityReport>>(raw);
    const clamp = (v: unknown, fallback = 70) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
    };
    const scoreFields = [r.hookScore, r.structureScore, r.emotionArcScore, r.endingScore, r.infoDensityScore].map(v => clamp(v));
    const avg = Math.round(scoreFields.reduce((a, b) => a + b, 0) / scoreFields.length);
    return {
      sourceHash: await chapterMemoryHash(story.content), status: 'current',
      hookScore: scoreFields[0],
      structureScore: scoreFields[1],
      emotionArcScore: scoreFields[2],
      endingScore: scoreFields[3],
      infoDensityScore: scoreFields[4],
      totalScore: clamp(r.totalScore, avg),
      verdict: String(r.verdict || '').trim(),
      suggestions: Array.isArray(r.suggestions) ? r.suggestions.map(String) : [],
      formatIssues: Array.isArray(r.formatIssues) ? r.formatIssues.map(String) : [],
    };
  } catch {
    throw new Error('质量评审 AI 返回格式异常，请重试');
  }
}

/** 全文分段核查，显式说明分段结构评分的边界，不截掉长故事结尾。 */
export async function reviewShortStoryQuality(params: Parameters<typeof reviewSegment>[0]): Promise<ShortStoryQualityReport> {
  const body = params.story.content.replace(/<[^>]*>/g, '');
  if (!body.trim()) throw new Error('请先写正文再质检');
  const reports: Array<{ report: ShortStoryQualityReport; length: number }> = [];
  for (let offset = 0; offset < body.length; offset += 8000) {
    const part = body.slice(offset, offset + 8000);
    const report = await reviewSegment({ ...params, story: { ...params.story, content: part } });
    reports.push({ report, length: part.length });
  }
  const report: ShortStoryQualityReport = { ...reports[0].report, sourceHash: await chapterMemoryHash(params.story.content), status: 'current',
    coverage: `已读取全部${body.length}字，${reports.length}段；整篇结构与情绪衔接请结合分段意见复核`,
    verdict: reports.map((r, i) => `第${i + 1}段：${r.report.verdict}`).join('；'),
    suggestions: reports.flatMap((r, i) => r.report.suggestions.map(s => `第${i + 1}段：${s}`)), formatIssues: [...new Set(reports.flatMap(r => r.report.formatIssues))] };
  for (const key of ['hookScore', 'structureScore', 'emotionArcScore', 'endingScore', 'infoDensityScore', 'totalScore'] as const)
    report[key] = Math.round(reports.reduce((n, r) => n + r.report[key] * r.length, 0) / body.length);
  return report;
}
