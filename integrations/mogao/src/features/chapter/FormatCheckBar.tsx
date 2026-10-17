import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Info, ShieldCheck } from 'lucide-react';
import type { StoryPlatform } from '@/shared/types';
import { PLATFORM_CONFIGS, checkPlatformFormat } from '@/shared/lib/storyRules';
import { fallbackPlatform, loadFormatPlatform, saveFormatPlatform } from './formatPrefs';
import { countWords } from './api';

/**
 * 写作台底部的「格式体检条」。
 *
 * 规则层原样复用短篇的 checkPlatformFormat（REFACTOR_PLAN.md §6.2 的资产 3）：
 * 短篇不再有独立编辑器，但那套「平台字数 / 开篇钩子 / 细节密度 / 抽象 vs 动作 / 结尾回收」
 * 的零成本正则体检对长篇章节同样有效，所以搬进写作台，实时显示。
 *
 * 这里不调 AI、不发请求：全部是本地正则，纯提示。
 * 平台选择会同时写进 formatPrefs，生成链路（批量生成 / 排场景）读同一份偏好，
 * 所以「选平台」不只是换个提示条，模型收到的约束也跟着变。
 */

const PLATFORM_KEYS = Object.keys(PLATFORM_CONFIGS) as StoryPlatform[];

export function FormatCheckBar({
  projectId,
  content,
  projectPlatform,
}: {
  projectId: string;
  /** 编辑器当前正文（HTML） */
  content: string;
  /** 作品的目标平台，落在已知平台时作为默认值 */
  projectPlatform?: string;
}) {
  const fallback: StoryPlatform = fallbackPlatform(projectPlatform);

  const [platform, setPlatform] = useState<StoryPlatform>(() => loadFormatPlatform(projectId) || fallback);
  const [text, setText] = useState(content);
  const [expanded, setExpanded] = useState(false);

  // 防抖 600ms：体检要扫全文，不能每敲一个字都跑一遍
  useEffect(() => {
    const t = setTimeout(() => setText(content), 600);
    return () => clearTimeout(t);
  }, [content]);

  useEffect(() => {
    setPlatform(loadFormatPlatform(projectId) || fallback);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePlatform = (value: StoryPlatform) => {
    setPlatform(value);
    saveFormatPlatform(projectId, value);
  };

  const issues = useMemo(() => {
    const wc = countWords(text);
    return checkPlatformFormat(text, platform, wc);
  }, [text, platform]);

  const config = PLATFORM_CONFIGS[platform];
  const plainCount = useMemo(() => countWords(text), [text]);
  const warnings = issues.filter(i => i.type !== 'ok').length;

  const tone = (type: string) =>
    type === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : type === 'error'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-amber-600 dark:text-amber-400';

  return (
    <div className="px-3 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 shrink-0">
      <div className="flex items-center gap-2 text-[11px]">
        <ShieldCheck className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <span className="text-zinc-500 dark:text-zinc-400 shrink-0">格式体检</span>
        <select
          value={platform}
          onChange={e => changePlatform(e.target.value as StoryPlatform)}
          className="h-6 text-[11px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-1 cursor-pointer shrink-0"
          title="按哪个平台的格式规则体检（保存在本机，按作品隔离）"
        >
          {PLATFORM_KEYS.map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        {platform !== '自由创作' && (
          <span className="text-zinc-400 shrink-0 tabular-nums">
            {config.wordRange[0]}-{config.wordRange[1]} 字 · 当前 {plainCount} 字
          </span>
        )}

        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-x-auto">
          {issues.length === 0 && (
            <span className="text-zinc-400 truncate flex items-center gap-1">
              <Info className="h-3 w-3 shrink-0" />
              自由创作：不套用平台格式规则
            </span>
          )}
          {issues.map((issue, i) => (
            <span key={i} className={`flex items-center gap-1 shrink-0 ${tone(issue.type)}`} title={issue.detail}>
              {issue.type === 'ok' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {issue.label}
            </span>
          ))}
        </div>

        {warnings > 0 && (
          <span className="text-amber-600 dark:text-amber-400 shrink-0 tabular-nums">{warnings} 项待改</span>
        )}
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
          title={expanded ? '收起说明' : '展开每条说明与该平台的写作规则'}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          说明
        </button>
      </div>

      {expanded && (
        <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          <div className="space-y-0.5">
            {issues.map((issue, i) => (
              <div key={i} className={tone(issue.type)}>
                <span className="font-medium">{issue.label}：</span>
                <span className="text-zinc-500 dark:text-zinc-400">{issue.detail}</span>
              </div>
            ))}
            {issues.length === 0 && (
              <div className="text-zinc-400">自由创作不套用平台规则；可在左侧切换到具体平台查看体检结果。</div>
            )}
          </div>
          <div className="space-y-0.5">
            <div className="text-zinc-400">该平台写作规则</div>
            {config.rules.length === 0 && <div className="text-zinc-400">无</div>}
            {config.rules.map((r, i) => (
              <div key={i} className="text-zinc-500 dark:text-zinc-400">· {r}</div>
            ))}
            {config.forbidden.length > 0 && (
              <div className="text-zinc-500 dark:text-zinc-400">避免：{config.forbidden.join('、')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
