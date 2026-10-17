export type NovelLengthPresetId = 'short' | 'medium' | 'long' | 'epic';

export interface NovelLengthPreset {
  id: NovelLengthPresetId;
  label: string;
  subtitle: string;
  targetWords: number;
  volumes: number;
  chaptersPerVolume: number;
  chapterWordCount: number;
  characterCount: number;
  coreCharacters: string;
  structureHint: string;
  suitableFor: string;
}

export const NOVEL_LENGTH_PRESETS: NovelLengthPreset[] = [
  {
    id: 'short',
    label: '短篇故事',
    subtitle: '适合快速成稿、短篇投稿、小红书/知乎故事',
    targetWords: 30000,
    volumes: 1,
    chaptersPerVolume: 12,
    chapterWordCount: 2500,
    characterCount: 8,
    coreCharacters: '1名主角、1名核心对手、2-3名关键配角、少量功能角色',
    structureHint: '单卷推进，开局快速抛矛盾，中段集中升级，结尾完成反转和收束',
    suitableFor: '新手试写、短篇练笔、单故事线作品',
  },
  {
    id: 'medium',
    label: '中篇小说',
    subtitle: '适合完整人设成长和两到三条支线',
    targetWords: 120000,
    volumes: 2,
    chaptersPerVolume: 30,
    chapterWordCount: 3000,
    characterCount: 15,
    coreCharacters: '1-2名主角、2名核心对手、5-8名重要配角、若干阶段性人物',
    structureHint: '两卷结构：第一卷立人设与主矛盾，第二卷升级冲突并集中回收伏笔',
    suitableFor: '有完整故事想法，但不想写太长的用户',
  },
  {
    id: 'long',
    label: '长篇连载',
    subtitle: '适合平台连载、世界观展开和多卷剧情',
    targetWords: 600000,
    volumes: 5,
    chaptersPerVolume: 60,
    chapterWordCount: 3500,
    characterCount: 30,
    coreCharacters: '1名主角、3-5名长期对手、10-20名重要配角、多组阵营人物',
    structureHint: '多卷推进：每卷解决阶段目标，同时保留主线悬念、阵营变化和能力成长',
    suitableFor: '玄幻、都市、仙侠、科幻等中长线连载',
  },
  {
    id: 'epic',
    label: '超长篇/群像',
    subtitle: '适合复杂世界观、群像人物、长期商业化连载',
    targetWords: 1500000,
    volumes: 8,
    chaptersPerVolume: 80,
    chapterWordCount: 4000,
    characterCount: 50,
    coreCharacters: '主角团、反派阵营、多个势力首领、阶段性强敌和大量功能人物',
    structureHint: '主线、支线、伏笔线并行推进，每卷有独立高潮，同时持续抬高世界规模',
    suitableFor: '大型玄幻、修仙、历史架空、群像权谋',
  },
];

export function getNovelPreset(id?: string): NovelLengthPreset {
  return NOVEL_LENGTH_PRESETS.find(p => p.id === id) || NOVEL_LENGTH_PRESETS[2];
}

export function formatPresetWords(words: number): string {
  if (words >= 10000) return `${Math.round(words / 10000)}万字`;
  return `${words}字`;
}
