/**
 * 个人设置弹窗头部：头像 + 昵称/邮箱 + 角色徽章 + 三个 tab 的导航。
 *
 * 在拆分中的位置：纯展示组件。对外门面是 `shared/layout/UserMenu.tsx`，
 * 身份信息与当前 tab 都由门面注入（门面持有状态，切 tab 不丢表单内容）。
 * 依赖方向：`./menuTheme`、`./roles`、`./types` →（本文件）→ 门面。
 */
import { Bot, Coins, Mail, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { UserMenuTheme } from './menuTheme';
import type { RoleInfo } from './roles';
import type { Tab } from './types';

interface ProfileHeaderProps {
  nickname: string;
  email: string;
  initials: string;
  roleInfo: RoleInfo;
  theme: UserMenuTheme;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
}

/** tab 元数据：图标类型取 `typeof User`，避免为 lucide 图标单独引类型。 */
const TABS: { key: Tab; icon: typeof User; label: string }[] = [
  { key: 'account', icon: User,   label: '账户' },
  { key: 'ai',      icon: Bot,    label: 'AI 配置' },
  { key: 'usage',   icon: Coins,  label: '用量' },
];

export function ProfileHeader({ nickname, email, initials, roleInfo, theme, tab, onTabChange }: ProfileHeaderProps) {
  return (
    <div className="relative px-6 pt-8 pb-6"
      style={{ background: theme.dlgHead }}>
      <div className="flex items-end gap-4">
        <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold shadow-lg"
          style={{
            background: theme.avatar,
            color: theme.avatarText,
            border: `1px solid ${theme.avatarBorder}`,
          }}>
          {initials}
        </div>
        <div className="pb-1">
          <h2 className="text-xl font-bold text-white">{nickname}</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <Mail className="h-3 w-3" style={{ color: theme.emailIcon }} />
            <span className="text-sm" style={{ color: theme.emailText }}>{email}</span>
          </div>
          <span className={cn('inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium', roleInfo.color)}>
            {roleInfo.label}
          </span>
        </div>
      </div>

      {/* Tab 导航 */}
      <div className="flex gap-1 mt-5">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === key
                ? 'bg-white/20 text-white shadow-sm'
                : 'text-ink-300 hover:text-white hover:bg-white/10'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
