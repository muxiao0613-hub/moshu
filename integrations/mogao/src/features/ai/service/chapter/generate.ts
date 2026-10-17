/**
 * AI 服务 · 整章生成：节拍卡 → 蓝图 → 逐场景写作 → 精修 → 质检修复
 *
 * 在拆分中的位置：service/chapter/ 的一层模块（对外门面 ./index.ts，更上层是 @/features/ai/aiService）。
 * 依赖方向：./review（评审与打磨）+ ./prompts + ./transport；由 ./index.ts 重导出。
 */
import {
  buildSceneContinuity,
  buildSceneUserPrompt,
  extractSceneState,
  planScenes,
  sceneProgressLabel,
  type SceneState,
} from '@/features/ai/scenePlan';
import { getRecentContent, trunc } from '@/shared/lib/text';
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
import { deAiPolishChapter, fixChapterByIssues, generateChapterBeatCard, scoreChapter } from './review';

export async function generateFullChapterContent(params: {
  project: Project; chapter: Chapter;
  outlineSummary: string; keyEvents: string[];
  characters: Character[]; worldSettings: WorldSetting[];
  prevSummary: string; targetWordCount: number;
  instruction: string;
  storyBible?: StoryBible | null;
  factLedger?: FactLedger[];
  styleFingerprint?: StyleFingerprint | null;
  ragChunks?: RagChunk[];
  onChunk?: (c: string) => void;
  onPhase?: (label: string) => void;
  /** 逐场景生成结束后回传场景卡（含每场正文），供上层落库 */
  onScenes?: (scenes: SceneCard[], beat: ChapterBeatCard | null) => void;
  signal?: AbortSignal;
  /** 写作台选定的平台（体检条），为空则用作品 targetPlatform */
  platform?: string;
}): Promise<string> {
  const { project, chapter, outlineSummary, keyEvents, characters, worldSettings, prevSummary: rawPrevSummary, targetWordCount, instruction, storyBible, factLedger = [], styleFingerprint, ragChunks = [], onChunk, onPhase, onScenes, signal, platform } = params;

  const ctx = buildLongFormContext({
    project, chapter, throughOrder: chapter.order - 1, outlineSummary, keyEvents, characters, worldSettings, prevSummary: rawPrevSummary,
    targetWordCount, instruction, storyBible, factLedger, styleFingerprint, ragChunks, platform,
  });
  const prevSummary = ctx.prevSummary;
  const { platformGuide, charsCtx, worldCtx, bibleCtx, factsCtx, ragHint, fingerprintHint, instructionBlock } = ctx;

  // ── 第1步：节拍卡（结构 + 节奏曲线），低温、静默 ─────────────────────────
  onPhase?.('① 设计章节结构与节奏…');
  const beat = await generateChapterBeatCard({
    project, chapter, outlineSummary, keyEvents, charsCtx,
    prevSummary, bibleCtx, factsCtx, targetWordCount,
  }).catch(() => null);

  const beatBlueprint = buildBeatBlueprint(beat);

  // ── 第2步：正文（强提示词 + 蓝图），高温、流式 ───────────────────────────
  const system = buildChapterProseSystem(project, chapter);

  // 一次写完的降级路径：节拍卡不可用 / 逐场景产出过少时使用（行为与改造前一致）
  const writeWholeChapter = () => {
    const user = `创作《${chapter.title}》正文（目标约 ${targetWordCount} 字）。
${platformGuide}
【先承上】上一章末尾情境（必须自然接住，不重述、不跳脱）：
${prevSummary || '（本章为开篇）'}

大纲：${trunc(outlineSummary, 240)}
关键事件：${keyEvents.slice(0, 6).join('；')}
涉及人物（保持声口一致）：\n${charsCtx || '暂无'}
世界观：\n${worldCtx || '暂无'}${bibleCtx}${factsCtx}${ragHint}${fingerprintHint}${beatBlueprint}${instructionBlock}

直接从正文第一个字开始，不要输出章节标题或任何前缀。`;
    onPhase?.('② 撰写正文…');
    return streamChat(system, user, onChunk, Math.min(Math.max(targetWordCount * 5, 4000), 16000), { signal, temperature: 0.9 });
  };

  // 逐场景撰写：节拍卡里的 beats 本来就是场景划分，之前被丢掉了（整章一次写完，
  // 于是「结构」只剩一句蓝图，且场与场之间没有记忆）。现在按场推进，并在场间滚动传递
  // 上一场原文尾巴 + 本地提取的状态（出场人物/未落实的必须包含项），零额外 AI 调用。
  const scenes = beat ? planScenes(beat, targetWordCount) : [];
  // 与场景规划同形状的落库记录：逐场写完后回填该场正文
  const sceneRecords: SceneCard[] = scenes.map(s => ({ ...s }));
  let draft = '';
  if (scenes.length >= 2) {
    onPhase?.(`② 逐场景撰写（共 ${scenes.length} 场）…`);
    let prevTail = '';
    let state: SceneState | null = null;
    for (const scene of scenes) {
      onPhase?.(sceneProgressLabel(scene, scenes.length));
      const sceneUser = buildSceneUserPrompt({
        chapterTitle: chapter.title,
        scene,
        sceneTotal: scenes.length,
        targetWordCount,
        platformGuide,
        prevSummary,
        outlineSummary,
        keyEvents,
        charsCtx,
        worldCtx,
        bibleCtx,
        factsCtx,
        ragHint,
        fingerprintHint,
        beatBlueprint,
        instructionBlock,
        continuity: buildSceneContinuity({ plans: scenes, writtenCount: scene.index - 1, prevTail, state }),
      });
      const seg = await streamChat(
        system,
        sceneUser,
        onChunk,
        Math.min(Math.max(scene.wordBudget * 5, 2000), 8000),
        { signal, temperature: 0.9 },
      );
      const text = seg.trim();
      if (!text) continue;
      const rec = sceneRecords.find(r => r.index === scene.index);
      if (rec) rec.text = text;
      draft += (draft ? '\n\n' : '') + text;
      prevTail = getRecentContent(text, 700);
      state = extractSceneState({
        text,
        characters,
        mustInclude: Array.isArray(beat?.mustInclude) ? beat.mustInclude : [],
        accumulated: draft,
      });
    }
  }

  // 逐场景失败（全部为空 / 明显太短）时退回一次写完，不产出半章
  if (draft.replace(/<[^>]*>/g, '').trim().length < 500) {
    const whole = await writeWholeChapter();
    if (whole.replace(/<[^>]*>/g, '').trim().length > draft.replace(/<[^>]*>/g, '').trim().length) {
      draft = whole;
      // 正文改由整章一次性写成，逐场景稿已废弃 → 场景卡只保留规划，不留会误导的正文
      sceneRecords.forEach(r => { r.text = undefined; });
    }
  }

  // 场景卡落库：只有当每场都有正文、且最终正文仍等于逐场景拼接稿时才带上正文。
  // 若随后被整章精修/修复改写过，逐场景稿已不是正文的真实来源，就只保留规划，
  // 免得场景卡里的「这一场」和编辑器里的正文对不上（静默失真）。
  const persistScenes = (finalText: string) => {
    if (!beat) return;
    const allWritten = sceneRecords.length > 0 && sceneRecords.every(r => !!r.text);
    const textIsFinal = allWritten && finalText === draft;
    onScenes?.(
      textIsFinal
        ? sceneRecords
        : sceneRecords.map(r => ({
            index: r.index, scene: r.scene, tension: r.tension,
            pace: r.pace, purpose: r.purpose, wordBudget: r.wordBudget,
          })),
      beat as ChapterBeatCard,
    );
  };

  if (draft.replace(/<[^>]*>/g, '').trim().length < 500) {
    persistScenes(draft);
    return draft; // 太短不值得后续打磨
  }

  // ── 第3步：去 AI 味精修（外科手术式删除+具体化），中温、静默 ─────────────
  onPhase?.('③ 去 AI 味精修…');
  let result = draft;
  try {
    const polished = await deAiPolishChapter(draft, { signal, platform: platform || project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal });
    if (polished && polished.length > draft.length * 0.6) result = polished;
  } catch { /* 精修失败则用原稿 */ }

  // ── 第4-5步：量化质检 + 针对性修复（仅在明显不达标时触发一次）─────────────
  try {
    onPhase?.('④ 质检…');
    const qc = await scoreChapter(result, { targetWordCount, platform: platform || project.targetPlatform, genre: project.genre, qualityGoal: project.qualityGoal, signal });
    if (qc && qc.pass === false && Array.isArray(qc.issues) && qc.issues.length > 0) {
      onPhase?.('⑤ 针对问题修复…');
      const fixed = await fixChapterByIssues(result, qc.issues, { signal });
      if (fixed && fixed.length > result.length * 0.6) result = fixed;
    }
  } catch { /* 质检/修复失败不影响产出 */ }

  persistScenes(result);
  return result;
}

/**
 * 只为已有章节补一份场景规划（节拍卡 + 场景卡），不写正文。
 * 给「已经在写、但当初没按场景生成」的章节用，也让场景条对老章节可用。
 */
