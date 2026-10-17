/**
 * 短篇生成服务（门面）。
 *
 * 实现在 ./service/ 下按职责拆分为 8 个模块，业务代码（ShortStoryWorkspace）只依赖本文件：
 *   text      纯文本工具（清洗 / 成篇判断 / JSON 解析 / 字数区间）—— 最低层
 *   transport 模型传输层（流式对话 / 用量 / 截断续写补全）
 *   prompts   提示词组装（成稿标准 / 叙事引擎 / 平台提示 / 核心一句话锁定）
 *   outline   骨架与内核（骨架生成 / 内核补强 / 标题 / 自动场景规划）
 *   openings  多版本开头与结尾
 *   draft     成稿流程（一次成稿 / 逐场景分段成稿 / 字数补足）
 *   review    质检（五维评审）
 *   revise    改稿（全文精修 / 选中改写 / 续写）
 *
 * 依赖方向为无环 DAG：text → transport/prompts → outline/openings/review/revise → draft。
 * 业务代码 import 路径不变，改动实现不影响调用点。
 */

export { isStoryTextComplete } from './service/text';

export { generateStoryStructure, enhanceStoryPremise, generateStoryTitle } from './service/outline';
export { generateMultipleOpenings, generateMultipleEndings } from './service/openings';
export { generateFullShortStory, completeShortStoryToTarget } from './service/draft';
export { reviewShortStoryQuality } from './service/review';
export { reviseFullShortStory, rewriteSelection, continueShortStory } from './service/revise';
