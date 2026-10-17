/**
 * AI 批量生成 · 设置区（选择生成内容 / 参数配置 / 分层开关 / 额外指令 / 操作按钮）。
 *
 * 位置：./batch 的展示层，被 AIBatchGenerate.tsx 容器渲染在头部下方；
 * 依赖方向：lucide-react、@/shared/ui（Button/Textarea/Select）、@/shared/lib/utils → ./steps、./useBatchGenerate（仅类型）。
 */
import { AlertTriangle, Check, Loader2, Play, Save, X } from 'lucide-react';

import { CharacterSyncSettings } from '@/features/character/CharacterSyncSettings';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

import { STEPS } from './steps';
import type { useBatchGenerate } from './useBatchGenerate';

type Controller = ReturnType<typeof useBatchGenerate>;

interface BatchConfigPanelProps {
  controller: Controller;
}

export function BatchConfigPanel({ controller }: BatchConfigPanelProps) {
  const {
    instruction, setInstruction,
    mode, setMode,
    charCount, setCharCount,
    chaptersPerVolume, setChaptersPerVolume,
    chapterWordCount, setChapterWordCount,
    layeredMode, setLayeredMode,
    characterSyncPreferences, setCharacterSyncPreferences, existingChars,
    enabled, toggleEnabled,
    project, running,
    anyDone, allSaved,
    handleGenerate, handleStop, handleSaveAll,
  } = controller;

  return (
    <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 space-y-4">
      {/* 生成内容选择 */}
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">选择生成内容</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STEPS.filter(step => step.key !== 'timeline').map(step => (
            <label
              key={step.key}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                enabled[step.key]
                  ? 'border-ink-300 bg-ink-50 dark:border-ink-700 dark:bg-ink-900/20'
                  : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300',
                step.key === 'chapters' && 'col-span-2 sm:col-span-1'
              )}
            >
              <input
                type="checkbox"
                checked={enabled[step.key]}
                onChange={e => toggleEnabled(step.key, e.target.checked)}
                className="accent-ink-600"
              />
              <span className="text-ink-500 dark:text-ink-400 shrink-0">{step.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{step.label}</p>
                <p className="text-xs text-zinc-400 truncate">{step.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 参数配置 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">生成模式</label>
          <Select value={mode} onChange={e => setMode(e.target.value as 'first' | 'continue')} className="h-8 text-sm">
            <option value="first">首次生成</option>
            <option value="continue">续写下一卷</option>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">人物数量</label>
          <Select value={charCount} onChange={e => setCharCount(e.target.value)} className="h-8 text-sm">
            {[10,15,20,30,50,100].map(n => <option key={n} value={n}>{n} 个</option>)}
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">每卷章数</label>
          <Select value={chaptersPerVolume} onChange={e => setChaptersPerVolume(e.target.value)} className="h-8 text-sm">
            {[50,60,70,80,100,120,150,200].map(n => <option key={n} value={n}>{n} 章</option>)}
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-500 block mb-1">每章字数</label>
          <Select value={chapterWordCount} onChange={e => setChapterWordCount(e.target.value)} className="h-8 text-sm">
            {[2000,3000,4000,5000,6000].map(n => <option key={n} value={n}>{n} 字</option>)}
          </Select>
        </div>
      </div>

      {/* 分层生成开关 */}
      <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-2.5 hover:border-ink-300 transition-colors">
        <input
          type="checkbox"
          checked={layeredMode}
          onChange={e => setLayeredMode(e.target.checked)}
          className="mt-0.5 shrink-0"
        />
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            分层生成模式（质量更高）
          </p>
          <p className="text-xs text-zinc-400 mt-0.5">
            先生成剧情骨架（4-6个场景节拍），再据此生成正文，结构更清晰不跑偏。
            每章约消耗 2 倍 token。
          </p>
        </div>
      </label>

      {enabled.chapters && <CharacterSyncSettings characters={existingChars} value={characterSyncPreferences}
        onChange={setCharacterSyncPreferences} disabled={running} />}

      {/* 额外指令 */}
      <div>
        <label className="text-xs font-medium text-zinc-500 block mb-1">额外创作指令（可选）</label>
        <Textarea
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="例如：风格偏轻松，主角是孤儿，世界有三个大陆..."
          rows={2}
          className="text-sm resize-none"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleGenerate}
          disabled={running || !project || !Object.values(enabled).some(Boolean)}
          className="gap-2"
        >
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" />生成中...</>
            : <><Play className="h-4 w-4" />开始生成</>
          }
        </Button>
        {running && (
          <Button variant="outline" onClick={handleStop} className="gap-2">
            <X className="h-4 w-4" />停止
          </Button>
        )}
        {anyDone && !allSaved && (
          <Button variant="outline" onClick={handleSaveAll} className="gap-2 ml-auto">
            <Save className="h-4 w-4" />全部保存到项目
          </Button>
        )}
        {allSaved && anyDone && (
          <span className="ml-auto text-sm text-green-600 flex items-center gap-1">
            <Check className="h-4 w-4" />已全部保存
          </span>
        )}
      </div>

      {enabled.chapters && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle className="h-3.5 w-3.5" />
          章节正文生成较慢，需先在章节列表中创建章节并关联大纲，或生成大纲后手动新建章节
        </p>
      )}
    </div>
  );
}
