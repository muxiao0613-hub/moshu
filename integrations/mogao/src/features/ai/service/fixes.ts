/**
 * AI 服务 · 各模块的「AI 修复」：按问题清单产出局部修改（只输出 JSON）
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：json / transport（只允许上层业务模块 → 底层模块，不产生环）。
 */
import { trunc } from '@/shared/lib/text';
import type { Character, Outline, PlotThread, Project, TimelineEvent, WorldSetting } from '@/shared/types';
import { parseJsonFromAI } from './json';
import { streamChat } from './transport';

// ---------- 各模块 AI 修复 ----------

/** 通用修复辅助：发 AI 请求 → 解析 JSON → 过滤非法 id */
async function runFixPrompt(
  systemMsg: string,
  userMsg: string,
  validIds: Set<string>,
  maxTokens: number,
  onChunk?: (c: string) => void
): Promise<Array<{ id: string; [k: string]: unknown }>> {
  const text = await streamChat(systemMsg, userMsg, onChunk, maxTokens, { jsonMode: true });
  // AI 可能返回"无需修改"等纯文字，解析失败时视为无修改项
  try {
    const fixes = parseJsonFromAI<Array<{ id: string }>>(text);
    return fixes.filter(f => f.id && validIds.has(f.id));
  } catch {
    return [];
  }
}

// ---------- 时间线修复 ----------

export type TimelineFix = {
  id: string;
  title?: string;
  description?: string;
  date?: string;
  line?: string;
  type?: TimelineEvent['type'];
};

/**
 * 根据全局检查发现的问题，生成时间线修复建议。
 * 只返回需要修改的事件字段（含 id），不变的事件不出现在结果中。
 */
const FIX_SYSTEM = '你是专业的小说编辑。只输出纯 JSON 数组，不含其他文字或 markdown。每个元素必须包含 id 字段，只列出需要修改的条目，只包含需要改动的字段。';

const FIX_RULES = `
规则：
- 只修改有问题的字段，不要无故改动其他内容
- 不需要修改的条目不要出现在结果中
- id 必须与原条目完全一致（禁止捏造）
- 直接输出 JSON，不要任何说明`;

export async function fixTimelineWithAI(params: {
  project: Project; events: TimelineEvent[];
  issuesText: string; onChunk?: (c: string) => void;
}): Promise<TimelineFix[]> {
  const { project, events, issuesText, onChunk } = params;
  if (events.length === 0) return [];
  const list = events.map(e =>
    `id:${e.id} | ${e.date} | ${e.line} | [${e.type}] ${e.title}：${trunc(e.description, 80)}`
  ).join('\n');
  return runFixPrompt(
    FIX_SYSTEM,
    `修正《${project.title}》的时间线事件。\n\n【当前时间线】\n${list}\n\n【问题报告】\n${trunc(issuesText, 1500)}\n${FIX_RULES}\n\n格式：[{"id":"...","date":"...","title":"...","description":"...","line":"...","type":"event|flashback|foreshadow"}]`,
    new Set(events.map(e => e.id)), 2000, onChunk
  ) as Promise<TimelineFix[]>;
}

export async function fixOutlinesWithAI(params: {
  project: Project; outlines: Outline[];
  issuesText: string; onChunk?: (c: string) => void;
}): Promise<Array<{ id: string; title?: string; summary?: string; keyEvents?: string[] }>> {
  const { project, outlines, issuesText, onChunk } = params;
  if (outlines.length === 0) return [];
  const list = outlines.map(o =>
    `id:${o.id} | [${o.type}] ${o.title}：${trunc(o.summary, 80)} | 关键事件：${o.keyEvents.slice(0, 3).join('；')}`
  ).join('\n');
  return runFixPrompt(
    FIX_SYSTEM,
    `修正《${project.title}》的章节大纲。\n\n【当前大纲】\n${list}\n\n【问题报告】\n${trunc(issuesText, 1500)}\n${FIX_RULES}\n\n格式：[{"id":"...","title":"...","summary":"...","keyEvents":["事件1","事件2"]}]`,
    new Set(outlines.map(o => o.id)), 2000, onChunk
  );
}

export async function fixThreadsWithAI(params: {
  project: Project; threads: PlotThread[];
  issuesText: string; onChunk?: (c: string) => void;
}): Promise<Array<{ id: string; status?: PlotThread['status']; description?: string; plantedAt?: string; resolvedAt?: string; importance?: PlotThread['importance'] }>> {
  const { project, threads, issuesText, onChunk } = params;
  if (threads.length === 0) return [];
  const list = threads.map(t =>
    `id:${t.id} | [${t.importance}][${t.status}] ${t.title}：${trunc(t.description, 80)} | 埋于${t.plantedAt}`
  ).join('\n');
  return runFixPrompt(
    FIX_SYSTEM,
    `修正《${project.title}》的伏笔/线索。\n\n【当前伏笔】\n${list}\n\n【问题报告】\n${trunc(issuesText, 1500)}\n${FIX_RULES}\n\n格式：[{"id":"...","status":"planted|developing|resolved|abandoned","importance":"critical|major|minor","description":"...","plantedAt":"...","resolvedAt":"..."}]`,
    new Set(threads.map(t => t.id)), 2000, onChunk
  );
}

export async function fixCharactersWithAI(params: {
  project: Project; characters: Character[];
  issuesText: string; onChunk?: (c: string) => void;
}): Promise<Array<{ id: string; personality?: string; abilities?: string; background?: string; arc?: string; appearance?: string }>> {
  const { project, characters, issuesText, onChunk } = params;
  if (characters.length === 0) return [];
  const list = characters.map(c =>
    `id:${c.id} | [${c.role}] ${c.name}：性格-${trunc(c.personality, 60)} | 能力-${trunc(c.abilities, 40)}`
  ).join('\n');
  return runFixPrompt(
    FIX_SYSTEM,
    `修正《${project.title}》的人物设定。\n\n【当前人物】\n${list}\n\n【问题报告】\n${trunc(issuesText, 1500)}\n${FIX_RULES}\n\n格式：[{"id":"...","personality":"...","abilities":"...","background":"...","arc":"...","appearance":"..."}]`,
    new Set(characters.map(c => c.id)), 2000, onChunk
  );
}

export async function fixWorldSettingsWithAI(params: {
  project: Project; settings: WorldSetting[];
  issuesText: string; onChunk?: (c: string) => void;
}): Promise<Array<{ id: string; content?: string; title?: string }>> {
  const { project, settings, issuesText, onChunk } = params;
  if (settings.length === 0) return [];
  const list = settings.map(s =>
    `id:${s.id} | [${s.category}] ${s.title}：${trunc(s.content, 100)}`
  ).join('\n');
  return runFixPrompt(
    FIX_SYSTEM,
    `修正《${project.title}》的世界观设定。\n\n【当前设定】\n${list}\n\n【问题报告】\n${trunc(issuesText, 1500)}\n${FIX_RULES}\n\n格式：[{"id":"...","title":"...","content":"..."}]`,
    new Set(settings.map(s => s.id)), 2000, onChunk
  );
}
