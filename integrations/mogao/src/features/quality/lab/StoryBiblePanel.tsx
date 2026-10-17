/**
 * 质量中枢 · 故事圣经视图：八个字段的编辑表单（AI 生成 / 手工保存）。
 *
 * 本文件是 ./lab 的内部实现，渲染「bible」标签页；取数与生成编排见 ./useQualityLab。
 * 依赖方向：./primitives、./useQualityLab（仅类型）、@/shared/ui/*。
 */
import { BookOpenCheck, Loader2, Save, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { workRefinePath } from '@/shared/lib/workRoutes';
import { Button } from '@/shared/ui/button';
import { TabsContent } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import { SectionCard } from './primitives';
import type { BibleForm } from './types';
import type { QualityLabController } from './useQualityLab';

export function StoryBiblePanel({ lab }: { lab: QualityLabController }) {
  const { bibleForm, setBibleForm, handleGenerateBible, handleSaveBible, loading } = lab;

  return (
    <TabsContent value="bible" className="space-y-4">
      <SectionCard
        title="故事圣经：锁定核心设定，减少后续AI幻觉"
        icon={<BookOpenCheck className="h-4 w-4 text-ink-500" />}
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleGenerateBible} disabled={!!loading}>
              {loading === 'bible' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              AI生成
            </Button>
            <Button onClick={handleSaveBible} disabled={!!loading}>
              <Save className="h-4 w-4" />
              保存
            </Button>
          </div>
        }
      >
        <p className="text-xs text-zinc-500 mb-3">从零构思可先去 <Link className="text-ink-600 underline" to={workRefinePath(lab.project?.id || '', 'radar')}>题材策划</Link>，采用后再生成圣经；这里保存的规则会进入后续写作。</p>
        <div className="grid md:grid-cols-2 gap-3">
          {(
            [
              ['核心卖点', 'coreHook'],
              ['目标读者', 'targetReader'],
              ['主角核心欲望', 'protagonistDesire'],
              ['主线矛盾', 'mainConflict'],
              ['能力规则/金手指边界（一行一条）', 'powerRules'],
              ['硬性设定锁（一行一条）', 'hardRules'],
              ['文风基调', 'tone'],
              ['禁忌/不要写（一行一条）', 'taboo'],
            ] as [string, keyof BibleForm][]
          ).map(([label, key]) => (
            <div key={key}>
              <label className="text-xs text-zinc-500">{label}</label>
              <Textarea
                rows={key === 'powerRules' || key === 'hardRules' ? 5 : 3}
                value={bibleForm[key]}
                onChange={e => setBibleForm(f => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </SectionCard>
    </TabsContent>
  );
}
