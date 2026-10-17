/**
 * 用户角色口径：角色徽章文案/配色，以及从 AuthUser 推出主角色的纯判断。
 *
 * 在拆分中的位置：纯函数 + 常量，对外门面是 `shared/layout/UserMenu.tsx`，
 * 门面把结果传给 `ProfileHeader`（弹窗头部徽章）与下拉菜单头部。
 * 依赖方向：`@/features/auth/AuthContext`（AuthUser 类型）→（本文件）→ 门面/ProfileHeader。
 */
import type { AuthUser } from '@/features/auth/AuthContext';

/** 角色徽章的文案与配色。 */
export const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: '超级管理员', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  admin: { label: '管理员', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  member: { label: '会员', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  user:  { label: '普通用户', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300' },
};

export interface RoleInfo {
  label: string;
  color: string;
}

/** 优先展示员工角色，否则按会员状态。 */
export function resolveUserRole(user: AuthUser): RoleInfo {
  const primaryRole = user.roles?.includes('super_admin') ? 'super_admin'
    : user.roles?.includes('admin') ? 'admin'
    : user.isMember ? 'member' : 'user';
  return ROLE_LABELS[primaryRole] ?? ROLE_LABELS.user;
}

/** 头像文字：昵称（没有则邮箱）的前两位。 */
export function initialsOf(user: AuthUser): string {
  return (user.nickname || user.email).slice(0, 2).toUpperCase();
}
