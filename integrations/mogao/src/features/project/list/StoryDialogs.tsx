/**
 * 短篇故事的新建/编辑表单弹窗。
 *
 * 在拆分中的位置：受控表单组件，对外门面是 `features/project/ProjectList.tsx`
 * （门面持有表单状态与提交动作，弹窗只负责渲染与回传 patch）。
 * 依赖方向：`./constants`（平台/类型/示例选项）+ `@/shared/lib/storyRules`
 *           （平台字数与色调提示，与 ShortStoryWorkspace 同一份配置）→（本文件）→ 门面。
 */
import { Feather, Sparkles } from 'lucide-react';
import { GENRE_CONFIGS, PLATFORM_CONFIGS } from '@/shared/lib/storyRules';
import type { StoryGenre, StoryPlatform } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { PREMISE_EXAMPLES, SHORT_STORY_GENRES, SHORT_STORY_PLATFORMS } from './constants';
import type { StoryEditFormValue, StoryFormValue } from './types';

interface CreateStoryDialogProps {
  open: boolean;
  onClose: () => void;
  value: StoryFormValue;
  onChange: (patch: Partial<StoryFormValue>) => void;
  onSubmit: () => void;
}

export function CreateStoryDialog({ open, onClose, value, onChange, onSubmit }: CreateStoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Feather className="h-5 w-5 text-rose-500" />新建短篇故事
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">故事标题（可留空）</label>
            <Input
              value={value.title}
              onChange={e => onChange({ title: e.target.value })}
              placeholder="无标题故事"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">目标平台</label>
              <Select value={value.platform} onChange={e => {
                const platform = e.target.value as StoryPlatform;
                onChange({ platform, targetWords: PLATFORM_CONFIGS[platform].defaultWords });
              }}>
                {SHORT_STORY_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">故事类型</label>
              <Select value={value.genre} onChange={e => onChange({ genre: e.target.value as StoryGenre })}>
                {SHORT_STORY_GENRES.map(g => <option key={g} value={g}>{GENRE_CONFIGS[g as StoryGenre].emoji} {g}</option>)}
              </Select>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-100 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
            <span className="font-medium" style={{ color: PLATFORM_CONFIGS[value.platform].color }}>{value.platform}</span>
            {' · '}推荐 {PLATFORM_CONFIGS[value.platform].defaultWords} 字
            {' · '}建议范围 {PLATFORM_CONFIGS[value.platform].wordRange[0]}-{PLATFORM_CONFIGS[value.platform].wordRange[1]} 字
            {' · '}{PLATFORM_CONFIGS[value.platform].tone}
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">目标字数</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={PLATFORM_CONFIGS[value.platform].wordRange[0]}
                max={PLATFORM_CONFIGS[value.platform].wordRange[1]}
                step={100}
                value={value.targetWords}
                onChange={e => onChange({ targetWords: Number(e.target.value) || PLATFORM_CONFIGS[value.platform].defaultWords })}
              />
              <button type="button"
                onClick={() => onChange({ targetWords: PLATFORM_CONFIGS[value.platform].defaultWords })}
                className="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-500 hover:text-rose-500">
                用推荐值
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">新手建议用推荐值：太短容易像梗概，太长更容易生成不完整。后续可在正文中继续扩写。</p>
          </div>
          <div className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
            <div className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-300 mb-1">
              <Sparkles className="h-3.5 w-3.5" />推荐流程
            </div>
            <p className="leading-relaxed">填写一句故事想法即可，这句话会被锁定为最高优先级。创建后进入工作台，点击「一键自动成稿」，系统会自动按这句话补强内核 → 生成骨架 → 生成开头 → 写出全文，不会根据标题另起炉灶。</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">核心一句话（优先级高于标题）</label>
              <button type="button" onClick={() => onChange({ premise: PREMISE_EXAMPLES[value.genre][0] })} className="text-xs text-rose-500 hover:text-rose-600">不会写？填入示例</button>
            </div>
            <Textarea
              value={value.premise}
              onChange={e => onChange({ premise: e.target.value })}
              placeholder="一句话写出故事核心，如：离婚当天，我发现老公的书柜里藏着另一个家的钥匙..."
              rows={2}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">后续 AI 会严格围绕这句话创作；标题只负责命名，不会覆盖故事核心。</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PREMISE_EXAMPLES[value.genre].map((ex, idx) => (
                <button key={idx} type="button" onClick={() => onChange({ premise: ex })}
                  className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-500 dark:text-zinc-400 hover:border-rose-300 hover:text-rose-500 max-w-full truncate">
                  示例 {idx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit} className="bg-rose-600 hover:bg-rose-500 gap-1.5">
            <Feather className="h-4 w-4" />开始创作
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditStoryDialogProps {
  open: boolean;
  onClose: () => void;
  value: StoryEditFormValue;
  onChange: (patch: Partial<StoryEditFormValue>) => void;
  onSubmit: () => void;
}

export function EditStoryDialog({ open, onClose, value, onChange, onSubmit }: EditStoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent onClose={onClose} className="max-w-md">
        <DialogHeader><DialogTitle>编辑短篇信息</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">标题</label>
            <Input value={value.title} onChange={e => onChange({ title: e.target.value })} placeholder="短篇标题" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">目标平台</label>
              <Select value={value.platform} onChange={e => onChange({ platform: e.target.value as StoryPlatform })}>
                {SHORT_STORY_PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">故事类型</label>
              <Select value={value.genre} onChange={e => onChange({ genre: e.target.value as StoryGenre })}>
                {SHORT_STORY_GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300 block mb-1">核心一句话</label>
            <Textarea value={value.premise} onChange={e => onChange({ premise: e.target.value })} rows={2} placeholder="故事核心一句话" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit} disabled={!value.title.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
