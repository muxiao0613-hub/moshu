/**
 * 质量中枢 · 本地类型：页面 props、加载态键与故事圣经表单形状。
 *
 * 本文件是 ./lab 的内部实现，对外只由 ../QualityLab 页面级组件使用。
 * 依赖方向：（无）。
 */
export interface QualityLabProps {
  projectId: string;
  view?: 'radar' | 'bible' | 'beat' | 'review' | 'facts' | 'antiai';
}

export type LoadingKey = 'topics' | 'bible' | 'beat' | 'review' | 'rewrite' | 'facts' | null;

/**
 * 故事圣经表单：与 StoryBible 的差别只在「能力规则 / 硬性设定锁 / 禁忌」三个数组字段
 * 以一行一条的文本域编辑（见 ./utils 的 linesToArray / arrayToLines）。
 */
export interface BibleForm {
  coreHook: string;
  targetReader: string;
  protagonistDesire: string;
  mainConflict: string;
  powerRules: string;
  hardRules: string;
  tone: string;
  taboo: string;
}
