/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 短篇故事的写回动作：新建（含结构模板与目标字数钳制）、编辑、删除、公开、导出 txt。
 *
 * 在拆分中的位置：写回 hook。对外门面是 `features/project/ProjectList.tsx`
 * （门面负责对话框开关与跳转，本文件只改数据）。长篇的写回见 `useProjectActions.ts`。
 * 依赖方向：`@/api` + `@/shared/lib/storyRules`（与 ShortStoryWorkspace 同一份平台/类型配置）
 *           + `./types` →（本文件）→ 门面；不依赖任何 list/ 组件。
 */
import type { MouseEvent } from 'react';
import { saveAs } from 'file-saver';
import { v4 as uuidv4 } from 'uuid';
import { deleteShortStory, saveShortStory, toggleShortStoryPublish } from '@/api';
import { stripHtml } from '@/features/ai/aiService';
import { PLATFORM_CONFIGS, getTemplateForGenre } from '@/shared/lib/storyRules';
import { toast } from '@/shared/ui/toast';
import type { ShortStory } from '@/shared/types';
import type { ShortStorySetter, StoryEditFormValue, StoryFormValue } from './types';

/** 门面可调用的短篇写回动作。 */
export interface StoryActions {
  createStory: (input: StoryFormValue) => Promise<ShortStory>;
  updateStory: (target: ShortStory, input: StoryEditFormValue) => Promise<ShortStory | null>;
  removeStory: (target: ShortStory) => Promise<void>;
  toggleStoryPublish: (e: MouseEvent, story: ShortStory) => Promise<void>;
  exportStory: (e: MouseEvent, story: ShortStory) => Promise<void>;
}

export function useStoryActions({ setShortStories }: { setShortStories: ShortStorySetter }): StoryActions {
  const createStory = async (input: StoryFormValue) => {
    const template = getTemplateForGenre(input.genre);
    const config = PLATFORM_CONFIGS[input.platform];
    const targetWords = Math.min(
      config.wordRange[1],
      Math.max(config.wordRange[0], Number(input.targetWords) || config.defaultWords),
    );
    const saved = await saveShortStory({
      title: input.title.trim() || '无标题故事',
      platform: input.platform,
      genre: input.genre,
      targetWords,
      premise: input.premise.trim(),
      content: '',
      plotPoints: template.points.map((p, i) => ({
        id: uuidv4(), label: p.label, hint: p.hint, content: '', order: i + 1,
      })),
      styleConstraint: '',
      status: 'draft',
      wordCount: 0,
    });
    setShortStories(prev => [...prev, saved]);
    return saved;
  };

  const updateStory = async (target: ShortStory, input: StoryEditFormValue) => {
    if (!input.title.trim()) return null;
    const saved = await saveShortStory({ ...target, ...input, updatedAt: new Date() });
    setShortStories(prev => prev.map(s => s.id === saved.id ? saved : s));
    return saved;
  };

  const removeStory = async (target: ShortStory) => {
    await deleteShortStory(target.id);
    setShortStories(prev => prev.filter(s => s.id !== target.id));
    toast.success('短篇已删除');
  };

  const toggleStoryPublish = async (e: MouseEvent, story: ShortStory) => {
    e.stopPropagation();
    const { isPublic } = await toggleShortStoryPublish(story.id);
    setShortStories(prev => prev.map(s => s.id === story.id ? { ...s, isPublic } : s));
    toast.success(isPublic ? '已公开' : '已取消公开');
  };

  const exportStory = async (e: MouseEvent, story: ShortStory) => {
    e.stopPropagation();
    const full = await (await import('@/api')).getShortStory(story.id);
    if (!full) return;
    const text = `${full.title}\n\n${stripHtml(full.content || '')}`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    await saveAs(blob, `${full.title || '短篇'}.txt`);
  };

  return { createStory, updateStory, removeStory, toggleStoryPublish, exportStory };
}
