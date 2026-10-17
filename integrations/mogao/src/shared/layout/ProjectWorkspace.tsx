/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useMatch } from 'react-router-dom';
import { Loader2, Search, Bot, ChevronLeft } from 'lucide-react';
import { saveAs } from 'file-saver';
import { downloadProjectBackup } from '@/features/project/backup';
import { Sidebar } from '@/shared/layout/Sidebar';
import { AIBatchGenerate } from '@/features/ai/AIBatchGenerate';
import { TopBar } from '@/shared/layout/TopBar';
import { AIPanel } from '@/features/ai/AIPanel';
import { ContextDrawer } from '@/features/context/ContextDrawer';
import { ChapterEditor } from '@/features/chapter/ChapterEditor';
import { RefinePage } from '@/features/refine/RefinePage';
import { EditorProvider } from '@/shared/contexts/EditorContext';
import { useOnboarding } from '@/shared/contexts/OnboardingContext';
import { useIsMobile } from '@/shared/lib/useMediaQuery';
import { useDragWidth } from '@/shared/lib/useDragWidth';
import { PanelResizer } from '@/shared/ui/PanelResizer';
import {
  getProject, getChapters, getChaptersWithContent,
} from '@/api';
import { stripHtml } from '@/features/ai/aiService';
import { flushProjectDrafts } from '@/shared/lib/draftFlush';
import { workAdvancedPath, workChapterPath, workRefinePath } from '@/shared/lib/workRoutes';
import { toast } from '@/shared/ui/toast';
import type { Project } from '@/shared/types';

/**
 * `/work/:id` 的落点：自动续上次编辑的章（REFACTOR_PLAN.md §3.2）。
 * 「上次编辑」= chapters 里 updatedAt 最新的一条，与 ChapterList 的 lastEditedChapter 同口径。
 */
function ChapterAutoOpen({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getChapters(projectId).then(list => {
      if (!alive) return;
      if (list.length === 0) { setState('empty'); return; }
      const last = [...list].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];
      navigate(workChapterPath(projectId, last.id), { replace: true });
    }).catch(()=>{if(alive)setState('error');});
    return () => { alive = false; };
  }, [projectId, navigate]);

  if(state==='error')return <p role="alert" className="p-6 text-sm">章节读取失败，请使用左栏刷新后重试。</p>;
  if (state === 'empty') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-400 px-6 text-center">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">这本作品还没有章节。</p>
        <p className="text-xs">点左栏章节树右上角的 ＋ 新建第一章，或到「完善台 › 章节大纲」把大纲里的章节节点同步过来。</p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-full gap-2 text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">正在打开上次编辑的章节…</span>
    </div>
  );
}

/** 旧诊疗台链接 → 完善台对应标签（tab 名两处一致，直接换前缀）。 */
function LegacyClinicRedirect({ projectId }: { projectId: string }) {
  const { tab } = useParams<{ tab?: string }>();
  return <Navigate to={workRefinePath(projectId, tab)} replace />;
}

/** 旧「高级」链接 → 完善台对应标签（段名映射只在 workRoutes 里维护一份）。 */
function LegacyAdvancedRedirect({ projectId }: { projectId: string }) {
  const { section } = useParams<{ section?: string }>();
  return <Navigate to={workAdvancedPath(projectId, section)} replace />;
}

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // 当前章节（用于上下文抽屉按本章正文计算真实注入量）
  const chapterMatch = useMatch('/work/:id/chapter/:cid');
  const currentChapterId = chapterMatch?.params.cid;
  // 手机端默认收起 AI 面板（否则会盖住正文）；桌面端默认展开。
  // 作者手动收起/展开过一次后，记住这个选择（否则每次刷新都弹回来）。
  const [aiPanelOpen, setAiPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.localStorage.getItem('mogao_right_panel_open');
    if (saved !== null) return saved === '1';
    return window.innerWidth >= 768;
  });
  // 右栏两个视角：上下文（看清楚喂了什么） / AI 助手（生成与修改）
  const [panelTab, setPanelTab] = useState<'context' | 'ai'>('ai');
  const [batchOpen, setBatchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [projectError,setProjectError]=useState('');
  const loadEpoch=useRef(0);
  const { step: guideStep, advance: guideAdvance } = useOnboarding();

  // 两栏宽度都由作者自己定（拖动分栏把手，双击复位），并按面板记住 —— 写作时的
  // 「正文多大、设定栏多大」是个人习惯，不该由代码写死 240 / 340。
  const treeWidth = useDragWidth({
    storageKey: 'mogao_chapter_tree_width', fallback: 240, min: 180, max: 420, grow: 'grow-right',
  });
  const rightPanelWidth = useDragWidth({
    storageKey: 'mogao_right_panel_width', fallback: 340, min: 260, max: 820, grow: 'grow-left',
  });

  const loadProject = useCallback(async () => {
    if (!id) return;
    const ticket=++loadEpoch.current;setProjectError('');
    try {
      const p=await getProject(id);if(loadEpoch.current!==ticket)return;
      if(!p){setProject(null);return;}
      const chapters=await getChapters(id);if(loadEpoch.current!==ticket)return;
      setProject(p);setTotalWordCount(chapters.reduce((sum,c)=>sum+(c.wordCount||0),0));
    } catch {if(loadEpoch.current===ticket)setProjectError('作品读取失败，请重试。');}
  }, [id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    if (project === undefined) return;
    if (project === null) navigate('/');
  }, [project, navigate]);

  useEffect(() => {
    if (guideStep === 0) guideAdvance();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 记住右栏开合（下次打开这本作品还是你上次的样子）
  useEffect(() => {
    window.localStorage.setItem('mogao_right_panel_open', aiPanelOpen ? '1' : '0');
  }, [aiPanelOpen]);

  // 导出 .mgao（完整备份，从后端拉全量数据）
  const handleExport = async () => {
    if (!id || !project) return;
    try {
      await downloadProjectBackup(id);
      toast.success('已导出完整备份（本地已保存内容与版本）');
    } catch (e) {
      toast.error('导出失败：' + (e as Error).message);
    }
  };

  const handleExportTxt = async () => {
    if (!id || !project) return;
    try {
    await flushProjectDrafts(id);
    const chapters = await getChaptersWithContent(id);
    const content = chapters
      .map(ch => `${ch.title}\n\n${stripHtml(ch.content)}`)
      .join('\n\n' + '─'.repeat(20) + '\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    await saveAs(blob, `${project.title}.txt`);
    } catch (e) { toast.error('导出失败：' + (e as Error).message); }
  };

  const handleExportDocx = async () => {
    if (!id || !project) return;
    try {
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import('docx');
    await flushProjectDrafts(id);
    const chapters = await getChaptersWithContent(id);
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: 'SimSun', size: 24 },
            paragraph: { spacing: { line: 480 } },
          },
        },
      },
      sections: [{
        properties: {},
        children: [
          new Paragraph({ text: project.title, heading: HeadingLevel.TITLE }),
          ...chapters.flatMap(ch => {
            const paragraphs = stripHtml(ch.content).split(/\n+/).filter(Boolean);
            return [
              new Paragraph({ text: ch.title, heading: HeadingLevel.HEADING_1 }),
              ...paragraphs.map(p => new Paragraph({
                children: [new TextRun({ text: p })],
                indent: { firstLine: 480 },
              })),
            ];
          }),
        ],
      }],
    });
    const blob = await Packer.toBlob(doc);
    await saveAs(blob, `${project.title}.docx`);
    } catch (e) { toast.error('导出失败：' + (e as Error).message); }
  };


  if(projectError)return <div className="p-6 space-y-3"><p role="alert">{projectError}</p><button onClick={()=>void loadProject()}>重试</button><button onClick={()=>navigate('/')}>返回书架</button></div>;
  if (project === undefined) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">加载中...</span>
      </div>
    );
  }

  if (!project) return null;

  return (
    <EditorProvider>
      <div className="flex flex-col h-full">
        <TopBar
          projectTitle={project.title}
          projectId={id ?? undefined}
          totalWordCount={totalWordCount}
          onExport={handleExport}
          onExportTxt={handleExportTxt}
          onExportDocx={handleExportDocx}
          aiPanelOpen={aiPanelOpen}
          onToggleAI={() => setAiPanelOpen(o => !o)}
          onToggleSidebar={() => setSidebarOpen(o => !o)}
        />

        <div className="flex flex-1 min-h-0">
          <Sidebar
            projectTitle={project.title}
            onBack={() => navigate('/')}
            onBatchGenerate={() => setBatchOpen(true)}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            desktopWidth={treeWidth.width}
          />
          <PanelResizer handle={treeWidth} label="调整章节树宽度" />

          <main className="flex-1 min-w-0 overflow-auto bg-zinc-50 dark:bg-zinc-900">
            <Routes>
              {/* 写作台：默认自动续上次编辑的章 */}
              <Route index element={<ChapterAutoOpen projectId={id!} />} />
              <Route path="chapter/:cid" element={<ChapterEditor projectId={id!} />} />

              {/* 完善台：设定（人物/世界观/大纲/伏笔/章节列表）+ 体检（一致性/AI 味/节奏/评审/批量体检） */}
              <Route path="refine" element={<RefinePage projectId={id!} />} />
              <Route path="refine/:tab" element={<RefinePage projectId={id!} />} />

              {/* 旧路径重定向（REFACTOR_PLAN.md §7.1）：保证老链接与老书签仍然可用 */}
              <Route path="clinic" element={<Navigate to="../refine" replace />} />
              <Route path="clinic/:tab" element={<LegacyClinicRedirect projectId={id!} />} />
              <Route path="advanced" element={<Navigate to="../refine" replace />} />
              <Route path="advanced/:section" element={<LegacyAdvancedRedirect projectId={id!} />} />
              <Route path="chapters" element={<Navigate to="../" replace />} />
              <Route path="characters" element={<Navigate to="../refine/characters" replace />} />
              <Route path="world" element={<Navigate to="../refine/world" replace />} />
              <Route path="outline" element={<Navigate to="../refine/outline" replace />} />
              <Route path="threads" element={<Navigate to="../refine/threads" replace />} />
              {/* 时间线独立页已删（数据与函数保留），老链接转到伏笔看板 */}
              <Route path="timeline" element={<Navigate to="../refine/threads" replace />} />
              <Route path="quality" element={<Navigate to="../refine/review" replace />} />
              <Route path="*" element={<Navigate to="../" replace />} />
            </Routes>
          </main>

          {/* 右栏收起后，这里留一个贴边的「拉出」把手：否则只剩顶栏那个 Bot 图标可点，
              不看图标含义就找不到右栏怎么回来（用户反馈过这个） */}
          {!aiPanelOpen && (
            <button
              onClick={() => setAiPanelOpen(true)}
              title="展开右栏（上下文 / AI 助手）"
              aria-label="展开右栏"
              className="fixed right-0 top-24 z-30 flex items-center gap-1 rounded-l-lg border border-r-0 border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 px-1.5 py-2.5 text-zinc-500 shadow-md transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="text-[10px] leading-none" style={{ writingMode: 'vertical-rl' }}>右栏</span>
            </button>
          )}

          {/* 右栏：上下文 / AI 助手 两个视角共用一列，避免出现两套并列的 AI 入口。
              两个面板都保持挂载（用 CSS 隐藏切换），以免切 tab 丢失对话与生成结果。 */}
          {aiPanelOpen && (
            <>
              {isMobile && <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setAiPanelOpen(false)} />}
              <PanelResizer handle={rightPanelWidth} label="调整右栏宽度" />
              <div
                className="fixed inset-y-0 right-0 z-40 flex md:static md:z-auto w-[85vw] shrink-0 flex-col bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800"
                style={isMobile ? undefined : { width: rightPanelWidth.width, maxWidth: '60vw' }}
              >
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800">
                  <button
                    onClick={() => setPanelTab('context')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      panelTab === 'context'
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Search className="h-3.5 w-3.5" />上下文
                  </button>
                  <button
                    onClick={() => setPanelTab('ai')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      panelTab === 'ai'
                        ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Bot className="h-3.5 w-3.5" />AI 助手
                  </button>
                  <button
                    onClick={() => setAiPanelOpen(false)}
                    className="ml-auto px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    title="收起右栏"
                  >
                    收起
                  </button>
                </div>
                <div className="flex-1 min-h-0 flex">
                  <div className={panelTab === 'context' ? 'flex w-full h-full' : 'hidden'}>
                    <ContextDrawer projectId={id!} chapterId={currentChapterId} />
                  </div>
                  <div className={panelTab === 'ai' ? 'flex w-full h-full' : 'hidden'}>
                    <AIPanel projectId={id!} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {batchOpen && (
        <AIBatchGenerate projectId={id!} onClose={() => setBatchOpen(false)} />
      )}
    </EditorProvider>
  );
}
