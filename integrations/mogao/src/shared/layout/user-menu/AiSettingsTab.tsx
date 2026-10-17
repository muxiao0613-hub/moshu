/**
 * 个人设置 · AI 配置 tab：调用模式（自带 Key / 平台托管）、服务商预设、Key 与模型、测试连接、续写字数。
 *
 * 在拆分中的位置：纯展示组件。对外门面是 `shared/layout/UserMenu.tsx`，
 * 全部状态（含 showKey/testing/testResult）留在门面，本文件只回传 patch 与触发测试。
 * 依赖方向：`./presets`、`./types` + `@/shared/ui/*` →（本文件）→ 门面。
 */
import { Coins, Key } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { PRESETS } from './presets';
import type { AiSettingsState } from './types';

interface AiSettingsTabProps {
  value: AiSettingsState;
  onChange: (patch: Partial<AiSettingsState>) => void;
  isMember: boolean;
  balance: number;
  onTestConnection: () => void;
}

export function AiSettingsTab({ value, onChange, isMember, balance, onTestConnection }: AiSettingsTabProps) {
  const activePreset = PRESETS.find(p => p.baseURL === value.baseURL);

  return (
    <div className="space-y-4">
      {/* 调用模式切换 */}
      <div>
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide block mb-2">调用模式</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!isMember}
            onClick={() => isMember && onChange({ aiMode: 'byok' })}
            title={isMember ? '' : '自带 Key 需开通会员'}
            className={cn(
              'rounded-xl border p-3 text-left transition-all',
              !isMember && 'opacity-50 cursor-not-allowed',
              value.aiMode === 'byok'
                ? 'border-ink-400 bg-ink-50 dark:bg-ink-900/30'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-ink-300'
            )}
          >
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              自带 Key {!isMember && <span className="text-[10px] text-amber-500">（会员）</span>}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">填自己的 Key，免费直连</div>
          </button>
          <button
            type="button"
            onClick={() => onChange({ aiMode: 'managed' })}
            className={cn(
              'rounded-xl border p-3 text-left transition-all',
              value.aiMode === 'managed'
                ? 'border-ink-400 bg-ink-50 dark:bg-ink-900/30'
                : 'border-zinc-200 dark:border-zinc-700 hover:border-ink-300'
            )}
          >
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">平台托管</div>
            <div className="text-xs text-zinc-400 mt-0.5">免配置，按量扣余额</div>
          </button>
        </div>
      </div>

      {/* 托管模式：余额卡片 */}
      {value.aiMode === 'managed' && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/15 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600/80 dark:text-amber-500/80">当前余额</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">¥{(balance ?? 0).toFixed(2)}</p>
            </div>
            <Coins className="h-8 w-8 text-amber-400/60" />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
            托管模式无需填写 Key，调用按 token 实际成本扣费。余额不足时请联系管理员充值。
          </p>
        </div>
      )}

      {/* 自带 Key 模式才显示 Key 配置 */}
      {value.aiMode === 'byok' && (
      <>
      {/* 快速填写预设 */}
      <div>
        <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide block mb-2">快速选择服务商</label>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ baseURL: p.baseURL, model: p.model, testResult: null })}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                value.baseURL === p.baseURL
                  ? 'border-ink-400 bg-ink-50 dark:bg-ink-900/30 text-ink-700 dark:text-ink-300'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-ink-300 hover:text-ink-600'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* API Key */}
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
          <Key className="inline h-3.5 w-3.5 mr-1 text-zinc-400" />API Key
        </label>
        <div className="relative">
          <Input
            type={value.showKey ? 'text' : 'password'}
            value={value.apiKey}
            onChange={e => onChange({ apiKey: e.target.value, testResult: null })}
            placeholder="填写你的 API Key"
            className="pr-16"
          />
          <button
            type="button"
            onClick={() => onChange({ showKey: !value.showKey })}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {value.showKey ? '隐藏' : '显示'}
          </button>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          加密存储于服务器，不会明文保存。
          {activePreset && (
            <a
              href={activePreset.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink-500 hover:text-ink-600 hover:underline ml-0.5"
            >
              前往 {activePreset.label} 获取 Key →
            </a>
          )}
        </p>
      </div>

      {/* Base URL */}
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">API 地址（Base URL）</label>
        <Input
          value={value.baseURL}
          onChange={e => onChange({ baseURL: e.target.value })}
          placeholder="https://api.deepseek.com"
        />
      </div>

      {/* 模型 */}
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">模型名称</label>
        <Input
          value={value.model}
          onChange={e => onChange({ model: e.target.value, testResult: null })}
          placeholder="如 deepseek-v4-flash、qwen-plus"
        />
      </div>

      {/* 测试连接 */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={onTestConnection}
          disabled={value.testing || !value.apiKey}
          className="gap-1.5"
        >
          {value.testing ? '测试中…' : '测试连接'}
        </Button>
        {value.testResult && (
          <p className={cn(
            'text-xs mt-2 px-2.5 py-1.5 rounded-lg',
            value.testResult.ok
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
          )}>
            {value.testResult.ok ? '✓ ' : '✕ '}{value.testResult.msg}
          </p>
        )}
      </div>
      </>
      )}

      {/* 续写字数 */}
      <div>
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">默认续写字数</label>
        <Select value={value.wordCount} onChange={e => onChange({ wordCount: e.target.value })}>
          <option value="500">500 字</option>
          <option value="800">800 字</option>
          <option value="1000">1000 字</option>
          <option value="1500">1500 字</option>
          <option value="2000">2000 字</option>
          <option value="3000">3000 字</option>
          <option value="4000">4000 字</option>
        </Select>
      </div>
    </div>
  );
}
