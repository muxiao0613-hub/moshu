/**
 * 质量中枢 · 展示基元：评分胶囊、区块卡片与章节选择器（六个视图共用，不含任何取数）。
 *
 * 本文件是 ./lab 的内部实现，对外只由各面板与 ../QualityLab 使用。
 * 依赖方向：@/shared/ui/select、@/shared/types（渲染层，无副作用）。
 */
import type { ReactNode } from 'react';
import { Select } from '@/shared/ui/select';
import type { Chapter } from '@/shared/types';

/** 评分口径：0-100，正向指标越高越好；risk 为反向指标（AI味/一致性风险），越低越好 */
export function ScorePill({ label, value, risk = false }: { label: string; value: number; risk?: boolean }) {
  const good = risk ? value <= 35 : value >= 75;
  const mid = risk ? value <= 60 : value >= 60;
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-3">
      <div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            good
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : mid
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
          }`}
        >
          {risk ? (good ? '风险低' : mid ? '需注意' : '风险高') : good ? '较好' : mid ? '一般' : '偏弱'}
        </span>
      </div>
    </div>
  );
}

/** 各标签页统一的区块外壳：标题 + 可选图标 + 右侧动作区 */
export function SectionCard({
  title,
  icon,
  children,
  right,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
          {icon}
          {title}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** 章节选择器：剧情卡与质量评审共用（评审面板按选中章节读报告） */
export function ChapterSelect({
  chapters,
  value,
  onChange,
}: {
  chapters: Chapter[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onChange={e => onChange(e.target.value)}>
      {chapters.map(ch => (
        <option key={ch.id} value={ch.id}>
          {ch.order}. {ch.title}
        </option>
      ))}
    </Select>
  );
}
