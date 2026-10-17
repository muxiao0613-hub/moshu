/**
 * 导入向导的解析/校验纯函数：文件名 → 书名、正文 → 章节、AI 文本 → 设定、提交前校验。
 *
 * 在拆分中的位置：纯函数层，对外门面是 `shared/layout/ImportWizard.tsx`，
 * `useImportWizard` 与 `importRunner` 都只通过这些函数处理文本。
 * 依赖方向：`@/shared/lib/chapterSplitter`（与写作台同一份切分规则）+ `./types` →（本文件）→ hook/runner。
 */
import { splitNovelText, type DetectedChapter } from '@/shared/lib/chapterSplitter';
import type { ExtractedMeta } from './types';

/** 文件名去掉扩展名后的结果（如 `斗破.txt` → `斗破`）。 */
function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

/** 按文件名推断书名并切分章节。 */
export function parseNovelFile(fileName: string, text: string): {
  title: string;
  chapters: DetectedChapter[];
  detectionMethod: string;
  totalWords: number;
} {
  const result = splitNovelText(text);
  return {
    title: titleFromFileName(fileName),
    chapters: result.chapters,
    detectionMethod: result.detectionMethod,
    totalWords: result.totalWords,
  };
}

/** 章节正文 → 编辑器使用的富文本（每段一个 <p>，只转义必要的三个字符）。 */
export function chapterTextToHtml(content: string): string {
  return content
    .split(/\n+/)
    .filter(Boolean)
    .map(p => `<p>${p.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
    .join('\n');
}

/** 取前 5 章、每章最多 800 字作为 AI 分析样本。 */
export function buildExtractionSample(chapters: DetectedChapter[]): string {
  return chapters.slice(0, 5)
    .map(c => `【${c.title}】\n${c.content.slice(0, 800)}`)
    .join('\n\n');
}

/** AI 返回文本 → 设定对象；取不到 JSON 结构就抛错（由 hook 转成 extractError）。 */
export function parseExtractedMeta(text: string): ExtractedMeta {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI 返回格式异常');
  return JSON.parse(jsonMatch[0]) as ExtractedMeta;
}

/** 提交前的校验：书名非空且至少识别出一章。 */
export function canPersist(title: string, chapters: DetectedChapter[]): boolean {
  return !!title.trim() && chapters.length > 0;
}
