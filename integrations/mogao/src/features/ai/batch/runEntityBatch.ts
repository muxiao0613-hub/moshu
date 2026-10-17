/**
 * AI 批量生成 · 知识库五步批量生成编排（人物 → 世界观 → 大纲 → 伏笔 → 时间线）。
 *
 * 位置：./batch 的取数编排层，被 useBatchGenerate 的 handleGenerate 调用；
 * 本文件不持有 state，步骤状态通过回调写回 hook（流式文本走 appendRawText 的函数式追加）。
 * 依赖方向：@/features/ai/aiService（生成能力）→ ./batchUtils、./types；不引用展示组件。
 */
import {
  batchGenerateCharacters,
  batchGenerateOutlines,
  batchGenerateThreads,
  batchGenerateTimeline,
  batchGenerateWorldSettings,
  type CharacterDraft,
  type OutlineDraft,
  type ThreadDraft,
  type TimelineDraft,
  type WorldDraft,
} from '@/features/ai/aiService';
import type { Chapter, Character, Project } from '@/shared/types';

import { buildExistingCharacterSummary, buildVolumeContinuationContext } from './batchUtils';
import type { StepKey, StepState } from './types';

export interface EntityBatchParams {
  project: Project;
  mode: 'first' | 'continue';
  instruction: string;
  charCount: string;
  chaptersPerVolume: string;
  enabled: Record<StepKey, boolean>;
  existingChars: Character[];
  existingChapters: Chapter[];
  /** 每步开始前检查用户是否点了「停止」 */
  isAborted: () => boolean;
  updateStep: (key: StepKey, patch: Partial<StepState>) => void;
  /** 流式增量：必须函数式追加，避免同一批多个 chunk 互相覆盖 */
  appendRawText: (key: StepKey, chunk: string) => void;
  expandStep: (key: StepKey) => void;
}

export async function runEntityBatch(p: EntityBatchParams): Promise<void> {
  const { project, mode, instruction, enabled, existingChars, existingChapters } = p;

  let charDrafts: CharacterDraft[] = [];
  let worldDrafts: WorldDraft[] = [];
  let outlineDrafts: OutlineDraft[] = [];
  let threadDrafts: ThreadDraft[] = [];
  let timelineDrafts: TimelineDraft[] = [];

  // 1. 人物
  if (enabled.characters && !p.isAborted()) {
    p.updateStep('characters', { status: 'running' });
    try {
      const existingCharSummary = mode === 'continue' ? buildExistingCharacterSummary(existingChars) : '';
      charDrafts = await batchGenerateCharacters({
        project,
        instruction: instruction + existingCharSummary,
        count: parseInt(p.charCount) || 30,
        onChunk: c => p.appendRawText('characters', c),
      });
      const sel = new Set<number>(charDrafts.map((_, i) => i));
      p.updateStep('characters', { status: 'done', data: charDrafts, selected: sel });
      p.expandStep('characters');
    } catch (e) {
      p.updateStep('characters', { status: 'error', error: (e as Error).message });
    }
  }

  // 2. 世界观
  if (enabled.world && !p.isAborted()) {
    p.updateStep('world', { status: 'running' });
    try {
      worldDrafts = await batchGenerateWorldSettings({
        project, characters: charDrafts, instruction,
        onChunk: c => p.appendRawText('world', c),
      });
      const sel = new Set<number>(worldDrafts.map((_, i) => i));
      p.updateStep('world', { status: 'done', data: worldDrafts, selected: sel });
      p.expandStep('world');
    } catch (e) {
      p.updateStep('world', { status: 'error', error: (e as Error).message });
    }
  }

  // 3. 大纲
  if (enabled.outlines && !p.isAborted()) {
    p.updateStep('outlines', { status: 'running' });
    try {
      const perVol = parseInt(p.chaptersPerVolume) || 80;

      // 续写模式：提取上一卷末尾章节的摘要作为上下文
      const continuationCtx = mode === 'continue' && existingChapters.length > 0
        ? buildVolumeContinuationContext(existingChapters, perVol)
        : '';

      outlineDrafts = await batchGenerateOutlines({
        project, characters: charDrafts,
        instruction: instruction + continuationCtx,
        volumeCount: 1,   // 每次固定生成一卷
        chaptersPerVolume: perVol,
        onChunk: c => p.appendRawText('outlines', c),
      });
      const sel = new Set<number>(outlineDrafts.map((_, i) => i));
      p.updateStep('outlines', { status: 'done', data: outlineDrafts, selected: sel });
      p.expandStep('outlines');
    } catch (e) {
      p.updateStep('outlines', { status: 'error', error: (e as Error).message });
    }
  }

  // 4. 伏笔
  if (enabled.threads && !p.isAborted()) {
    p.updateStep('threads', { status: 'running' });
    try {
      const existingThreadsSummary = mode === 'continue'
        ? `\n请基于现有内容的伏笔进展，为新一卷设计伏笔（可延续已有伏笔、深化冲突、或埋下新伏笔），确保故事张力和悬念。`
        : '';
      threadDrafts = await batchGenerateThreads({
        project, characters: charDrafts, outlines: outlineDrafts, instruction: instruction + existingThreadsSummary,
        onChunk: c => p.appendRawText('threads', c),
      });
      const sel = new Set<number>(threadDrafts.map((_, i) => i));
      p.updateStep('threads', { status: 'done', data: threadDrafts, selected: sel });
      p.expandStep('threads');
    } catch (e) {
      p.updateStep('threads', { status: 'error', error: (e as Error).message });
    }
  }

  // 5. 时间线
  if (enabled.timeline && !p.isAborted()) {
    p.updateStep('timeline', { status: 'running' });
    try {
      const existingTimelineSummary = mode === 'continue'
        ? `\n请延续现有时间线，为新一卷设计对应的重要事件、关键时刻和历史背景。`
        : '';
      timelineDrafts = await batchGenerateTimeline({
        project, characters: charDrafts, outlines: outlineDrafts, instruction: instruction + existingTimelineSummary,
        onChunk: c => p.appendRawText('timeline', c),
      });
      const sel = new Set<number>(timelineDrafts.map((_, i) => i));
      p.updateStep('timeline', { status: 'done', data: timelineDrafts, selected: sel });
      p.expandStep('timeline');
    } catch (e) {
      p.updateStep('timeline', { status: 'error', error: (e as Error).message });
    }
  }
}
