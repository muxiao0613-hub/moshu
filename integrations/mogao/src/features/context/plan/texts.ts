/**
 * 上下文编译器 · 条目文本：把实体渲染成会写进 prompt 的那段文字（含截断口径）。
 *
 * 这里是与旧实现**逐字对齐**的地方（性格 80 / 能力 60 / 背景 80 / 弧线 60 …），
 * 规则一旦漂移就会出现「面板显示的文本 ≠ 实际注入的文本」，所以集中在一个文件里改。
 *
 * 本文件是 ./plan 的内部实现，对外统一由 @/features/context/contextPlan 门面导出。
 * 依赖方向：@/shared/lib/text、@/shared/types（纯函数，无副作用）。
 */
import type {
  Character,
  FactLedger,
  Outline,
  PlotThread,
  StoryBible,
  WorldSetting,
} from '@/shared/types';
import { trunc } from '@/shared/lib/text';
import { characterProfile } from '@/shared/lib/characterProfile';

/** 截断并记录砍掉的信息量 */
export function clip(raw: string, limit: number, label: string): { text: string; note?: string } {
  const value = raw ?? '';
  if (value.length <= limit) return { text: value };
  return { text: trunc(value, limit), note: `${label} ${value.length} → ${limit} 字` };
}

export function characterText(c: Character, withClip: boolean, characters: Character[] = [], throughOrder?: number): { text: string; full: string; clip?: string } {
  const full = characterProfile(c, characters, Number.MAX_SAFE_INTEGER, { throughOrder });
  const text = withClip ? characterProfile(c, characters, 180, { throughOrder }) : full;
  return { text, full, clip: text !== full ? '长字段保留开头与最新补充，单字段最多 180 字' : undefined };
}

export function worldText(s: WorldSetting, withClip: boolean): { text: string; full: string; clip?: string } {
  const c = clip(s.content ?? '', 150, '内容');
  return withClip
    ? { text: `【${s.title}】${c.text}`, full: `【${s.title}】${s.content ?? ''}`, clip: c.note }
    : { text: `【${s.title}】${s.content ?? ''}`, full: `【${s.title}】${s.content ?? ''}` };
}

export function threadText(t: PlotThread, withClip: boolean): string {
  const level = t.importance === 'critical' ? '关键' : '重要';
  if (!withClip) return `- 【${level}】${t.title}：${t.description ?? ''}`;
  return `- 【${level}】${t.title}：${trunc(t.description ?? '', 60)}`;
}

export function factText(f: FactLedger): string {
  return `- [${f.type}] ${f.subject}：${f.fact}${f.locked ? '（锁定，不可推翻）' : ''}`;
}

export function bibleText(b: StoryBible): string {
  return `核心卖点：${b.coreHook}
目标读者：${b.targetReader}
主角欲望：${b.protagonistDesire}
主线矛盾：${b.mainConflict}
能力规则：${(b.powerRules ?? []).join('；')}
硬性设定锁：${(b.hardRules ?? []).join('；')}
文风基调：${b.tone}
禁忌（绝对不写）：${(b.taboo ?? []).join('；')}`;
}

export function outlineText(o: Outline): string {
  return `${o.title}：${trunc(o.summary ?? '', 100)}（关键事件：${(o.keyEvents ?? []).slice(0, 4).join('；')}）`;
}
