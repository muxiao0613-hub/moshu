/**
 * 上下文编译器 · 分组装配：候选筛选 + 每组标题/规则/上限 + 供 prompt 使用的 sections。
 *
 * 分组顺序就是 prompt 里的段落顺序，也是抽屉里的展示顺序；「哪一组谁先被预算砍掉」
 * 由 ./budget 的 DROP_ORDER 决定，这里只负责把组拼出来。
 *
 * 本文件是 ./plan 的内部实现，对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：./types、./items、@/shared/lib/text、@/shared/lib/styleFingerprint（纯函数）。
 */
import type { AIContextInfo, Outline, PlotThread } from '@/shared/types';
import { profileAtOrder } from '@/shared/lib/profileHistory';
import { usableFacts } from '@/shared/lib/chapterSources';
import { MAX_STYLE_SAMPLES } from '@/shared/lib/styleFingerprint';
import { getRecentContent, matchRelevantCharacters, matchRelevantWorldSettings } from '@/shared/lib/text';
import { MAX_VOICE_CHARACTERS, pickVoiceCharacters } from '@/shared/lib/voiceSample';
import type { ContextGroupKey, ContextItem, ContextPlan, ContextPlanGroup, ContextPlanInput } from './types';
import type { PlanScope } from './items';
import {
  bibleItem,
  characterItems,
  factItems,
  fingerprintItem,
  outlineItem,
  prevSummaryItem,
  ragItems,
  recentContentItem,
  styleSampleItems,
  threadItems,
  voiceCharacterItems,
  worldItems,
} from './items';

export interface ContextGroups {
  groups: ContextPlanGroup[];
  /** 本章大纲节点：contextInfo.outline 与「本章大纲」组共用同一份判断 */
  chapterOutline: Outline | null;
  /** 伏笔候选（非最终注入）：contextInfo.threads 与旧实现一致地报候选条数 */
  threadCandidates: PlotThread[];
}

/**
 * 按现有规则挑选候选并组装分组。
 * 规则逐条对应旧实现（`aiService.ts` buildChapterSystemPrompt / callNovelAI）：
 * - 人物：正文命中姓名或别名 → 最多 6 人；完整人物字段及关系；长字段保留开头与最新补充，单字段 180 字
 * - 世界观：正文命中标题或标签 → 最多 4 条；每条 150 字
 * - 伏笔：未回收（非 resolved/abandoned）且非 minor → 最多 5 条；每条描述 60 字
 * - 事实账本：非 minor → 最多 25 条；不截断
 * - 上章摘要 200 字；本章正文末 2000 字
 * - 故事圣经 / 风格指纹 / 跨章检索：存在即注入
 */
export function buildGroups(input: ContextPlanInput, scope: PlanScope): ContextGroups {
  const {
    project,
    chapter,
    characters: originalCharacters,
    worldSettings,
    outlines,
    threads,
    storyBible,
    factLedger = [],
    styleFingerprint,
    styleSamples,
    ragChunks = [],
    prevChapterSummary = '',
  } = input;
  const characters = originalCharacters.map(c => profileAtOrder(c, chapter ? chapter.order - 1 : undefined));
  const content = chapter?.content ?? '';

  const groups: ContextPlanGroup[] = [];
  const pushGroup = (
    key: ContextGroupKey,
    title: string,
    kind: 'hard' | 'auto',
    rule: string,
    items: ContextItem[],
    limit?: number,
    note?: string
  ) => {
    const injected = items.filter(i => i.injected);
    groups.push({
      key,
      title: note ? `${title} · ${note}` : title,
      kind,
      limit,
      rule,
      items,
      totalCount: items.length,
      injectedCount: injected.length,
      injectedTokens: injected.reduce((sum, i) => sum + i.tokens, 0),
    });
  };

  // 1. 故事圣经（最高优先级约束，不截断）
  if (storyBible) {
    pushGroup('bible', '故事圣经', 'hard', '存在即全量注入（8 个字段，不截断）', [
      bibleItem(scope, storyBible),
    ]);
  }

  // 2. 事实账本：非 minor，最多 25 条
  const factCandidates = usableFacts(factLedger, chapter ? chapter.order - 1 : undefined).filter(f => f.importance !== 'minor');
  pushGroup(
    'facts',
    '事实账本',
    'hard',
    '非 minor 的事实，最多 25 条，单条不截断',
    factItems(scope, factCandidates),
    25
  );

  // 3. 本章已有内容（最近 2000 字）
  const recent = getRecentContent(content);
  pushGroup('recentContent', '本章已有内容', 'hard', '正文末 2000 字（超长时前置省略号）', [
    recentContentItem(scope, recent),
  ]);

  // 4. 本章大纲
  const chapterOutline = outlines.find(o => o.chapterId === chapter?.id) ?? null;
  if (chapterOutline) {
    pushGroup('outline', '本章大纲', 'hard', '大纲摘要 100 字 + 前 4 条关键事件', [
      outlineItem(scope, chapterOutline),
    ]);
  }

  // 5. 涉及人物
  const matched = matchRelevantCharacters(content, characters);
  const charCandidates = matched.length ? matched : characters.filter(c => c.role === 'protagonist' || c.role === 'antagonist');
  pushGroup(
    'characters',
    '涉及人物',
    'auto',
    '正文命中姓名/别名；未命中时取主要人物，最多 6 人；完整人物字段及关系；长字段保留开头与最新补充，单字段 180 字；附上本章之前已确认的相关经历与最近状态',
    characterItems(scope, charCandidates, characters, chapter ? chapter.order - 1 : undefined),
    6
  );

  // 6. 未回收伏笔
  const threadCandidates = threads.filter(
    t => t.status !== 'resolved' && t.status !== 'abandoned' && t.importance !== 'minor'
  );
  pushGroup(
    'threads',
    '未回收伏笔',
    'auto',
    '未回收（非 resolved/abandoned）且非 minor，最多 5 条；描述 60 字',
    threadItems(scope, threadCandidates),
    5
  );

  // 7. 世界观设定
  const worldCandidates = matchRelevantWorldSettings(content, worldSettings);
  pushGroup(
    'world',
    '世界观设定',
    'auto',
    '正文命中标题/标签，最多 4 条；每条 150 字',
    worldItems(scope, worldCandidates),
    4
  );

  // 8. 上章摘要
  pushGroup('prevSummary', '上章摘要', 'auto', '上一章摘要，截断到 200 字', [
    prevSummaryItem(scope, prevChapterSummary),
  ]);

  // 9. 风格指纹
  if (styleFingerprint) {
    pushGroup('fingerprint', '风格指纹', 'auto', '作品级文风描述（句子长度/对话比例/常用词组）', [
      fingerprintItem(scope, styleFingerprint),
    ]);
  }

  // 10. 风格样本（作者原文，紧挨指纹之后）
  // 优先用显式传入的（抽屉/预览可覆盖），否则回落到作品自身，避免调用点漏传就静默丢失
  const sampleTexts = (styleSamples ?? project?.styleSamples ?? [])
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, MAX_STYLE_SAMPLES);
  if (sampleTexts.length > 0) {
    pushGroup(
      'styleSamples',
      '风格样本',
      'auto',
      `作者原文片段（最多 ${MAX_STYLE_SAMPLES} 段），在「设置 → 风格样本」里编辑`,
      styleSampleItems(scope, sampleTexts)
    );
  }

  // 11. 人物语气样本（作者确认过的「他怎么说话」，只给本章上场的角色）
  // 匹配源 = 本章已有正文 + 本章大纲：新章节往往还没有正文，只靠正文会永远匹配不到人。
  const voiceSource = `${content}\n${chapterOutline?.title ?? ''}\n${chapterOutline?.summary ?? ''}`;
  const voiceCandidates = pickVoiceCharacters(voiceSource, characters);
  if (voiceCandidates.length > 0) {
    pushGroup(
      'voiceSamples',
      '人物语气',
      'auto',
      `本章上场的角色各有语气样本时注入，最多 ${MAX_VOICE_CHARACTERS} 人；每人 ≤300 字（在「完善台 › 人物档案」里做对白演练）`,
      voiceCharacterItems(scope, voiceCandidates),
      MAX_VOICE_CHARACTERS
    );
  }

  // 12. 跨章检索
  pushGroup(
    'rag',
    '跨章检索',
    'auto',
    '关键词命中的历史章节片段（不额外消耗 embedding 额度）',
    ragItems(scope, ragChunks)
  );

  return { groups, chapterOutline, threadCandidates };
}

/** 供 prompt 拼装：按组把已注入条目的文本连起来（分隔符与旧实现逐字一致） */
export function buildSections(groups: ContextPlanGroup[]): Partial<Record<ContextGroupKey, string>> {
  const join = (key: ContextGroupKey, sep: string) =>
    groups
      .find(g => g.key === key)
      ?.items.filter(i => i.injected && i.text)
      .map(i => i.text)
      .join(sep);

  return {
    bible: join('bible', '\n\n'),
    facts: join('facts', '\n'),
    rag: join('rag', '\n'),
    fingerprint: join('fingerprint', '\n\n'),
    styleSamples: join('styleSamples', '\n\n'),
    voiceSamples: join('voiceSamples', '\n\n'),
    characters: join('characters', '\n\n'),
    world: join('world', '\n\n'),
    outline: join('outline', '\n'),
    threads: join('threads', '\n'),
    prevSummary: join('prevSummary', '\n'),
    recentContent: join('recentContent', '\n'),
  };
}

/** 卡片/抽屉顶部展示的「这次注入了谁」摘要 */
export function buildContextInfo(
  groups: ContextPlanGroup[],
  chapterOutline: Outline | null,
  threadCandidates: PlotThread[],
  prevChapterSummary: string
): AIContextInfo {
  return {
    characters: (groups.find(g => g.key === 'characters')?.items ?? [])
      .filter(i => i.injected)
      .map(i => i.label),
    worldSettings: (groups.find(g => g.key === 'world')?.items ?? [])
      .filter(i => i.injected)
      .map(i => i.label),
    outline: chapterOutline?.title ?? null,
    // 与旧实现一致：这里是「候选」而非「最终注入」，用于告诉用户本章涉及哪些线
    threads: threadCandidates.map(t => t.title),
    prevSummary: prevChapterSummary || null,
  };
}

/** 抽屉里的「被砍掉」统计：给出条数与理由概览 */
export function summarizePlan(plan: ContextPlan): {
  injected: number;
  skipped: number;
  clipped: number;
  skippedByGroup: { title: string; count: number }[];
} {
  const injected = plan.items.filter(i => i.injected).length;
  const skippedItems = plan.items.filter(i => !i.injected);
  return {
    injected,
    skipped: skippedItems.length,
    clipped: plan.items.filter(i => i.injected && i.clip).length,
    skippedByGroup: plan.groups
      .filter(g => g.items.some(i => !i.injected))
      .map(g => ({ title: g.title, count: g.items.filter(i => !i.injected).length })),
  };
}
