/** 人物章节记忆的跨 feature 门户。 */
export { stageChapterMemories, syncCharacterMemories } from './memory/sync';
export { syncGeneratedChapter, characterSyncReportText } from './memory/generation';
export { loadCharacterSyncPreferences } from './memory/preferences';
export { useCharacterSyncPreferences } from './memory/useCharacterSyncPreferences';

export type { CharacterSyncReport } from './memory/generation';
