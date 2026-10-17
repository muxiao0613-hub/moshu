/**
 * 用户菜单（个人设置弹窗）拆分出的共享类型。
 *
 * 在拆分中的位置：纯类型叶子。对外门面是 `shared/layout/UserMenu.tsx`，
 * `user-menu/` 下的 tab 组件与主题都从这里取类型。
 * 依赖方向：（本文件）→ user-menu/*，不依赖任何其它 user-menu 模块。
 */

/** 个人设置弹窗的三个 tab。 */
export type Tab = 'account' | 'ai' | 'usage';

/** 修改密码子表单的状态（留在门面，切换 tab 时不丢失已输入内容）。 */
export interface PwdState {
  open: boolean;
  oldPwd: string;
  newPwd: string;
  confirmPwd: string;
  saving: boolean;
}

/** AI 配置 tab 的全部状态（showKey / testing / testResult 是纯展示态，但同样留在门面）。 */
export interface AiSettingsState {
  apiKey: string;
  baseURL: string;
  model: string;
  aiMode: 'byok' | 'managed';
  wordCount: string;
  showKey: boolean;
  testing: boolean;
  testResult: { ok: boolean; msg: string } | null;
}
