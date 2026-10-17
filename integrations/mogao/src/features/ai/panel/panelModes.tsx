/**
 * AI 助手面板 · 模式清单与文案派生（纯函数 + 常量，无状态）。
 *
 * 位置：./panel 的静态配置层，被 AIPanel.tsx 容器用于计算模式按钮、输入占位符与按钮文案，
 * 也被 PanelModeSelector 消费。
 * 依赖方向：lucide-react + @/shared/contexts（ModuleContext 类型）→ ./types；不依赖 hook 与展示组件。
 */
import { AlertCircle, PlusCircle, ShieldCheck, Sparkles, Wand2 } from 'lucide-react';

import type { ModuleContext } from '@/shared/contexts/EditorContext';

import type { ModeItem, PanelMode } from './types';

export const MODULE_LABELS: Record<string, string> = {
  chapter: '章节',
  character: '人物档案',
  world: '世界观',
  outline: '大纲',
  thread: '伏笔',
  timeline: '时间线',
};

/** 模式按钮清单；章节类模式依赖当前章节，实体生成依赖模块上下文，全局检查始终可用 */
export function buildModeItems(canChapter: boolean, canEntity: boolean): ModeItem[] {
  return [
    { id: 'continue', icon: <PlusCircle className="h-3.5 w-3.5" />, label: '续写', available: canChapter },
    { id: 'polish', icon: <Wand2 className="h-3.5 w-3.5" />, label: '润色', available: canChapter },
    { id: 'check', icon: <AlertCircle className="h-3.5 w-3.5" />, label: '章节检查', available: canChapter },
    { id: 'generate', icon: <Sparkles className="h-3.5 w-3.5" />, label: 'AI生成', available: canEntity },
    { id: 'global', icon: <ShieldCheck className="h-3.5 w-3.5" />, label: '全局检查', available: true },
  ];
}

/** 输入框占位文案：随模式与编辑上下文变化 */
export function buildPlaceholder(
  mode: PanelMode,
  p: { selectedText: string; moduleCtx: ModuleContext | null }
): string {
  const placeholders: Record<PanelMode, string> = {
    continue: '例如：写主角遭遇埋伏，以少敌多，约800字',
    polish: p.selectedText
      ? `已选 ${p.selectedText.length} 字，输入润色要求（留空则通用优化）`
      : '请先在编辑器中选中文字',
    check: '留空则检查所有方面，或指定检查重点',
    generate: p.moduleCtx
      ? `为「${(p.moduleCtx.entitySnapshot?.name as string) || p.moduleCtx.label}」生成内容，可输入具体要求`
      : '请先在左侧选择要编辑的条目',
    global: '留空则全面检查，或输入重点关注的方向',
  };
  return placeholders[mode];
}

export const GENERATE_BUTTON_LABELS: Record<PanelMode, string> = {
  continue: '开始续写',
  polish: '润色文字',
  check: '检查章节',
  generate: '生成内容',
  global: '全局检查',
};
