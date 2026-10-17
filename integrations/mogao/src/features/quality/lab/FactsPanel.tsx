/**
 * 质量中枢 · 事实账本视图：列出已抽取的事实，支持逐条删除。
 *
 * 本文件是 ./lab 的内部实现，渲染「facts」标签页；抽取与删除编排见 ./useQualityLab。
 * 依赖方向：./primitives、./useQualityLab（仅类型）、@/shared/ui/*。
 */
import { DatabaseZap, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { TabsContent } from '@/shared/ui/tabs';
import { SectionCard } from './primitives';
import type { QualityLabController } from './useQualityLab';

export function FactsPanel({ lab }: { lab: QualityLabController }) {
  const { facts, handleDeleteFact, handleConfirmFact, loading } = lab;

  return (
    <TabsContent value="facts" className="space-y-4">
      <SectionCard
        title="事实账本：后文生成时不可随意推翻的动态记忆"
        icon={<DatabaseZap className="h-4 w-4 text-ink-500" />}
      >
        {facts.length === 0 ? (
          <p className="text-sm text-zinc-500">暂无事实。可在「质量评审」里选择章节后点击"抽取事实"。</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {facts.map(f => (
              <div
                key={f.id}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">{f.type}</Badge>
                    <Badge variant={f.importance === 'critical' ? 'default' : 'outline'}>{f.importance}</Badge>
                    <Badge variant="outline">{f.status === 'confirmed' ? '已确认' : f.status === 'stale' ? '正文已更新·待重提取' : '待确认'}</Badge>
                  </div>
                  <button onClick={() => handleDeleteFact(f.id)} className="text-zinc-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{f.subject}</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">{f.fact}</p>
                {f.quote && <blockquote className="text-xs text-zinc-500 border-l-2 pl-2 mt-2">依据：{f.quote}</blockquote>}
                {f.status === 'pending' && f.sourceHash && <Button size="sm" disabled={!!loading} onClick={() => handleConfirmFact(f)}>确认用于后续写作</Button>}
                {!f.sourceHash && <p className="text-xs text-amber-600">旧事实未核验，请从来源章重新提取。</p>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </TabsContent>
  );
}
