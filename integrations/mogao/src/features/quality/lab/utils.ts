/**
 * 质量中枢 · 纯工具：平台选项与「一行一条 ↔ 数组」「纯文本 → 正文 HTML」的格式转换。
 *
 * 本文件是 ./lab 的内部实现，对外只由 ../QualityLab 及其面板使用。
 * 依赖方向：（无）（纯函数，无副作用）。
 */

/** 题材雷达的目标平台选项（与题材生成提示词里的平台名保持一致） */
export const PLATFORM_OPTIONS = ['自由创作', '纯文学', '番茄', '七猫', '起点', '晋江', '知乎盐选', '小红书故事', '综合参考'];

/** 一行一条的文本域 → 数组（中英文分号与换行都算分隔符） */
export function linesToArray(text: string): string[] {
  return text.split(/[\n；;]/).map(s => s.trim()).filter(Boolean);
}

/** 数组 → 一行一条的文本域 */
export function arrayToLines(items?: string[]): string {
  return (items || []).join('\n');
}

/** 改稿结果（纯文本）→ 章节正文存储用的 HTML */
export function plainTextToHtml(text: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n+/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escape(p)}</p>`)
    .join('');
}
