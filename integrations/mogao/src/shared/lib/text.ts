/**
 * 文本工具 —— 上下文拼装与提示词共用的底层函数。
 *
 * 抽出来的原因：`trunc` / `getRecentContent` / 相关性匹配原先只存在于
 * `features/ai/aiService.ts` 内部，导致「上下文抽屉」要看懂规则只能复制一份实现。
 * 一旦复制，UI 展示的规则就可能与真实注入的规则不一致（历史上正是这样出现
 * 「面板说注入了 6 个人物，实际注入了 9 个」这类静默失真）。
 * 因此这里作为**唯一实现**，aiService 与上下文编译器都从这里引用。
 */
import type { Character, WorldSetting } from '@/shared/types';
import { stripHtml } from './contentFormat';

/** 本章正文取末尾 N 字（长章节只喂最近的部分） */
export function getRecentContent(html: string, charLimit = 2000): string {
  const text = stripHtml(html);
  if (text.length <= charLimit) return text;
  return '……' + text.slice(text.length - charLimit);
}

/** 截断字符串，避免单条内容过长 */
export function trunc(s: string, max = 150): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** 正文里出现过（含别名）的人物 */
export function matchRelevantCharacters(content: string, characters: Character[]): Character[] {
  const text = (stripHtml(content) + ' ' + content).toLowerCase();
  return characters.filter(c => {
    if (text.includes(c.name.toLowerCase())) return true;
    return (c.aliases ?? []).some(a => a && text.includes(a.toLowerCase()));
  });
}

/** 正文里出现过（含标签）的世界观设定 */
export function matchRelevantWorldSettings(content: string, settings: WorldSetting[]): WorldSetting[] {
  const text = stripHtml(content).toLowerCase();
  return settings.filter(s =>
    text.includes(s.title.toLowerCase()) ||
    (s.tags ?? []).some(tag => text.includes(tag.toLowerCase()))
  );
}
