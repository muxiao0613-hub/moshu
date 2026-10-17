import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Layers, Wand2, RefreshCw, ChevronDown, ChevronRight, ArrowDownToLine, X } from 'lucide-react';
import {
  getChapter, getProject, getCharacters, getWorldSettings, getOutlines, getChapters,
  getStoryBible, getFactLedger, saveChapterVersion, saveChapter, saveChapterBeatCard, countWords,
} from '@/api';
import { regenerateScene, planChapterWithScenes } from '@/features/ai/aiService';
import { assembleSceneContent, sceneWrittenCount } from '@/features/ai/scenePlan';
import { characterSyncReportText, synchronizeChapter } from '@/features/chapter/writeback';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import { chapterHandoff } from '@/shared/lib/chapterSources';
import { flushProjectDrafts } from '@/shared/lib/draftFlush';
import { STRUCTURE_TEMPLATES, getTemplateForGenre } from '@/shared/lib/storyRules';
import { cn } from '@/shared/lib/utils';
import type {
  Chapter, Project, Character, WorldSetting, Outline, SceneCard, ChapterBeatCard,
  StoryBible, FactLedger,
} from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { platformOverride } from './formatPrefs';

interface SceneBarProps {
  projectId: string;
  chapter: Chapter;
  /** 正文被本组件改写（重组/重写）后回传给编辑器 */
  onChapterChange?: (chapter: Chapter) => void;
}

const TENSION_STYLE: Record<string, string> = {
  高: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
  中: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
  低: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-300',
};
const PACE_STYLE: Record<string, string> = {
  快: 'text-orange-600 dark:text-orange-400',
  中: 'text-zinc-500 dark:text-zinc-400',
  慢: 'text-emerald-600 dark:text-emerald-400',
};

/**
 * 场景条（第 2 批 §4.3）：把「章」拆成「场」展示与操作。
 *
 * 它不做两件容易被怀疑的事：
 * 1. 不假装正文里有场景标记——场景正文存在节拍卡的 scenes 里，正文仍是整章 HTML；
 * 2. 不自动覆盖正文——「重写这一场」只改场景卡，要写进正文必须再点一次覆盖按钮。
 */
export function SceneBar({ projectId, chapter, onChapterChange }: SceneBarProps) {
  const beat = (chapter.beatCard as ChapterBeatCard | undefined) ?? null;
  const scenes: SceneCard[] = useMemo(() => beat?.scenes ?? [], [beat]);
  const { written, total } = sceneWrittenCount(scenes);

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [planning, setPlanning] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const overwriting = useRef(false);
  const [dirtyScene, setDirtyScene] = useState<number | null>(null);
  // 结构模板（REFACTOR_PLAN §6.2 资产 2）：排场景时把模板骨架压进节拍卡提示词。
  // 空字符串 = 不套模板，由模型自由发挥。
  const [templateId, setTemplateId] = useState<string>('');
  const [ctx, setCtx] = useState<{
    project: Project; characters: Character[]; worlds: WorldSetting[];
    outlines: Outline[]; prevSummary: string; targetWordCount: number;
    storyBible: StoryBible | null; facts: FactLedger[];
  } | null>(null);

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const [project, characters, worlds, outlines, chapters, storyBible, facts] = await Promise.all([
        getProject(projectId),
        getCharacters(projectId),
        getWorldSettings(projectId),
        getOutlines(projectId),
        getChapters(projectId),
        getStoryBible(projectId).catch(() => undefined),
        getFactLedger(projectId).catch(() => [] as FactLedger[]),
      ]);
      if (!project) return;
      const ordered = [...chapters].sort((a, b) => a.order - b.order);
      const idx = ordered.findIndex(c => c.id === chapter.id);
      const prev = idx > 0 ? ordered[idx - 1] : null;
      setCtx({
        project,
        characters,
        worlds,
        outlines,
        prevSummary: chapterHandoff(prev ? await getChapter(prev.id, projectId) : undefined),
        targetWordCount: project.targetWordCount || chapter.wordCount || 3000,
        storyBible: storyBible ?? null,
        facts: facts ?? [],
      });
    } catch {
      toast.error('加载作品设定失败，场景重写暂不可用');
    } finally {
      setLoading(false);
    }
  }, [projectId, chapter.id, chapter.wordCount]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  // 模板默认值：本机存过就用存的，否则按题材推荐（不覆盖用户的手动选择）
  useEffect(() => {
    if (!ctx) return;
    const stored = (() => {
      try { return localStorage.getItem(`mogao_scene_template:${projectId}`) || ''; } catch { return ''; }
    })();
    if (stored) {
      setTemplateId(stored);
      return;
    }
    const genre = (ctx.project as { genre?: string }).genre;
    if (genre) setTemplateId(getTemplateForGenre(genre as Parameters<typeof getTemplateForGenre>[0]).id);
  }, [ctx, projectId]);

  const changeTemplate = (value: string) => {
    setTemplateId(value);
    try { localStorage.setItem(`mogao_scene_template:${projectId}`, value); } catch { /* 忽略 */ }
  };

  const outline = ctx?.outlines.find(o => o.chapterId === chapter.id);

  const handlePlan = async () => {
    if (!ctx || planning) return;
    setPlanning(true);
    try {
      const { beat: newBeat, scenes: newScenes } = await planChapterWithScenes({
        project: ctx.project,
        chapter,
        outlineSummary: outline?.summary || chapter.title,
        keyEvents: outline?.keyEvents || [],
        characters: await getCharacters(projectId),
        worldSettings: ctx.worlds,
        prevSummary: ctx.prevSummary,
        targetWordCount: ctx.targetWordCount,
        storyBible: ctx.storyBible,
        factLedger: ctx.facts,
        styleFingerprint: ctx.project.styleFingerprint ?? null,
        templateId: templateId || undefined,
        platform: platformOverride(projectId),
      });
      if (!newBeat || newScenes.length === 0) {
        toast.error('没能生成场景规划，请稍后重试');
        return;
      }
      await saveChapterBeatCard({
        ...newBeat,
        id: newBeat.id || `beat-${chapter.id}`,
        projectId,
        chapterId: chapter.id,
        scenes: newScenes,
        updatedAt: new Date(),
      });
      onChapterChange?.({ ...chapter, beatCard: { ...newBeat, scenes: newScenes } });
      toast.success(`已排出 ${newScenes.length} 个场景`);
    } catch {
      toast.error('场景规划失败');
    } finally {
      setPlanning(false);
    }
  };

  const handleRewrite = async (scene: SceneCard) => {
    if (!ctx || busyIndex !== null) return;
    setBusyIndex(scene.index);
    try {
      const text = await regenerateScene({
        project: ctx.project,
        chapter,
        beat,
        scenes,
        index: scene.index,
        outlineSummary: outline?.summary || chapter.title,
        keyEvents: outline?.keyEvents || [],
        characters: await getCharacters(projectId),
        worldSettings: ctx.worlds,
        prevSummary: ctx.prevSummary,
        targetWordCount: ctx.targetWordCount,
        storyBible: ctx.storyBible,
        factLedger: ctx.facts,
        styleFingerprint: ctx.project.styleFingerprint ?? null,
      });
      if (!text) {
        toast.error('这一场没有生成内容');
        return;
      }
      const nextScenes = scenes.map(s => (s.index === scene.index ? { ...s, text } : s));
      if (beat) {
        await saveChapterBeatCard({
          ...beat,
          id: beat.id || `beat-${chapter.id}`,
          projectId,
          chapterId: chapter.id,
          scenes: nextScenes,
          updatedAt: new Date(),
        });
      }
      onChapterChange?.({ ...chapter, beatCard: beat ? { ...beat, scenes: nextScenes } : undefined });
      setDirtyScene(scene.index);
      setConfirmOverwrite(false);
      toast.success(`第 ${scene.index} 场已重写（还没写进正文）`);
    } catch {
      toast.error('这一场重写失败');
    } finally {
      setBusyIndex(null);
    }
  };

  const handleOverwrite = async () => {
    if (overwriting.current) return;
    if (!confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    const content = assembleSceneContent(scenes);
    if (!content) {
      toast.error('还有场次没有正文，无法重组');
      return;
    }
    overwriting.current = true;
    try {
      await flushProjectDrafts(projectId);
      const hash = await chapterMemoryHash(chapter.content);
      await saveChapterVersion(chapter.id, projectId, chapter.content || '', '场景覆盖前备份');
      const saved = await saveChapter({ id: chapter.id, projectId, content, wordCount: countWords(content), expectedSourceHash: hash,
        beatCard: beat ? { ...beat, scenes, sourceHash: await chapterMemoryHash(content), status: 'current' } : undefined });
      onChapterChange?.(saved);
      setConfirmOverwrite(false); setDirtyScene(null);
      toast.success('已用场景稿覆盖本章正文，正在处理人物档案');
      try {
        const report = await synchronizeChapter(saved);
        if (report.errors.length) toast.error(characterSyncReportText(report));
        else toast.success(characterSyncReportText(report));
      } catch { toast.error('正文已保存，人物档案更新失败，可在档案页重试'); }
    } catch { toast.error('正文保存失败，场景稿仍保留，请重试覆盖'); }
    finally { overwriting.current = false; }
  };

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">场景</span>
        {total > 0 ? (
          <span className="text-[11px] text-zinc-400">
            {total} 场 · 已有正文 {written}/{total}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-400">本章还没有场景规划</span>
        )}
        {loading && <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />}
        <div className="ml-auto flex items-center gap-1.5">
          <select
            value={templateId}
            onChange={e => changeTemplate(e.target.value)}
            className="h-6 text-[11px] rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 px-1 cursor-pointer max-w-[150px]"
            title={templateId
              ? STRUCTURE_TEMPLATES.find(t => t.id === templateId)?.desc
              : '不套用结构模板，由模型自由设计场景骨架'}
          >
            <option value="">不套模板</option>
            {STRUCTURE_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={planning || loading}
            onClick={handlePlan}
            title={total > 0 ? '重新排场景（会覆盖现有场景规划，不影响正文）' : '让 AI 依据大纲排出本章场景'}
          >
            {planning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Wand2 className="h-3 w-3 mr-1" />}
            {total > 0 ? '重新排场景' : 'AI 排场景'}
          </Button>
          {total > 0 && (
            <Button
              size="sm"
              variant={confirmOverwrite ? 'default' : 'outline'}
              className="h-6 px-2 text-[11px]"
              disabled={written < total}
              onClick={handleOverwrite}
              title={written < total
                ? '还有场次没有正文，逐场「重写这一场」补齐后才能重组'
                : '用各场正文替换本章正文（会覆盖当前正文内容）'}
            >
              <ArrowDownToLine className="h-3 w-3 mr-1" />
              {confirmOverwrite ? '确认覆盖正文？' : '场景稿覆盖正文'}
            </Button>
          )}
        </div>
      </div>

      {total > 0 && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {scenes
              .slice()
              .sort((a, b) => a.index - b.index)
              .map(scene => {
                const isOpen = openIndex === scene.index;
                const hasText = !!scene.text && !!scene.text.trim();
                return (
                  <button
                    key={scene.index}
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : scene.index)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
                      isOpen
                        ? 'border-zinc-400 dark:border-zinc-500 bg-zinc-50 dark:bg-zinc-800'
                        : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800',
                    )}
                    title={scene.purpose || scene.scene}
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3 text-zinc-400" /> : <ChevronRight className="h-3 w-3 text-zinc-400" />}
                    <span className="Text font-medium text-zinc-700 dark:text-zinc-200">
                      {scene.index}. {scene.scene || '未命名'}
                    </span>
                    <span className={cn('rounded px-1', TENSION_STYLE[scene.tension] || TENSION_STYLE['中'])}>
                      {scene.tension || '中'}
                    </span>
                    <span className={cn('font-medium', PACE_STYLE[scene.pace] || PACE_STYLE['中'])}>{scene.pace || '中'}</span>
                    <span className="text-zinc-400">{scene.wordBudget} 字</span>
                    <span className={hasText ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}>
                      {hasText ? '有稿' : '未写'}
                    </span>
                    {dirtyScene === scene.index && (
                      <span className="text-amber-600 dark:text-amber-400">·未入正文</span>
                    )}
                  </button>
                );
              })}
          </div>

          {openIndex !== null && (() => {
            const scene = scenes.find(s => s.index === openIndex);
            if (!scene) return null;
            return (
              <div className="mt-2 rounded-md border border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-50/60 dark:bg-zinc-800/40">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    第 {scene.index} 场 · 目的：
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{scene.purpose || '（未填写）'}</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px]"
                      disabled={busyIndex !== null}
                      onClick={() => handleRewrite(scene)}
                    >
                      {busyIndex === scene.index
                        ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        : <RefreshCw className="h-3 w-3 mr-1" />}
                      {scene.text ? '重写这一场' : '生成这一场'}
                    </Button>
                    <button
                      type="button"
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                      onClick={() => setOpenIndex(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {scene.text ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 rounded p-2 border border-zinc-100 dark:border-zinc-800">
                    {scene.text.replace(/<[^>]*>/g, '').slice(0, 1200)}
                  </pre>
                ) : (
                  <p className="text-[11px] text-zinc-400">
                    这一场还没有正文。点「生成这一场」会依据本章蓝图与上一场结尾单独写这一场（不影响其他场次）。
                  </p>
                )}
                {dirtyScene === scene.index && (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    已重写但尚未写入正文 —— 全部场次都有稿后，点上方「场景稿覆盖正文」生效。
                  </p>
                )}
              </div>
            );
          })()}
        </>
      )}

      {total === 0 && (
        <p className="text-[11px] text-zinc-400">
          场景规划来自章节节拍卡（批量生成长篇时自动落库）。也可以用上面的「AI 排场景」为本章单独排一次，
          然后逐场生成或重写——比整章重写更省 token，也不会把没问题的段落改坏。
        </p>
      )}
    </div>
  );
}
