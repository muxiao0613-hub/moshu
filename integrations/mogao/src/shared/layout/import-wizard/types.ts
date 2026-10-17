/**
 * 导入向导拆分出的共享类型。
 *
 * 在拆分中的位置：纯类型叶子。对外门面是 `shared/layout/ImportWizard.tsx`，
 * `import-wizard/` 下的解析器、落库器与步骤组件都从这里取类型。
 * 依赖方向：`@/shared/types` →（本文件）→ import-wizard/*。
 */
import type { Character } from '@/shared/types';

/** 导入向导的四个步骤。 */
export type Step = 'upload' | 'preview' | 'extract' | 'done';

/** 用于 AI 提取的类型（简化版：字段与人物/世界观实体对齐）。 */
export interface ExtractedMeta {
  characters: Array<{ name: string; role: Character['role']; personality: string; background: string }>;
  worldSettings: Array<{ category: string; title: string; content: string }>;
  outlineSummary: string;
}
