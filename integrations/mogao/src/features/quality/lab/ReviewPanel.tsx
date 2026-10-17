/**
 * 质量中枢 · 质量评审视图：评分胶囊、问题清单，以及「按报告改稿」的结果与覆盖。
 *
 * 本文件是 ./lab 的内部实现，渲染「review」标签页；评审/改稿编排见 ./useQualityLab。
 * 依赖方向：./primitives、./useQualityLab（仅类型）、@/shared/ui/*、@/shared/types。
 */
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  FilePenLine,
  Flame,
  Loader2,
  Wand2,
} from 'lucide-react';
import { currentReport as validReport } from '@/shared/lib/chapterSources';
import { Button } from '@/shared/ui/button';
import { TabsContent } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import type { QualityReport } from '@/shared/types';
import { ChapterSelect, ScorePill, SectionCard } from './primitives';
import type { QualityLabController } from './useQualityLab';

function QualityReportView({ report }: { report: QualityReport }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-amber-600">{validReport(report) ? report.coverage : '此报告依据已失效或没有版本信息，请重新评审；以下为历史意见。'}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ScorePill label="综合评分" value={report.totalScore} />
        <ScorePill label="钩子" value={report.hookScore} />
        <ScorePill label="冲突" value={report.conflictScore} />
        <ScorePill label="节奏" value={report.pacingScore} />
        <ScorePill label="爽点" value={report.coolPointScore} />
        <ScorePill label="人物" value={report.characterScore} />
        <ScorePill label="原创度" value={report.originalityScore} />
        <ScorePill label="AI味风险" value={report.aiFlavorRisk} risk />
        <ScorePill label="一致性风险" value={report.consistencyRisk} risk />
      </div>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        以下为模型编辑意见，审美建议可以保留不同写法。评分口径：0-100。90-100 优秀 · 75-89 良好 · 60-74 及格 · 40-59 偏弱 · 0-39 严重不足；风险分为反向指标，越低越好。
      </p>
      <div className="rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 p-3">
        <div className="text-xs text-zinc-500 mb-1">总评</div>
        <p className="text-sm leading-6">{report.shortVerdict}</p>
      </div>
      {report.strengths.length > 0 && (
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
            <CheckCircle2 className="h-4 w-4" />
            优点
          </div>
          <ul className="list-disc pl-5 text-sm space-y-1 text-emerald-800 dark:text-emerald-200">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {report.issues.map((issue, idx) => (
          <div
            key={idx}
            className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
              <AlertTriangle className="h-4 w-4" />
              {issue.type}
              <span className="text-xs font-normal text-amber-600 dark:text-amber-400">{issue.location}</span>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <b>问题：</b>
              {issue.problem}
            </p>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mt-1">
              <b>建议：</b>
              {issue.suggestion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReviewPanel({ lab }: { lab: QualityLabController }) {
  const {
    chapters,
    selectedChapterId,
    setSelectedChapterId,
    currentReport,
    selectedChapter,
    rewriteText,
    setRewriteText,
    handleReview,
    handleExtractFacts,
    handleRewrite,
    handleApplyRewrite,
    loading,
  } = lab;

  return (
    <TabsContent value="review" className="space-y-4">
      <SectionCard
        title="章节质量评审：按创作方向检查事实与编辑建议"
        icon={<Flame className="h-4 w-4 text-ink-500" />}
        right={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={handleReview} disabled={!!loading || !selectedChapter}>
              {loading === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
              评审章节
            </Button>
            <Button variant="outline" onClick={handleExtractFacts} disabled={!!loading || !selectedChapter}>
              {loading === 'facts' ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              抽取事实
            </Button>
            <Button onClick={handleRewrite} disabled={!!loading || !validReport(currentReport)}>
              {loading === 'rewrite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              按报告改稿
            </Button>
          </div>
        }
      >
        <div className="max-w-md mb-4">
          <label className="text-xs text-zinc-500">选择章节</label>
          <ChapterSelect chapters={chapters} value={selectedChapterId} onChange={setSelectedChapterId} />
        </div>
        {currentReport ? (
          <QualityReportView report={currentReport} />
        ) : (
          <p className="text-sm text-zinc-500">当前章节还没有质量评审报告。</p>
        )}
      </SectionCard>

      {rewriteText && (
        <SectionCard
          title="改稿结果"
          icon={<FilePenLine className="h-4 w-4 text-ink-500" />}
          right={
            <Button onClick={handleApplyRewrite} disabled={loading === 'rewrite'}>
              <CheckCircle2 className="h-4 w-4" />
              覆盖到当前章节
            </Button>
          }
        >
          <Textarea
            value={rewriteText}
            onChange={e => setRewriteText(e.target.value)}
            rows={16}
            className="font-serif leading-7"
          />
          <p className="text-xs text-zinc-500 mt-2">覆盖前会自动把当前正文保存到章节版本历史中，方便回滚。</p>
        </SectionCard>
      )}
    </TabsContent>
  );
}
