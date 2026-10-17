/** 短篇请求归属与采用快照；切换故事/清除任务后旧异步结果不会更新新页面。 */
import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { ShortStory } from '@/shared/types';
import type { TipTapEditor } from './types';
export interface StoryRequestScope {
  id: string; content: string; selection: { from: number; to: number };
  current: () => boolean; check: () => void; checkContent: () => void; append: (text: string) => void;
}
export function useStoryRequests(storyRef: MutableRefObject<ShortStory | undefined>, editor: TipTapEditor, append: (text: string) => void) {
  const epoch = useRef(0);
  const activeStory = useRef(storyRef.current?.id);
  if (activeStory.current !== storyRef.current?.id) { epoch.current++; activeStory.current = storyRef.current?.id; }
  useEffect(() => () => { epoch.current++; }, []);
  const start = (): StoryRequestScope => {
    const ticket = ++epoch.current, id = storyRef.current?.id || '', content = editor?.getHTML() || storyRef.current?.content || '';
    const current = () => epoch.current === ticket && storyRef.current?.id === id;
    const check = () => { if (!current()) throw new Error('已切换故事或取消任务，旧结果未采用'); };
    return { id, content, selection: { from: editor?.state.selection.from || 0, to: editor?.state.selection.to || 0 }, current, check,
      checkContent: () => { check(); if (editor?.getHTML() !== content) throw new Error('正文已改动，请重新生成候选，避免覆盖新稿'); },
      append: text => { if (current()) append(text); } };
  };
  return { start, cancel: () => { epoch.current++; } };
}
