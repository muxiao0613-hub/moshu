/**
 * AI 服务 · 下一章简述：生成下一章的标题与要点
 *
 * 在拆分中的位置：service/chapter/ 的一层模块（对外门面 ./index.ts，更上层是 @/features/ai/aiService）。
 * 依赖方向：./transport + ./json；由 ./index.ts 重导出。
 */
import { getChapter } from '@/features/chapter/api';
import { chapterHandoff } from '@/shared/lib/chapterSources';
import { trunc } from '@/shared/lib/text';
import type { ChapterContinuity, Character, Outline, PlotThread, Project, WorldSetting } from '@/shared/types';
import { parseJsonFromAI } from '../json';
import { streamChat } from '../transport';

export async function generateNextChapterBrief(params: {
  project: Project;
  existingChapters: Array<{ id?: string; title: string; summary?: string; content?: string; continuity?: ChapterContinuity }>;
  outlines?: Outline[];
  threads?: PlotThread[];
  characters?: Character[];
  worldSettings?: WorldSetting[];
  instruction?: string;
  onChunk?: (c: string) => void;
}): Promise<{ title: string; summary: string }> {
  const {
    project,
    existingChapters,
    outlines = [],
    threads = [],
    characters = [],
    worldSettings = [],
    instruction = '',
    onChunk,
  } = params;

  const recent = await Promise.all(existingChapters.slice(-8).map(async ch =>
    ch.id && project.id ? await getChapter(ch.id, project.id) || ch : ch));
  const lastChapters = recent
    .map((ch, i) => {
      const idx = existingChapters.length - 8 + i + 1;
      const brief = chapterHandoff({ ...ch, content: ch.content || '', summary: ch.summary || '' }) || (ch.summary?.trim() ? `尚未写出的作者规划：${ch.summary}` : '（暂无正文）');
      return `${Math.max(1, idx)}. ${ch.title}：${brief}`;
    })
    .join('\n');

  const outlineCtx = outlines
    .filter(o => o.type === 'chapter')
    .slice(0, 30)
    .map(o => `- ${o.title}：${trunc(o.summary, 60)}`)
    .join('\n');

  const threadCtx = threads
    .filter(t => t.status !== 'resolved' && t.status !== 'abandoned')
    .slice(0, 12)
    .map(t => `- ${t.title}（${t.status}）：${trunc(t.description, 50)}`)
    .join('\n');

  const charCtx = characters
    .slice(0, 20)
    .map(c => `- ${c.name}（${c.role}）：${trunc(c.personality, 30)}`)
    .join('\n');

  const worldCtx = worldSettings
    .slice(0, 12)
    .map(w => `- ${w.title}：${trunc(w.content, 40)}`)
    .join('\n');

  const instructionBlock = instruction ? `\n额外要求：${instruction}` : '';
  const system = '你是长篇小说连载策划助手。只输出纯 JSON 对象，不含其他文字。';
  const user =
    `为《${project.title}》（${project.genre}）继续规划下一章，必须紧接已有剧情，不可脱离上下文。\n` +
    `作品简介：${trunc(project.synopsis, 200)}\n\n` +
    `最近章节（按时间顺序）：\n${lastChapters || '（暂无）'}\n\n` +
    `人物（节选）：\n${charCtx || '（暂无）'}\n\n` +
    `世界观（节选）：\n${worldCtx || '（暂无）'}\n\n` +
    `现有章节大纲（节选）：\n${outlineCtx || '（暂无）'}\n\n` +
    `未回收伏笔（节选）：\n${threadCtx || '（暂无）'}` +
    instructionBlock +
    `\n\n只输出JSON对象：\n{"title":"第X章 标题","summary":"该章简述（80字内，单章核心推进）"}`;

  const text = await streamChat(system, user, onChunk, 2000, { jsonMode: true });
  const obj = parseJsonFromAI<{ title?: string; summary?: string }>(text);

  return {
    title: (obj.title || '').trim() || `第${existingChapters.length + 1}章`,
    summary: (obj.summary || '').trim() || '推进主线并衔接前文。',
  };
}
