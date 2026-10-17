/**
 * 短篇写作台门面：`/short/:id` 路由的页面入口。
 *
 * 在重构中的位置：`client/src/features/short-story/ShortStoryWorkspace.tsx` 原先是一个 1221 行的单体组件，
 * 已等价搬迁到 `features/short-story/workspace/`（视图组合根 `StoryWorkspaceView.tsx`、编辑/生成两个
 * hook、四个面板、导出与工具模块）。本文件只做转发，保证 `App.tsx` 的既有导入路径不变。
 * 依赖方向：`./workspace/*` →（本文件）→ App.tsx。
 */
export { ShortStoryWorkspace } from './workspace/StoryWorkspaceView';
