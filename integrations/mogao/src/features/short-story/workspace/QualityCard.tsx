/**
 * 短篇写作台 · 质检报告卡片：总分/评级、五维分项条与改进建议列表。
 *
 * 在拆分中的位置：workspace 的最上层展示叶子组件，被 AiPanel 使用；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 @/shared/types 的报告类型，不依赖 workspace 内其它模块。
 */
import type { ShortStoryQualityReport } from '@/shared/types';

export function QualityCard({ report, color }: { report: ShortStoryQualityReport; color: string }) {
  return (
    <div className="space-y-3 pb-2">
      <p className="text-xs text-zinc-500">{report.coverage}</p>
      <div className="rounded-xl p-4 border text-center" style={{ borderColor: `${color}30`, backgroundColor: `${color}08` }}>
        <span className="text-4xl font-bold"
          style={{ color: report.totalScore >= 75 ? '#16a34a' : report.totalScore >= 55 ? '#d97706' : '#dc2626' }}>
          {report.totalScore}
        </span>
        <p className="text-xs text-zinc-500 mt-1">{report.verdict}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: '开头钩子', value: report.hookScore },
          { label: '故事结构', value: report.structureScore },
          { label: '情绪弧线', value: report.emotionArcScore },
          { label: '结尾共鸣', value: report.endingScore },
          { label: '信息密度', value: report.infoDensityScore },
        ].map(({ label, value }) => {
          const c = value >= 75 ? '#16a34a' : value >= 55 ? '#d97706' : '#dc2626';
          return (
            <div key={label} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-zinc-400">{label}</span>
                <span className="text-sm font-bold" style={{ color: c }}>{value}</span>
              </div>
              <div className="h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: c }} />
              </div>
            </div>
          );
        })}
      </div>
      {report.suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-zinc-500">改进建议</p>
          {report.suggestions.map((s, i) => (
            <div key={i} className="rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}
