/**
 * AI 服务 · 逐场景规划（只出规划不写正文）与单场定点重写
 *
 * 在拆分中的位置：service/chapter/ 的一层模块（对外门面 ./index.ts，更上层是 @/features/ai/aiService）。
 * 依赖方向：./review（节拍卡）+ @/features/ai/scenePlan；由 ./index.ts 重导出。
 */
import {
  buildSceneContinuity,
  buildSceneUserPrompt,
  extractSceneState,
  planScenes,
} from '@/features/ai/scenePlan';
import { STRUCTURE_TEMPLATES, buildTemplateHint } from '@/shared/lib/storyRules';
import { getRecentContent } from '@/shared/lib/text';
import type {
  Chapter,
  ChapterBeatCard,
  Character,
  FactLedger,
  Project,
  RagChunk,
  SceneCard,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';
import { buildBeatBlueprint, buildChapterProseSystem, buildLongFormContext } from '../prompts';
import { streamChat } from '../transport';
import { generateChapterBeatCard } from './review';

export async function planChapterWithScenes(params: {
  project: Project; chapter: Chapter;
  outlineSummary: string; keyEvents: string[];
  characters: Character[]; worldSettings: WorldSetting[];
  prevSummary: string; targetWordCount: number; instruction?: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  onPhase?: (label: string) => void;
  signal?: AbortSignal;
  /** 结构模板 id（写作台「AI 排场景」所选，来自 shared/lib/storyRules 的 STRUCTURE_TEMPLATES） */
  templateId?: string;
  /** 写作台选定的平台（体检条），为空则用作品 targetPlatform */
  platform?: string;
}): Promise<{ beat: ChapterBeatCard | null; scenes: SceneCard[] }> {
  const ctx = buildLongFormContext({
    project: params.project, chapter: params.chapter,
    throughOrder: params.chapter.order - 1,
    outlineSummary: params.outlineSummary,
    keyEvents: params.keyEvents,
    characters: params.characters,
    worldSettings: params.worldSettings,
    prevSummary: params.prevSummary,
    targetWordCount: params.targetWordCount,
    instruction: params.instruction ?? '',
    storyBible: params.storyBible,
    factLedger: params.factLedger,
    styleFingerprint: params.styleFingerprint,
    ragChunks: params.ragChunks,
    platform: params.platform,
  });
  params.onPhase?.('① 设计章节结构与节奏…');
  const beat = await generateChapterBeatCard({
    project: params.project, chapter: params.chapter,
    outlineSummary: params.outlineSummary, keyEvents: params.keyEvents,
    charsCtx: ctx.charsCtx, prevSummary: ctx.prevSummary,
    bibleCtx: ctx.bibleCtx, factsCtx: ctx.factsCtx,
    targetWordCount: params.targetWordCount,
    templateHint: buildTemplateHint(STRUCTURE_TEMPLATES.find(t => t.id === params.templateId)),
  }).catch(() => null);
  return {
    beat: (beat as ChapterBeatCard | null) ?? null,
    scenes: beat ? planScenes(beat, params.targetWordCount) : [],
  };
}

/**
 * 只重写一章里的**某一场景**（定点修复）。
 * 这是 REWRITE_PLAN 里「禁止整章重写」原则落到 UI 的出口：
 * 某一场写弱了、AI 味重了，就重写这一场，其余场次一个字不动。
 */
export async function regenerateScene(params: {
  project: Project; chapter: Chapter;
  beat?: ChapterBeatCard | null;
  scenes: SceneCard[];
  index: number;
  outlineSummary: string; keyEvents: string[];
  characters: Character[]; worldSettings: WorldSetting[];
  prevSummary: string; targetWordCount: number; instruction?: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  onChunk?: (c: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { project, chapter, beat, scenes, index, characters, targetWordCount } = params;
  const scene = scenes.find(s => s.index === index);
  if (!scene) return '';

  const ctx = buildLongFormContext({
    project, chapter,
    throughOrder: chapter.order - 1,
    outlineSummary: params.outlineSummary,
    keyEvents: params.keyEvents,
    characters,
    worldSettings: params.worldSettings,
    prevSummary: params.prevSummary,
    targetWordCount,
    instruction: params.instruction ?? '',
    storyBible: params.storyBible,
    factLedger: params.factLedger,
    styleFingerprint: params.styleFingerprint,
    ragChunks: params.ragChunks,
  });

  // 衔接素材来自「这一场之前的场次」，不使用后面的场次（否则会剧透式收尾）
  const before = scenes.filter(s => s.index < index).sort((a, b) => a.index - b.index);
  const written = before.filter(s => !!s.text && !!s.text.trim());
  const accumulated = written.map(s => (s.text || '').trim()).join('\n\n');
  const lastText = written.length > 0 ? (written[written.length - 1].text || '') : '';
  const state = accumulated
    ? extractSceneState({
        text: lastText,
        characters,
        mustInclude: Array.isArray(beat?.mustInclude) ? beat!.mustInclude : [],
        accumulated,
      })
    : null;

  const oldPlain = (scene.text || '').replace(/<[^>]*>/g, '').trim();
  const rewriteNote = oldPlain
    ? `\n\n【重写要求】这是第 ${scene.index} 场的**重写**：下面是这一场原来的稿子，请重写它——保留必须落地的信息，改掉拖沓、平淡和 AI 腔，不要复述上一场结尾，不要写后面的场景。\n原稿：\n${oldPlain.slice(0, 1200)}`
    : '';

  const sceneUser = buildSceneUserPrompt({
    chapterTitle: chapter.title,
    scene,
    sceneTotal: scenes.length,
    targetWordCount,
    platformGuide: ctx.platformGuide,
    prevSummary: ctx.prevSummary,
    outlineSummary: ctx.outlineSummary,
    keyEvents: ctx.keyEvents,
    charsCtx: ctx.charsCtx,
    worldCtx: ctx.worldCtx,
    bibleCtx: ctx.bibleCtx,
    factsCtx: ctx.factsCtx,
    ragHint: ctx.ragHint,
    fingerprintHint: ctx.fingerprintHint,
    beatBlueprint: buildBeatBlueprint(beat),
    instructionBlock: ctx.instructionBlock,
    continuity: buildSceneContinuity({
      plans: scenes,
      writtenCount: written.length,
      prevTail: getRecentContent(lastText, 700),
      state,
    }),
  }) + rewriteNote;

  const system = buildChapterProseSystem(project, chapter);
  const seg = await streamChat(
    system,
    sceneUser,
    params.onChunk,
    Math.min(Math.max(scene.wordBudget * 5, 2000), 8000),
    { signal: params.signal, temperature: 0.9 },
  );
  return seg.trim();
}

// 第4步：量化质检（自检硬指标），返回 {pass, score, issues}
