/**
 * 个人设置 · 账户 tab：邮箱（只读）、昵称输入、修改密码子表单。
 *
 * 在拆分中的位置：纯展示组件。对外门面是 `shared/layout/UserMenu.tsx`，
 * 表单状态与提交动作（含调接口改密码）都留在门面，切 tab 不丢已输入内容。
 * 依赖方向：`./types` + `@/shared/ui/*` →（本文件）→ 门面。
 */
import { AtSign, Key } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import type { PwdState } from './types';

interface AccountTabProps {
  email: string;
  nickname: string;
  onNicknameChange: (value: string) => void;
  pwd: PwdState;
  onChangePwd: (patch: Partial<PwdState>) => void;
  onSubmitPwd: () => void;
}

export function AccountTab({ email, nickname, onNicknameChange, pwd, onChangePwd, onSubmitPwd }: AccountTabProps) {
  return (
    <div className="space-y-4">
      {/* 邮箱（只读展示） */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-4">
        <div className="flex items-center gap-2 mb-1">
          <AtSign className="h-3.5 w-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">邮箱</span>
        </div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mt-1">{email}</p>
        <p className="text-xs text-zinc-400 mt-0.5">邮箱不可修改</p>
      </div>

      {/* 昵称 */}
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          昵称
        </label>
        <Input
          value={nickname}
          onChange={e => onNicknameChange(e.target.value)}
          placeholder="输入新昵称"
          maxLength={20}
        />
        <p className="text-xs text-zinc-400 mt-1">{nickname.length} / 20</p>
      </div>

      {/* 修改密码 */}
      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
        {!pwd.open ? (
          <button onClick={() => onChangePwd({ open: true })}
            className="flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-400 hover:underline">
            <Key className="h-3.5 w-3.5" />修改密码
          </button>
        ) : (
          <div className="space-y-2.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block">修改密码</label>
            <Input type="password" value={pwd.oldPwd} onChange={e => onChangePwd({ oldPwd: e.target.value })} placeholder="原密码" />
            <Input type="password" value={pwd.newPwd} onChange={e => onChangePwd({ newPwd: e.target.value })} placeholder="新密码（至少 6 位）" />
            <Input type="password" value={pwd.confirmPwd} onChange={e => onChangePwd({ confirmPwd: e.target.value })} placeholder="确认新密码" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onChangePwd({ open: false, oldPwd: '', newPwd: '', confirmPwd: '' })}>取消</Button>
              <Button size="sm" onClick={onSubmitPwd} disabled={pwd.saving}>{pwd.saving ? '提交中…' : '确认修改'}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
