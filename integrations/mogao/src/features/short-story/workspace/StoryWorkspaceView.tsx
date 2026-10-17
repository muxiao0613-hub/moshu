/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/**
 * 短篇写作台 · 主容器：组合「故事数据/编辑器」与「AI 生成」两个 hook，渲染 TopBar、头部进度条与三栏布局。
 *
 * 在拆分中的位置：workspace 的顶层视图（其余模块均为它的下层依赖）；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：./useStoryEditor、./useStoryGeneration、./StorySetupPanel、./WritingCanvas、./AiPanel、
 * ./exporting 与 @/shared 基础组件；只有本文件允许同时依赖 hook 与展示面板。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Check, CheckCircle2, ChevronRight, Circle, Layers, Loader2, Save, Wand2,
} from 'lucide-react';
import { countWords } from '@/api';
import { stripHtml } from '@/features/ai/aiService';
import { exportPlainText } from '@/host/plainText';
import { chooseStoryBackup, downloadStoryBackup } from '@/features/short-story/backup';
import {
  PLATFORM_CONFIGS, GENRE_CONFIGS, checkPlatformFormat,
} from '@/features/short-story/shortStoryTemplates';
import { TopBar } from '@/shared/layout/TopBar';
import { useDragWidth } from '@/shared/lib/useDragWidth';
import { cn } from '@/shared/lib/utils';
import { useDrawerSwipe } from '@/shared/lib/useDrawerSwipe';
import { Button } from '@/shared/ui/button';
import { DraftConflictPanel } from '@/shared/ui/DraftConflictPanel';
import { PanelResizer } from '@/shared/ui/PanelResizer';
import { toast } from '@/shared/ui/toast';
import type { StoryPlotPoint } from '@/shared/types';
import { AiPanel } from './AiPanel';
import { exportStoryDocx } from './exporting';
import { StorySetupPanel } from './StorySetupPanel';
import { useStoryEditor } from './useStoryEditor';
import { useStoryGeneration } from './useStoryGeneration';
import { StoryVersionHistory } from './VersionHistory';
import { WritingCanvas } from './WritingCanvas';

export function ShortStoryWorkspace() {
  const navigate = useNavigate();

  const editorApi = useStoryEditor();
  const generation = useStoryGeneration(editorApi);
  const {
    story, loadError, retryLoad, titleInput, setTitleInput, saveState, editor, canvasRef,
    selectedText, doSave, updateField, updatePlotPoint, updateTitle,
    conflict, resolveConflict, backupToRestore, restoreBackup, discardBackup,
  } = editorApi;
  const {
    qualityReport, loading, expandedPt, setExpandedPt, styleOpen, setStyleOpen,
  } = generation;

  // 手机端左右两栏改为抽屉
  const [setupDrawerOpen, setSetupDrawerOpen] = useState(false);
  const [aiDrawerOpen,    setAiDrawerOpen]    = useState(false);
  const setupSwipe = useDrawerSwipe({ side: 'left', open: setupDrawerOpen, onClose: () => setSetupDrawerOpen(false) });
  const aiSwipe    = useDrawerSwipe({ side: 'right', open: aiDrawerOpen, onClose: () => setAiDrawerOpen(false) });

  // 左右两栏都能拖：左栏往右长，右栏往左长，双击把手恢复默认（与写作台同一套手感）
  const setupWidth = useDragWidth({
    storageKey: 'mogao_short_setup_width', fallback: 288, min: 220, max: 460, grow: 'grow-right',
  });
  const aiWidth = useDragWidth({
    storageKey: 'mogao_short_ai_width', fallback: 320, min: 260, max: 560, grow: 'grow-left',
  });

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  if (!story) return (
    <div className="flex items-center justify-center h-full text-zinc-400">
      {loadError ? <><span>{loadError}</span><button onClick={retryLoad} className="ml-3 text-ink-600 underline">重试</button></>
        : <><Loader2 className="h-5 w-5 animate-spin mr-2" />加载中...</>}
    </div>
  );

  const pc         = PLATFORM_CONFIGS[story.platform];
  const gc         = GENRE_CONFIGS[story.genre];
  const wordCount  = countWords(editor?.getHTML() || story.content || '');
  const progress   = Math.min(100, (wordCount / story.targetWords) * 100);
  const fmtIssues  = checkPlatformFormat(editor?.getHTML() || story.content || '', story.platform, wordCount);
  const hasErr     = fmtIssues.some(f => f.type === 'error');
  const plotPoints = (story.plotPoints as StoryPlotPoint[]) || [];
  const filled     = plotPoints.filter(p => p.content?.trim()).length;
  const hasPremise = !!story.premise?.trim();
  const fullDraftThreshold = Math.max(800, Math.floor(story.targetWords * 0.7));
  const isLikelyCompleteDraft = wordCount >= fullDraftThreshold;
  const hasFullDraft = isLikelyCompleteDraft;
  const nextTip = !hasPremise
    ? '先在左侧写一句故事想法，或直接点「一键自动成稿」。'
    : filled === 0
      ? '下一步：生成故事骨架，系统会把灵感拆成可写场景。'
      : !hasFullDraft
        ? '下一步：生成完整正文。新手建议点「一键自动成稿」，生成后中间编辑区就是最终全文。'
        : !qualityReport
          ? '下一步：做 AI 深度质检，找出开头、结构、结尾和 AI 味问题。'
          : '下一步：按质检建议做全文精修，然后导出或发布。';

  return (
    <div className="flex flex-col h-full">
      <TopBar
        projectTitle={titleInput || '无标题故事'} totalWordCount={wordCount}
        onExport={async () => { try { const s = editorApi.storyRef.current; if (!s) return; const saved = await editorApi.saveDraft(s, editor?.getHTML() || s.content); if (saved) await downloadStoryBackup(saved); } catch (e) { toast.error(e instanceof Error ? e.message : '短篇备份失败'); } }}
        onExportTxt={() => void saveAs(new Blob([(titleInput || '无标题') + '\n\n' + exportPlainText(editor?.getHTML() || story.content || '')], { type: 'text/plain;charset=utf-8' }), `${titleInput || '短篇'}.txt`).catch(e=>toast.error(e.message))}
        onExportDocx={() => exportStoryDocx(titleInput, editor?.getHTML(), story)}
        onImport={() => chooseStoryBackup(id => navigate(`/short/${id}`))}
        aiPanelOpen onToggleAI={() => {}}
      />

      {conflict && <DraftConflictPanel local={editor?.getHTML() ?? conflict.local} remote={conflict.remote.content} onResolve={resolveConflict} />}
      {backupToRestore && <div className="shrink-0 border-b border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-xs space-y-2">
        <p>发现与服务端不同的本地草稿（{new Date(backupToRestore.savedAt).toLocaleString()}），请比较后选择。</p>
        <details><summary className="cursor-pointer">查看本地草稿</summary><pre className="whitespace-pre-wrap max-h-48 overflow-auto mt-2">{stripHtml(backupToRestore.content)}</pre></details>
        <div className="flex gap-2"><Button size="sm" onClick={restoreBackup}>恢复本地草稿</Button><Button size="sm" variant="outline" onClick={discardBackup}>保留服务端版本</Button></div>
      </div>}

      {/* 故事头部：返回 + 体裁 + 阶段进度 + 字数 + 保存（唯一状态来源）*/}
      <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-12 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0 overflow-hidden">
        <button onClick={() => navigate('/')} className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors shrink-0">
          <ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">返回</span>
        </button>
        {/* 手机端：打开「故事设定」抽屉 */}
        <button onClick={() => setSetupDrawerOpen(true)}
          className="md:hidden flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 shrink-0">
          <Layers className="h-3.5 w-3.5" />设定
        </button>
        <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700 hidden sm:block" />
        <span className="px-2.5 py-1 rounded-lg text-xs font-medium truncate min-w-0 max-w-[34vw] sm:max-w-none sm:shrink-0" style={{ backgroundColor: `${pc.color}15`, color: pc.color }}>
          {gc.emoji} {story.genre}<span className="hidden sm:inline"> · {story.platform}</span>
        </span>

        {/* 阶段进度：立意 → 骨架 → 成文 → 打磨 */}
        <div className="hidden lg:flex items-center gap-1 ml-1">
          {([
            { k: '立意', done: hasPremise },
            { k: '骨架', done: filled > 0 && filled === plotPoints.length },
            { k: '成文', done: isLikelyCompleteDraft },
            { k: '打磨', done: !!qualityReport && qualityReport.totalScore >= 75 },
          ]).map((s, i, arr) => (
            <div key={s.k} className="flex items-center gap-1">
              <span className="flex items-center gap-1 text-[11px]" style={{ color: s.done ? pc.color : undefined }}>
                <span className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={s.done ? { backgroundColor: pc.color, color: '#fff' } : { backgroundColor: 'rgba(120,120,120,0.15)', color: '#a1a1aa' }}>
                  {s.done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span className={cn(!s.done && 'text-zinc-400')}>{s.k}</span>
              </span>
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-zinc-300 dark:text-zinc-600" />}
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="hidden sm:flex items-center gap-2 w-40 shrink-0">
          <div className="flex-1 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: pc.color }} />
          </div>
          <span className="tabular-nums text-xs text-zinc-500 shrink-0">{wordCount}<span className="text-zinc-300 dark:text-zinc-600">/{story.targetWords}</span></span>
        </div>

        <span className="hidden sm:flex items-center gap-1 text-xs shrink-0 w-16 justify-end">
          {saveState === 'saved'   && <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /><span className="text-zinc-400">已保存</span></>}
          {saveState === 'unsaved' && <><Circle className="h-3.5 w-3.5 text-amber-400" /><span className="text-amber-500">未保存</span></>}
          {saveState === 'saving'  && <><Loader2 className="h-3.5 w-3.5 text-zinc-400 animate-spin" /><span className="text-zinc-400">保存中</span></>}
        </span>
        <Button size="sm" variant="outline" onClick={() => doSave(true)} className="h-7 text-xs gap-1 shrink-0">
          <Save className="h-3 w-3" /><span className="hidden sm:inline">存版本</span>
        </Button>
        <StoryVersionHistory api={editorApi} />
        {/* 手机端：打开「AI 助手」抽屉 */}
        <button onClick={() => setAiDrawerOpen(true)}
          className="md:hidden flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-white shrink-0"
          style={{ backgroundColor: pc.color }}>
          <Wand2 className="h-3.5 w-3.5" />AI
        </button>
      </header>

      {/* 三栏 */}
      <div className="flex flex-1 min-h-0">

        {/* 手机端抽屉遮罩（淡入淡出）*/}
        <div className={cn('md:hidden fixed inset-0 bg-black/50 z-30 transition-opacity duration-300',
          setupDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          onClick={() => setSetupDrawerOpen(false)} />

        {/* ═══ 左栏：故事设定（桌面常驻列 / 手机抽屉，带滑动）═══ */}
        <StorySetupPanel
          story={story} pc={pc} plotPoints={plotPoints} filled={filled} loading={loading}
          expandedPt={expandedPt} styleOpen={styleOpen} drawerOpen={setupDrawerOpen} swipe={setupSwipe}
          width={setupWidth.width}
          onClose={() => setSetupDrawerOpen(false)}
          onToggleExpanded={setExpandedPt}
          onToggleStyleOpen={() => setStyleOpen(o => !o)}
          onEnhancePremise={generation.handleEnhancePremise}
          onGenerateStructure={generation.handleGenerateStructure}
          onUpdateField={updateField}
          onUpdatePlotPoint={updatePlotPoint}
        />
        <PanelResizer handle={setupWidth} label="调整故事设定栏宽度" />

        {/* ═══ 中栏：写作画布（主角）═══ */}
        <WritingCanvas
          story={story} editor={editor} pc={pc} titleInput={titleInput} wordCount={wordCount}
          hasPremise={hasPremise} filled={filled} plotPoints={plotPoints}
          isLikelyCompleteDraft={isLikelyCompleteDraft} loading={loading} qualityReport={qualityReport}
          nextTip={nextTip} fmtIssues={fmtIssues} hasErr={hasErr}
          onTitleChange={setTitleInput}
          onTitleBlur={updateTitle}
          onOneClickFullDraft={generation.handleOneClickFullDraft}
          onGenerateStructure={generation.handleGenerateStructure}
        />

        {/* 手机端抽屉遮罩（淡入淡出）*/}
        <div className={cn('md:hidden fixed inset-0 bg-black/50 z-30 transition-opacity duration-300',
          aiDrawerOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          onClick={() => setAiDrawerOpen(false)} />

        <PanelResizer handle={aiWidth} label="调整 AI 助手栏宽度" />

        {/* ═══ 右栏：AI 面板（桌面常驻列 / 手机抽屉，带滑动）═══ */}
        <AiPanel
          story={story} pc={pc} filled={filled} plotPoints={plotPoints} wordCount={wordCount}
          nextTip={nextTip} fmtIssues={fmtIssues} canvasRef={canvasRef}
          drawerOpen={aiDrawerOpen} swipe={aiSwipe} generation={generation}
          width={aiWidth.width}
          selectedText={selectedText}
          onClose={() => setAiDrawerOpen(false)}
        />
      </div>
    </div>
  );
}
