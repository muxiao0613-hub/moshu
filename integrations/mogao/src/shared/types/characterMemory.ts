/** 按章节保存的角色经历；待确认和失效记录保留在档案中，但不进入生成上下文。 */
export type CharacterMemoryKind = 'experience' | 'knowledge' | 'state' | 'relationship';
export interface CharacterMemoryClaim {
  kind: CharacterMemoryKind;
  text: string;
  quote: string;
}
export interface CharacterLifeMemory {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  sourceHash: string;
  status: 'pending' | 'confirmed' | 'stale';
  claims: CharacterMemoryClaim[];
  generatedAt: string;
  confirmedAt?: string;
  confirmation?: 'author' | 'generated';
  sourceStatus?: 'draft' | 'revised' | 'final';
  profileChanges?: CharacterProfileChange[];
}

export type CharacterProfileField = 'appearance' | 'personality' | 'goals' | 'background' | 'abilities' | 'notes';
export interface CharacterProfileChange {
  field: CharacterProfileField;
  text: string;
  quote: string;
  status?: 'pending' | 'confirmed' | 'rejected';
  confirmedAt?: string;
}
export interface CharacterSyncPreferences {
  mode: 'auto' | 'review' | 'off';
  scope: 'involved' | 'selected';
  characterIds: string[];
}
