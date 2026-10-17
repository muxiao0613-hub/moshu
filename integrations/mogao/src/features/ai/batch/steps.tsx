/**
 * AI 批量生成 · 步骤清单与步骤级展示常量。
 *
 * 位置：./batch 的静态配置层，被 useBatchGenerate（重置 / 保存顺序）与
 * BatchStepList（渲染步骤头）消费；对外仍由 AIBatchGenerate.tsx 容器统一出口。
 * 依赖方向：lucide-react + ./types，不引用 hook 与展示组件，避免环。
 */
import {
  AlertTriangle,
  AlignLeft,
  Bookmark,
  BookOpen,
  Calendar,
  Check,
  Globe,
  Loader2,
  Users,
} from 'lucide-react';

import type { StepKey, StepMeta, StepState, StepStatus } from './types';

export const STEPS: StepMeta[] = [
  { key: 'characters', icon: <Users className="h-4 w-4" />, label: '人物档案', desc: '主角/反派/配角完整档案' },
  { key: 'world', icon: <Globe className="h-4 w-4" />, label: '世界观设定', desc: '地理/体系/势力/历史等' },
  { key: 'outlines', icon: <AlignLeft className="h-4 w-4" />, label: '章节大纲', desc: '卷→章两级完整大纲' },
  { key: 'threads', icon: <Bookmark className="h-4 w-4" />, label: '伏笔线索', desc: '关键伏笔与回收设计' },
  { key: 'timeline', icon: <Calendar className="h-4 w-4" />, label: '时间线', desc: '主要故事事件时间轴' },
  { key: 'chapters', icon: <BookOpen className="h-4 w-4" />, label: '章节正文', desc: '逐章生成完整正文（较慢）' },
];

/** 步骤的标准顺序（重置与「全部保存」都按它与 STEPS 对齐） */
export const STEP_KEYS: StepKey[] = STEPS.map(s => s.key);

export function makeInitialStep(): StepState {
  return { status: 'idle', rawText: '', data: [], selected: new Set(), saved: false };
}

export function makeInitialSteps(): Record<StepKey, StepState> {
  return {
    characters: makeInitialStep(),
    world: makeInitialStep(),
    outlines: makeInitialStep(),
    threads: makeInitialStep(),
    timeline: makeInitialStep(),
    chapters: makeInitialStep(),
  };
}

export function statusIcon(s: StepStatus) {
  if (s === 'running') return <Loader2 className="h-4 w-4 animate-spin text-ink-500" />;
  if (s === 'done') return <Check className="h-4 w-4 text-green-500" />;
  if (s === 'error') return <AlertTriangle className="h-4 w-4 text-red-500" />;
  return <div className="h-4 w-4 rounded-full border-2 border-zinc-300" />;
}
