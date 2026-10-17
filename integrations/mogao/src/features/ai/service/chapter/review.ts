/**
 * AI 服务 · 章级评审与打磨：质量打分、按意见局部修复、节拍卡生成、去 AI 味润色
 *
 * 在拆分中的位置：service/chapter/ 的一层模块（对外门面 ./index.ts，更上层是 @/features/ai/aiService）。
 * 依赖方向：./transport + ./prompts；被 ./generate 与 ./scenes 复用，不再反向依赖它们。
 */
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { trunc } from '@/shared/lib/text';
import { qualityPolicy, type QualityDirection } from '@/shared/lib/qualityPolicy';
import type { Chapter, ChapterBeatCard, Project } from '@/shared/types';
import { streamChat, type StreamOpts } from '../transport';
import type { ChapterQcIssue, ChapterQcResult } from './qcTypes';

const SEGMENT_LIMIT = 8000;
function segments(text: string): string[] {
  const result: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(text.length, start + SEGMENT_LIMIT);
    const boundary = text.lastIndexOf('\n', end);
    if (end < text.length && boundary > start + SEGMENT_LIMIT / 2) end = boundary + 1;
    result.push(text.slice(start, end)); start = end;
  }
  return result;
}
function preservedSegment(source: string, result: string): string {
  if (result.trim().length < source.trim().length * 0.6) throw new Error('分段改稿疑似截断，保留原稿');
  return result;
}

export async function scoreChapter(text: string, ctx: QualityDirection & { targetWordCount: number; signal?: AbortSignal }): Promise<ChapterQcResult | null> {
  ctx.signal?.throwIfAborted();
  const plain = text.replace(/<[^>]*>/g, '');
  if (plain.length > SEGMENT_LIMIT) {
    const parts = segments(plain), results: ChapterQcResult[] = [];
    for (const part of parts) {
      const result = await scoreChapter(part, { ...ctx, targetWordCount: Math.round(ctx.targetWordCount * part.length / plain.length) });
      if (!result) return null;
      results.push(result);
    }
    return { pass: results.every(r => r.pass === true), score: Math.round(results.reduce((sum, r, i) => sum + (r.score ?? 0) * parts[i].length, 0) / plain.length),
      issues: results.flatMap(r => r.issues || []) };
  }
  const user = `按成稿标准逐项检查下面的小说正文，只输出 JSON：
{"pass":true|false,"score":0-100,"issues":[{"rule":"违反的标准","segment":"问题段落原文前20字…","reason":"为何不达标","fix":"怎么改"}]}

${qualityPolicy(ctx)}
目标约 ${ctx.targetWordCount} 字，实际 ${plain.length} 字；字数偏离作为交付提示。
只在发现有证据的硬问题时 pass=false；审美建议不能自动判不通过。
不要输出正文、不要解说。

正文：
${plain}`;
  const raw = await streamChat('你是尊重作者创作方向的小说责编。只输出 JSON。', user, undefined, 2000, { signal: ctx.signal, jsonMode: true, temperature: 0.25 });
  try { return JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()); }
  catch { return null; }
}

// 第5步：按质检 issues 针对性修复（删除/具体化，不整章重写）
export async function fixChapterByIssues(text: string, issues: ChapterQcIssue[], opts: StreamOpts = {}): Promise<string> {
  opts.signal?.throwIfAborted();
  const plain = text.replace(/<[^>]*>/g, '');
  if (plain.length > SEGMENT_LIMIT) {
    const result: string[] = [];
    for (const part of segments(plain)) {
      opts.signal?.throwIfAborted();
      const local = issues.filter(i => !i.segment || part.includes(i.segment.replace(/[…\.]+$/, '').trim()));
      result.push(local.length ? preservedSegment(part, await fixChapterByIssues(part, local, opts)) : part);
    }
    return result.join('\n');
  }
  const issueList = issues.slice(0, 8).map((it, i) => `${i + 1}. 问题：${it.reason || it.rule || ''}；位置约「${it.segment || ''}」；改法：${it.fix || ''}`).join('\n');
  const user = `下面的正文有若干不达标处。在【不改动主线情节、人物、对白内容、人物关系】的前提下，**只针对这些问题做局部删改**（删除/具体化/调整钩子），其余部分保持原样，然后输出修改后的完整正文（不要解说）：

【待修复问题】
${issueList}

正文：
${plain}`;
  return preservedSegment(plain, await streamChat('你是中文小说编辑，按编辑意见做最小必要的局部修改，不发散重写。', user, undefined, 12000, { ...opts, temperature: 0.7 }));
}

// 长篇平台专项写法
export async function generateChapterBeatCard(p: {
  project: Project; chapter: Chapter; outlineSummary: string; keyEvents: string[];
  charsCtx: string; prevSummary: string; bibleCtx: string; factsCtx: string; targetWordCount: number;
  /** 结构模板约束块（来自写作台所选结构模板，为空表示自由发挥） */
  templateHint?: string;
}): Promise<ChapterBeatCard | null> {
  const user = `小说：《${p.project.title}》（${p.project.genre}）
上一章末尾情境：${p.prevSummary || '（开篇）'}
本章大纲：${trunc(p.outlineSummary, 240)}
关键事件：${p.keyEvents.slice(0, 6).join('；')}
涉及人物：\n${p.charsCtx || '暂无'}${p.bibleCtx}${p.factsCtx}
本章目标字数：${p.targetWordCount}${p.templateHint ?? ''}

输出 JSON（只输出 JSON，不要解说、不要代码块）：
{"goal":"","conflict":"","coolPoint":"","emotionPoint":"","reversal":"","characterChange":"","foreshadowing":[],"payoff":[],"beats":[{"scene":"","tension":"低|中|高","pace":"慢|中|快","purpose":""}],"hookEnding":"","mustInclude":[],"mustAvoid":[]}
${qualityPolicy({ platform: p.project.targetPlatform, genre: p.project.genre, qualityGoal: p.project.qualityGoal })}\n约束：beats 服务本章意图；hookEnding 可写悬念、余韵或完整收束，不强制掐断。`;
  const raw = await streamChat(
    '你是小说结构师。基于给定信息为本章设计"节拍卡"。只输出 JSON，不要任何解说、不要 Markdown 代码块。',
    user, undefined, 1500, { jsonMode: true, temperature: 0.4 },
  );
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return { ...JSON.parse(clean), sourceHash: await chapterMemoryHash(p.chapter.content), status: 'current' };
  } catch { return null; }
}

// 第3步：去 AI 味精修（删除 + 具体化，不重写润色）
export async function deAiPolishChapter(chapterText: string, opts: StreamOpts & QualityDirection = {}): Promise<string> {
  opts.signal?.throwIfAborted();
  const plain = chapterText.replace(/<[^>]*>/g, '');
  if (plain.length > SEGMENT_LIMIT) {
    const result: string[] = [];
    for (const part of segments(plain)) result.push(await deAiPolishChapter(part, opts));
    return result.join('\n');
  }
  const user = `下面是一段小说正文。在【不改动情节、人物、对白内容、人物关系】的前提下，逐句清理以下问题，然后输出清理后的完整正文（不要解说、不要标注改了什么）：
${qualityPolicy(opts)}
1. 删减无依据的套话总结，保留有意的格言、抒情与人物心理。
2. 删减已经被动作说明的重复情绪解释；有新信息或文风价值的心理描写保留。
3. 仅在概述让关键场景缺失时补具体细节，保留有意的概述与时间跳转。
4. 删减重复、无信息的修饰，保留作者选择的副词与句式。
5. 机械重复的排比可调整，有意的对仗、韵律与整齐句式保留。
6. 删除与情节无关的悬浮空镜过渡。
7. 保留作者的结尾形式，只有违背本章意图时才调整。
重要：修改必须服务创作意图；无需为规则而改写。

正文：
${plain}`;
  return preservedSegment(plain, await streamChat(
    '你是中文文学编辑，专门清除 AI 写作痕迹。只做删除和具体化，不做发散式重写润色。',
    user, undefined, 12000, { ...opts, temperature: 0.65 },
  ));
}

// ---------- 章节续写规划（生成下一章简述） ----------
