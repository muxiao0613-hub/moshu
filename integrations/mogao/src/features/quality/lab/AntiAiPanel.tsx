/**
 * 质量中枢 · 去AI化检测视图：纯规则扫描（不调用 AI），逐条列出命中的 AI 味模式。
 *
 * 本文件是 ./lab 的内部实现，渲染「antiai」标签页；扫描只读 chapter.content，
 * 因此不需要 hook 参与编排（detectAntiAiPatterns 是 shared/lib 里的纯函数）。
 * 依赖方向：./primitives、./useQualityLab（仅类型）、@/shared/lib/antiAiDetector、@/shared/ui/*。
 */
import { Bot, CheckCircle2, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { TabsContent } from '@/shared/ui/tabs';
import { detectAntiAiPatterns } from '@/shared/lib/antiAiDetector';
import { SectionCard } from './primitives';
import type { QualityLabController } from './useQualityLab';

export function AntiAiPanel({ lab }: { lab: QualityLabController }) {
  const { chapters, antiAiChapterId, setAntiAiChapterId, antiAiReport, setAntiAiReport } = lab;

  return (
    <TabsContent value="antiai" className="space-y-4">
      <SectionCard
        title="表达模式扫描：规则命中仅供编辑参考"
        icon={<Bot className="h-4 w-4 text-ink-500" />}
        right={
          <Button
            onClick={() => {
              const ch = chapters.find(c => c.id === antiAiChapterId);
              if (ch) setAntiAiReport(detectAntiAiPatterns(ch.content));
            }}
            disabled={!antiAiChapterId}
          >
            <RefreshCw className="h-4 w-4" />
            扫描章节
          </Button>
        }
      >
        <div className="mb-4 max-w-md">
          <label className="text-xs text-zinc-500">选择章节</label>
          <Select
            value={antiAiChapterId}
            onChange={e => {
              setAntiAiChapterId(e.target.value);
              setAntiAiReport(null);
            }}
          >
            {chapters.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.order}. {ch.title}
              </option>
            ))}
          </Select>
        </div>
        {antiAiReport ? (
          <div className="space-y-4">
            {/* 总评 */}
            <div
              className={`rounded-xl p-4 border ${
                antiAiReport.totalScore === 0
                  ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20'
                  : antiAiReport.totalScore <= 30
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20'
                    : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <span
                  className={`text-3xl font-bold ${
                    antiAiReport.totalScore === 0
                      ? 'text-emerald-600'
                      : antiAiReport.totalScore <= 30
                        ? 'text-amber-600'
                        : 'text-red-600'
                  }`}
                >
                  {antiAiReport.totalScore}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    AI味指数（0=自然，100=AI感极重）
                  </p>
                  <p className="text-xs text-zinc-500">
                    {antiAiReport.verdict} · 样本{Math.round(antiAiReport.charCount / 1000)}K字
                  </p>
                </div>
              </div>
            </div>
            {/* 各项问题 */}
            {antiAiReport.issues.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/20 p-4 flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm">未命中当前规则；这不能证明文本来源或质量。</span>
              </div>
            ) : (
              <div className="space-y-3">
                {antiAiReport.issues.map(issue => (
                  <div
                    key={issue.id}
                    className={`rounded-xl border p-4 ${
                      issue.severity === 'high'
                        ? 'border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20'
                        : issue.severity === 'medium'
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/20'
                          : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          issue.severity === 'high'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : issue.severity === 'medium'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {issue.severity === 'high' ? '高' : issue.severity === 'medium' ? '中' : '低'}
                      </span>
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{issue.type}</span>
                      <span className="text-xs text-zinc-400">{issue.label}</span>
                      <span className="ml-auto text-xs text-zinc-500">
                        {issue.count}次 · {issue.density}
                      </span>
                    </div>
                    {issue.examples.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {issue.examples.map((ex, i) => (
                          <span
                            key={i}
                            className="text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded px-2 py-0.5 text-zinc-600 dark:text-zinc-300"
                          >
                            {ex}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">
                      <span className="font-medium">改写建议：</span>
                      {issue.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-400 text-center py-8">选择章节后点击「扫描章节」，无需调用 AI，即时出结果。</p>
        )}
      </SectionCard>
    </TabsContent>
  );
}
