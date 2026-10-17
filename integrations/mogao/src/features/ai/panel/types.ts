/**
 * AI 助手面板 · 模式、props 与修复对话框的类型底座。
 *
 * 位置：./panel 的最底层，panelModes（模式清单）、各 hook 与展示组件都从这里取类型；
 * 对外仍由 AIPanel.tsx 容器统一出口。
 * 依赖方向：react（类型）+ ../ModuleFixDialog（EntityFix 类型）；不引用本目录其它模块，避免环。
 */
import type { ReactNode } from 'react';

import type { EntityFix } from '../ModuleFixDialog';

export type PanelMode =
  | 'continue'   // 章节续写
  | 'polish'     // 润色
  | 'check'      // 章节检查
  | 'generate'   // 实体生成
  | 'global';    // 全局一致性

export interface AIPanelProps {
  projectId: string;
}

/** 修复对话框里实体 / 修复项的最小形状（只需 id 索引能力） */
export interface EntityLike {
  id: string;
  [k: string]: unknown;
}

export interface ModeItem {
  id: PanelMode;
  icon: ReactNode;
  label: string;
  available: boolean;
}

/** ModuleFixDialog 的打开状态（不含 onClose，关闭由 hook 决定） */
export interface FixDialogState {
  title: string;
  fixes: EntityFix[];
  entities: EntityLike[];
  fieldLabels: Record<string, string>;
  onApply: (selected: EntityFix[]) => Promise<void>;
}
