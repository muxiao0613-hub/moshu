/**
 * 作品库（ProjectList）拆分出的共享类型。
 *
 * 在拆分中的位置：纯类型叶子。对外门面是 `features/project/ProjectList.tsx`，
 * `list/` 下的 hooks 与表单/网格组件都从这里取类型。
 * 依赖方向：`@/shared/types` →（本文件）→ list/*，本文件不依赖 list/ 内任何模块。
 */
import type { Dispatch, SetStateAction } from 'react';
import type { Project, ShortStory, StoryGenre, StoryPlatform } from '@/shared/types';

/** 作品库的 tab：决定渲染长篇网格还是短篇网格。 */
export type LibraryTab = 'novels' | 'stories';

/** 新建/编辑长篇的表单取值（两个表单字段一致，只有标题与提交文案不同）。 */
export interface NovelFormValue {
  title: string;
  genre: string;
  synopsis: string;
  qualityGoal?: string;
}

/** 新建短篇的表单取值。 */
export interface StoryFormValue {
  title: string;
  platform: StoryPlatform;
  genre: StoryGenre;
  premise: string;
  targetWords: number;
}

/** 编辑短篇的表单取值：编辑面板不提供目标字数。 */
export interface StoryEditFormValue {
  title: string;
  genre: StoryGenre;
  platform: StoryPlatform;
  premise: string;
}

/** 长篇列表的写回入口（由 useProjectLibrary 提供，useProjectActions 消费）。 */
export type ProjectSetter = Dispatch<SetStateAction<Project[]>>;

/** 短篇列表的写回入口（由 useProjectLibrary 提供，useStoryActions 消费）。 */
export type ShortStorySetter = Dispatch<SetStateAction<ShortStory[]>>;
