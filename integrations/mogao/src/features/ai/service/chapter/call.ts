/**
 * AI 服务 · 章节续写：把系统提示 + 正文素材交给模型流式产出
 *
 * 在拆分中的位置：service/chapter/ 的一层模块（对外门面 ./index.ts，更上层是 @/features/ai/aiService）。
 * 依赖方向：./transport（流式调用）+ 上下文规划结果，是 chapter/ 里最底层的一环。
 */
import type { ContextPlan } from '@/features/context/contextPlan';
import { TIER_TEMPERATURE, type ContextPrefs } from '@/features/context/contextPrefs';
import type {
  AIContextInfo,
  Chapter,
  Character,
  FactLedger,
  Outline,
  PlotThread,
  Project,
  RagChunk,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';
import { buildChapterSystemPrompt } from '../prompts';
import { getSettings, streamChat } from '../transport';

export async function callNovelAI(params: {
  mode: 'continue' | 'polish' | 'check';
  instruction: string;
  project: Project;
  chapter: Chapter;
  characters: Character[];
  worldSettings: WorldSetting[];
  outlines: Outline[];
  threads: PlotThread[];
  prevChapterSummary?: string;
  selectedText?: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  /** 上下文抽屉里的开关 / 固定 / 排除 / 预算 / 档位 */
  prefs?: ContextPrefs | null;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<{ content: string; contextInfo: AIContextInfo; plan: ContextPlan }> {
  const { mode, instruction, project, chapter, characters, worldSettings, outlines, threads, prevChapterSummary = '', selectedText = '', storyBible, factLedger, styleFingerprint, ragChunks, prefs, onChunk, signal } = params;
  const { defaultWordCount } = getSettings();

  const { prompt: systemPrompt, contextInfo, plan } = buildChapterSystemPrompt({
    project,
    chapter,
    characters,
    worldSettings,
    outlines,
    threads,
    prevChapterSummary,
    storyBible,
    factLedger,
    styleFingerprint,
    ragChunks,
    prefs,
  });

  let userMessage = '';
  if (mode === 'continue') {
    userMessage = `续写：\n${instruction || `约${defaultWordCount}字`}\n\n不要输出章节标题，直接输出正文内容。`;
  } else if (mode === 'polish') {
    userMessage = `润色以下文字：\n\n【原文】\n${selectedText}\n\n【要求】${instruction || '优化语言，保持情节不变'}\n\n直接输出润色后文字。`;
  } else {
    userMessage = `对本章进行一致性检查。${instruction ? `重点：${instruction}` : ''}\n\n检查维度：人物行为/能力/地理/与前文矛盾/伏笔呼应\n\n以列表输出问题（位置+建议），无问题则说明。`;
  }

  // 生成档位（稳 / 常规 / 放）通过真实的 temperature 生效
  const temperature = TIER_TEMPERATURE[plan.prefs.tier];
  const content = await streamChat(systemPrompt, userMessage, onChunk, Math.min(Math.max(defaultWordCount * 5, 5000), 16000), { signal, temperature });
  return { content, contextInfo, plan };
}
