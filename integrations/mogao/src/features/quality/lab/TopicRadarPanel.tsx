/**
 * 质量中枢 · 题材雷达视图：生成/挑选题材候选，删除不满意的方向。
 *
 * 本文件是 ./lab 的内部实现，渲染「radar」标签页；取数与生成编排见 ./useQualityLab。
 * 依赖方向：./primitives、./utils、./useQualityLab（仅类型）、@/shared/ui/*。
 */
import { Loader2, Radar, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { TabsContent } from '@/shared/ui/tabs';
import { Textarea } from '@/shared/ui/textarea';
import { SectionCard } from './primitives';
import type { QualityLabController } from './useQualityLab';
import { PLATFORM_OPTIONS } from './utils';

export function TopicRadarPanel({ lab }: { lab: QualityLabController }) {
  const {
    platform,
    setPlatform,
    topicCount,
    setTopicCount,
    topicBrief,
    setTopicBrief,
    researchNotes,
    setResearchNotes,
    topics,
    selectedTopicId,
    setSelectedTopicId,
    handleAdoptTopic, handleGenerateTopics,
    handleDeleteTopic,
    loading,
  } = lab;

  return (
    <TabsContent value="radar" className="space-y-4">
      <SectionCard
        title="题材雷达：先生成一批可选方向，再由你挑感兴趣的题材"
        icon={<Radar className="h-4 w-4 text-ink-500" />}
        right={
          <Button onClick={handleGenerateTopics} disabled={!!loading}>
            {loading === 'topics' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成题材候选
          </Button>
        }
      >
        <div className="grid md:grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-zinc-500">目标平台</label>
            <Select value={platform} onChange={e => setPlatform(e.target.value)}>
              {PLATFORM_OPTIONS.map(p => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs text-zinc-500">生成数量</label>
            <Input
              type="number"
              min={4}
              max={30}
              value={topicCount}
              onChange={e => setTopicCount(Number(e.target.value) || 12)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-zinc-500">作者兴趣/约束</label>
            <Input
              value={topicBrief}
              onChange={e => setTopicBrief(e.target.value)}
              placeholder="例如：都市脑洞、强反转、不要无脑系统"
            />
          </div>
        </div>
        <label className="text-xs text-zinc-500">可选：粘贴你自己检索到的平台榜单、征文方向、读者讨论热点</label>
        <Textarea
          value={researchNotes}
          onChange={e => setResearchNotes(e.target.value)}
          rows={4}
          placeholder="没有也可以留空；后续你把全网检索信息粘贴进来，题材会更贴合当前趋势。"
        />
      </SectionCard>

      <div className="grid lg:grid-cols-2 gap-4">
        {topics.map(item => (
          <div
            key={item.id}
            className={`rounded-2xl border p-4 bg-white dark:bg-zinc-800 ${
              selectedTopicId === item.id
                ? 'border-ink-400 ring-2 ring-ink-100 dark:ring-ink-900/40'
                : 'border-zinc-200 dark:border-zinc-700'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <button onClick={() => setSelectedTopicId(item.id)} className="text-left">
                <h3 className="font-semibold text-zinc-950 dark:text-zinc-50">{item.title}</h3>
                <p className="text-sm text-zinc-500 mt-1">{item.oneLineHook}</p>
              </button>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{item.score}分</Badge>
                <button
                  onClick={() => handleDeleteTopic(item.id)}
                  className="p-1 text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <Button size="sm" variant="outline" disabled={!!loading || item.selected} onClick={() => handleAdoptTopic(item.id)}>{item.selected ? '已采用到作品定位与大纲' : '采用题材，更新简介与起步大纲'}</Button>
            <div className="flex flex-wrap gap-1 mb-3">
              {item.platformFit.map(p => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <p>
                <b>主角：</b>
                {item.protagonist}
              </p>
              <p>
                <b>金手指：</b>
                {item.goldenFinger}
              </p>
              <p className="sm:col-span-2">
                <b>主线矛盾：</b>
                {item.mainConflict}
              </p>
              <p className="sm:col-span-2">
                <b>爽点：</b>
                {item.coolPoints.join('；')}
              </p>
              <p className="sm:col-span-2">
                <b>前三章：</b>
                {item.firstThreeChapters.join(' / ')}
              </p>
              <p className="sm:col-span-2">
                <b>长线：</b>
                {item.longTermArc}
              </p>
              <p>
                <b>创新点：</b>
                {item.innovation}
              </p>
              <p>
                <b>风险：</b>
                {item.risk}
              </p>
            </div>
          </div>
        ))}
      </div>
    </TabsContent>
  );
}
