/**
 * AI 服务 · 章级生成流程（门面）
 *
 * 在拆分中的位置：`service/chapter/` 对外的唯一入口；调用方（./aiService、./assist 等）只认这个路径。
 * 依赖方向：本文件只做重导出，实现分散在同目录的 call / generate / scenes / review / brief。
 */
export { callNovelAI } from './call';
export { generateFullChapterContent } from './generate';
export { planChapterWithScenes, regenerateScene } from './scenes';
export { generateNextChapterBrief } from './brief';
