/**
 * 完善台分析 · 各视图共用的公共类型：章节引用的最小形状（列表接口就够，不必拉正文）
 *
 * 本文件是 ./analysis 的内部实现，对外统一由同目录的 index.ts（analysis 门面）导出。
 * 依赖方向：（无）（纯函数，无副作用）。
 */
import type { Chapter } from '@/shared/types';

export type ChapterRef = Pick<Chapter, 'id' | 'order' | 'title'> &
  Partial<Pick<Chapter, 'pacingTag' | 'conflictType' | 'wordCount' | 'content' | 'status'>>;

/** 建议回收的伏笔：埋设满这么多章还没回收就上榜。 */
