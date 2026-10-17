/**
 * AI 能力统一出口（门面）。
 *
 * 实现在 ./service/ 下按职责拆分为 12 个模块：
 * transport / drafts / json / prompts / chapter / chapterDraft / entity / continuation / fixes / assist / voice / profile。
 * 业务代码只依赖本文件，模块之间不互相重导出，改动实现不影响调用点。
 */

export { stripHtml } from '@/shared/lib/contentFormat';

export { AIAbortError, getClient, getSettings, streamChat, testAIConnection } from './service/transport';
export type { CharacterDraft, OutlineDraft, ThreadDraft, TimelineDraft, WorldDraft } from './service/drafts';
export { buildChapterSystemPrompt, longNovelPlatformGuide } from './service/prompts';
export type { LongFormContext } from './service/prompts';
export { callNovelAI, generateFullChapterContent, generateNextChapterBrief, planChapterWithScenes, regenerateScene } from './service/chapter';
export { batchGenerateCharacters, batchGenerateOutlines, batchGenerateThreads, batchGenerateTimeline, batchGenerateWorldSettings, generateForCharacter, generateForOutline, generateForThread, generateForTimeline, generateForWorld } from './service/entity';
export { chatWithAI, expandMaterial, globalConsistencyCheck, polishText } from './service/assist';
export { fixCharactersWithAI, fixOutlinesWithAI, fixThreadsWithAI, fixTimelineWithAI, fixWorldSettingsWithAI } from './service/fixes';
export type { TimelineFix } from './service/fixes';
export { buildRoleplaySystem, buildRoleplayUser, estimateVoiceTokens, roleplayTurn } from './service/voice';
export type { RoleplayTurnParams } from './service/voice';
export type { RoleplayMessage, RoleplayTurn } from '@/shared/lib/roleplay';
export { buildTraitExtractSystem, buildTraitExtractUser, extractCharacterTraits, MAX_TRAIT_SOURCE_CHARS } from './service/profile';
export type { CharacterTraitDraft, TraitExtractParams, TraitRelationDraft } from './service/profile';
export { generateCharactersContinuation, generateOutlineContinuation, generateThreadsContinuation, generateTimelineContinuation, generateWorldContinuation } from './service/continuation';
export type { OutlineContinuationDraft } from './service/continuation';
export { expandChapterContent, extractCharacterChanges, generateChapterFromPlotPoints, generateChapterPlotPoints } from './service/chapterDraft';
export type { CharacterChangeItem, PlotPoint } from './service/chapterDraft';

export { extractChapterMemories } from './service/characterMemory';

export { extractChapterSources } from './service/chapterSources';
