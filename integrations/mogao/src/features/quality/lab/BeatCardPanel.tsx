/**
 * 质量中枢 · 章节剧情卡视图：显示某章的 beat card（目标/冲突/爽点/钩子等 11 项）。
 *
 * 本文件是 ./lab 的内部实现，渲染「beat」标签页；生成与保存编排见 ./useQualityLab。
 * 依赖方向：./primitives、./useQualityLab（仅类型）、@/shared/ui/*、@/shared/types。
 */
import { ClipboardCheck, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TabsContent } from '@/shared/ui/tabs';
import type { ChapterBeatCard } from '@/shared/types';
import { ChapterSelect, SectionCard } from './primitives';
import type { QualityLabController } from './useQualityLab';

function BeatCardView({ card }: { card: ChapterBeatCard }) {
  const rows = [
    ['本章目标', card.goal],
    ['本章冲突', card.conflict],
    ['爽点/爆点', card.coolPoint],
    ['情绪点', card.emotionPoint],
    ['反转', card.reversal],
    ['章末钩子', card.hookEnding],
    ['人物变化', card.characterChange],
    ['埋设伏笔', card.foreshadowing.join('；')],
    ['回收伏笔', card.payoff.join('；')],
    ['必须包含', card.mustInclude.join('；')],
    ['必须避免', card.mustAvoid.join('；')],
  ];
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-700 p-3"
        >
          <div className="text-xs text-zinc-500 mb-1">{k}</div>
          <p className="text-sm text-zinc-800 dark:text-zinc-200 leading-6">{v || '—'}</p>
        </div>
      ))}
    </div>
  );
}

export function BeatCardPanel({ lab }: { lab: QualityLabController }) {
  const {
    chapters,
    selectedChapterId,
    setSelectedChapterId,
    beatInstruction,
    setBeatInstruction,
    currentBeatCard,
    handleGenerateBeat,
    selectedChapter,
    loading,
  } = lab;

  return (
    <TabsContent value="beat" className="space-y-4">
      <SectionCard
        title="章节剧情卡：每章先明确目标、冲突、爽点和钩子"
        icon={<ClipboardCheck className="h-4 w-4 text-ink-500" />}
        right={
          <Button onClick={handleGenerateBeat} disabled={!!loading || !selectedChapter}>
            {loading === 'beat' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            生成剧情卡
          </Button>
        }
      >
        <div className="grid md:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-xs text-zinc-500">选择章节</label>
            <ChapterSelect chapters={chapters} value={selectedChapterId} onChange={setSelectedChapterId} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-zinc-500">额外要求</label>
            <Input
              value={beatInstruction}
              onChange={e => setBeatInstruction(e.target.value)}
              placeholder="例如：本章要强化打脸爽点，结尾留下反转"
            />
          </div>
        </div>
        {currentBeatCard ? (
          <BeatCardView card={currentBeatCard} />
        ) : (
          <p className="text-sm text-zinc-500">当前章节还没有剧情卡。</p>
        )}
      </SectionCard>
    </TabsContent>
  );
}
