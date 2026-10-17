/**
 * 上下文编译器 · 条目构建：把各类候选实体收敛成 ContextItem（含开关 / 固定 / 条数上限口径）。
 *
 * 这里只回答「某条候选变成什么条目、为什么注入或没注入」；「分几组、每组什么标题与上限」
 * 由 ./groups 决定，「预算裁剪」由 ./budget 决定。
 *
 * 本文件是 ./plan 的内部实现，对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：./types、./texts、@/api/tokenTracker、@/shared/lib/text（纯函数，无副作用）。
 */
import type {
  Character,
  FactLedger,
  Outline,
  PlotThread,
  RagChunk,
  StoryBible,
  StyleFingerprint,
  WorldSetting,
} from '@/shared/types';
import { estimateTokens } from '@/api/tokenTracker';
import { stylePromptHint } from '@/shared/lib/styleFingerprint';
import { trunc } from '@/shared/lib/text';
import {
  MAX_VOICE_CHARACTERS,
  characterVoiceHint,
  characterVoiceText,
} from '@/shared/lib/voiceSample';
import type { ContextGroupKey, ContextItem, ContextItemEntity } from './types';
import { bibleText, characterText, factText, outlineText, threadText, worldText } from './texts';

/** 条目 id 前缀：抽屉与生成链路据此识别"这是哪条" */
export const ITEM_PREFIX: Record<string, string> = {
  characters: 'character',
  world: 'world',
  threads: 'thread',
  facts: 'fact',
  voiceSamples: 'voice',
};

/**
 * 一次编译的过滤上下文：把「用户关掉 / 本章排除 / 已固定」的查询收口成两个函数，
 * 让条目构建不必知道 prefs 的内部结构（chapterId 已闭包在实现里）。
 */
export interface PlanScope {
  /** 该条是否被用户关掉 / 标记为「本章无关」；返回非空即不注入，字符串就是展示给用户的理由 */
  blockedBy: (id: string, group: ContextGroupKey) => string | null;
  isPinned: (id: string, group: ContextGroupKey) => boolean;
}

/** 候选 → 条目文本的构建结果（pickItems 的 build 回调形状） */
export interface BuiltItem {
  text: string;
  full: string;
  clip?: string;
  label: string;
  entity?: ContextItemEntity;
}

interface BlockableItemArgs {
  scope: PlanScope;
  id: string;
  group: ContextGroupKey;
  label: string;
  /** 未被关闭时应写入 prompt 的文本 */
  text: string;
  /** 未截断的完整文本 */
  full: string;
  /** 未被关闭时的注入理由 */
  reason: string;
  /** 未被关闭时是否真的算注入（例：本章还没有正文时「最近 2000 字」不注入） */
  active: boolean;
  /** 本身即硬约束（不受预算裁剪）；固定项由 isPinned 追加为硬约束 */
  hard: boolean;
  clip?: string;
  entity?: ContextItemEntity;
}

/** 单条组的统一收口：应用开关 / 固定 / 「被关闭时文本清空但 token 仍按原文本估算」 */
export function buildBlockableItem(args: BlockableItemArgs): ContextItem {
  const blocked = args.scope.blockedBy(args.id, args.group);
  const pinned = args.scope.isPinned(args.id, args.group);
  return {
    id: args.id,
    group: args.group,
    label: args.label,
    text: blocked ? '' : args.text,
    full: args.full,
    tokens: estimateTokens(args.text),
    fullTokens: estimateTokens(args.full),
    injected: !blocked && args.active,
    reason: blocked ?? args.reason,
    pinned,
    hard: args.hard || pinned,
    clip: args.clip,
    entity: args.entity,
  };
}

/** 统一收口：应用开关 / 固定 / 条数上限 */
export function pickItems<T>(
  scope: PlanScope,
  group: ContextGroupKey,
  candidates: T[],
  idOf: (t: T) => string,
  cap: number | undefined,
  build: (t: T, withClip: boolean) => BuiltItem
): ContextItem[] {
  const items: ContextItem[] = [];
  let kept = 0;
  for (const cand of candidates) {
    const rawId = idOf(cand);
    const id = `${ITEM_PREFIX[group]}:${rawId}`;
    const pinned = scope.isPinned(id, group);
    const built = build(cand, true);
    const fullBuilt = build(cand, false);
    const blocked = scope.blockedBy(id, group);
    let injected = !blocked;
    let reason: string;
    if (blocked) {
      reason = blocked;
    } else if (pinned) {
      reason = '已固定：硬约束，不计入条数上限';
    } else if (cap != null && kept >= cap) {
      injected = false;
      reason = `超出本组上限 ${cap} 条`;
    } else {
      reason = `符合注入规则（本组上限 ${cap ?? '不限'}）`;
    }
    if (injected && !pinned) kept += 1;
    items.push({
      id,
      group,
      label: built.label,
      text: built.text,
      full: fullBuilt.full,
      tokens: estimateTokens(built.text),
      fullTokens: estimateTokens(fullBuilt.full),
      injected,
      reason,
      pinned,
      // 事实账本属硬约束组：不受预算裁剪，但仍受 25 条上限约束
      hard: pinned || group === 'facts',
      clip: built.clip,
      entity: built.entity,
    });
  }
  return items;
}

/* ---------------- 单条组 ---------------- */

export function bibleItem(scope: PlanScope, bible: StoryBible): ContextItem {
  const text = bibleText(bible);
  return buildBlockableItem({
    scope,
    id: 'group:bible',
    group: 'bible',
    label: '故事圣经',
    text,
    full: text,
    reason: '存在即注入，作为最高优先级约束',
    active: true,
    hard: true,
  });
}

export function recentContentItem(scope: PlanScope, recent: string): ContextItem {
  return buildBlockableItem({
    scope,
    id: 'group:recentContent',
    group: 'recentContent',
    label: '最近 2000 字',
    text: recent,
    full: recent,
    reason: recent ? '续写时必须带上，避免前后脱节' : '本章尚无内容',
    active: !!recent,
    hard: true,
  });
}

export function outlineItem(scope: PlanScope, outline: Outline): ContextItem {
  const text = outlineText(outline);
  return buildBlockableItem({
    scope,
    id: 'group:outline',
    group: 'outline',
    label: outline.title,
    text,
    full: text,
    reason: '本章有对应大纲节点',
    active: true,
    hard: true,
  });
}

export function prevSummaryItem(scope: PlanScope, prevChapterSummary: string): ContextItem {
  const text = trunc(prevChapterSummary, 200);
  const raw = prevChapterSummary ?? '';
  return buildBlockableItem({
    scope,
    id: 'group:prevSummary',
    group: 'prevSummary',
    label: '上一章摘要',
    text,
    full: raw,
    reason: text ? '保持跨章连贯' : '上一章还没有摘要',
    active: !!text,
    hard: false,
    clip: raw.length > 200 ? `摘要 ${raw.length} → 200 字` : undefined,
  });
}

export function fingerprintItem(scope: PlanScope, fingerprint: StyleFingerprint): ContextItem {
  const text = stylePromptHint(fingerprint);
  return buildBlockableItem({
    scope,
    id: 'group:fingerprint',
    group: 'fingerprint',
    label: '风格指纹',
    text,
    full: text,
    reason: '作品已提取风格指纹',
    active: true,
    hard: false,
  });
}

/* ---------------- 多条组 ---------------- */

export function factItems(scope: PlanScope, candidates: FactLedger[]): ContextItem[] {
  return pickItems(scope, 'facts', candidates, f => f.id, 25, f => ({
    text: factText(f),
    full: factText(f),
    label: `[${f.type}] ${f.subject}`,
    entity: {
      kind: 'fact',
      id: f.id,
      fields: [{ key: 'fact', label: '事实内容', value: f.fact, multiline: true }],
    },
  }));
}

export function characterItems(scope: PlanScope, candidates: Character[], characters: Character[] = candidates, throughOrder?: number): ContextItem[] {
  return pickItems(scope, 'characters', candidates, c => c.id, 6, c => ({
    ...characterText(c, true, characters, throughOrder),
    label: c.name,
    entity: {
      kind: 'character',
      id: c.id,
      fields: [
        { key: 'personality', label: '性格', value: c.personality ?? '', multiline: true },
        { key: 'abilities', label: '能力', value: c.abilities ?? '', multiline: true },
        { key: 'goals', label: '目标', value: c.goals ?? '', multiline: true },
        { key: 'background', label: '背景', value: c.background ?? '', multiline: true },
        { key: 'arc', label: '弧线', value: c.arc ?? '', multiline: true },
      ],
    },
  }));
}

export function threadItems(scope: PlanScope, candidates: PlotThread[]): ContextItem[] {
  return pickItems(scope, 'threads', candidates, t => t.id, 5, t => ({
    text: threadText(t, true),
    full: threadText(t, false),
    clip: (t.description ?? '').length > 60 ? `描述 ${(t.description ?? '').length} → 60 字` : undefined,
    label: `${t.importance === 'critical' ? '关键' : '重要'}·${t.title}`,
    entity: {
      kind: 'thread',
      id: t.id,
      fields: [{ key: 'description', label: '伏笔描述', value: t.description ?? '', multiline: true }],
    },
  }));
}

export function worldItems(scope: PlanScope, candidates: WorldSetting[]): ContextItem[] {
  return pickItems(scope, 'world', candidates, s => s.id, 4, s => ({
    ...worldText(s, true),
    label: s.title,
    entity: {
      kind: 'world',
      id: s.id,
      fields: [{ key: 'content', label: '设定内容', value: s.content ?? '', multiline: true }],
    },
  }));
}

export function styleSampleItems(scope: PlanScope, sampleTexts: string[]): ContextItem[] {
  return sampleTexts.map((text, i) =>
    buildBlockableItem({
      scope,
      id: `sample:${i}`,
      group: 'styleSamples',
      label: `样本 ${i + 1}`,
      text,
      full: text,
      reason: '作者原文样本（模仿语感，不照抄情节）',
      active: true,
      hard: false,
    })
  );
}

/**
 * 人物语气样本：一条 = 一个角色。
 *
 * 文本自带「【某某的语气…】」小标题（见 shared/lib/voiceSample.ts），所以每条都能独立开关、
 * 也能在 prompt 里独立读懂；`entity` 指向人物，抽屉里因此能直接给「去完善台改（人物档案）」。
 */
export function voiceCharacterItems(scope: PlanScope, candidates: Character[]): ContextItem[] {
  return pickItems(scope, 'voiceSamples', candidates, c => c.id, MAX_VOICE_CHARACTERS, c => {
    const text = characterVoiceHint(c) ?? '';
    return {
      text,
      full: characterVoiceText(c),
      label: `${c.name} 的语气`,
      entity: {
        kind: 'character',
        id: c.id,
        fields: [{ key: 'voiceSamples', label: '语气样本', value: characterVoiceText(c), multiline: true }],
      },
    };
  });
}

export function ragItems(scope: PlanScope, chunks: RagChunk[]): ContextItem[] {
  return chunks.map(c => {
    const text = `第${c.chapterOrder}章《${c.chapterTitle}》：${c.excerpt}`;
    return buildBlockableItem({
      scope,
      id: `rag:${c.chapterId}`,
      group: 'rag',
      label: `第${c.chapterOrder}章《${c.chapterTitle}》`,
      text,
      full: text,
      reason: `关键词命中（相关度 ${typeof c.score === 'number' ? c.score.toFixed(2) : '—'}）`,
      active: true,
      hard: false,
    });
  });
}
