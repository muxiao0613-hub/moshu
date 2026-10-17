import { NavLink, useMatch, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, CornerDownRight, HelpCircle, Layers, Wand2, X } from 'lucide-react';
import { ChapterTree } from '@/features/chapter/ChapterTree';
import { GuideTarget } from '@/shared/layout/GuideTarget';
import { useOnboarding } from '@/shared/contexts/OnboardingContext';
import { cn } from '@/shared/lib/utils';
import { useDrawerSwipe } from '@/shared/lib/useDrawerSwipe';
import { workRefinePath } from '@/shared/lib/workRoutes';

interface SidebarProps {
  projectTitle: string;
  onBack: () => void;
  onBatchGenerate: () => void;
  open?: boolean;
  onClose?: () => void;
  /** 桌面端宽度（作者拖分栏把手定，见 `useDragWidth`）；手机端抽屉固定 w-64。 */
  desktopWidth?: number;
}

/**
 * 写作台左栏：作品 > 卷 > 章节树 + 通往「完善台」的入口。
 *
 * 取代原来「章节正文 / 人物档案 / 世界观 / 章节大纲 / 伏笔线索 / 时间线 / 质量中枢」7 项
 * 按数据类型分的导航 —— 那 7 页里的设定与体检全部收进完善台（一个入口），
 * 而写作时要看的上下文留在这里的右栏抽屉里（REFACTOR_PLAN.md §3-§4）。
 */
export function Sidebar({ projectTitle, onBack, onBatchGenerate, open, onClose, desktopWidth }: SidebarProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const swipe = useDrawerSwipe({ side: 'left', open: !!open, onClose: () => onClose?.() });
  const { step, advance, restart } = useOnboarding();
  const chapterMatch = useMatch('/work/:id/chapter/:cid');
  const activeChapterId = chapterMatch?.params.cid;
  // 完善台是一个入口带多个标签，所以高亮看的是「前缀」而不是某一条子路由。
  // 两次 useMatch 必须无条件调用：写成 `a ?? b` 时右侧会在 a 命中后被跳过，
  // Hook 数量随渲染变化，React 直接抛错（点击「完善台」就会白屏）。
  const refineTabMatch = useMatch('/work/:id/refine/:tab');
  const refineRootMatch = useMatch('/work/:id/refine');
  const inRefine = !!(refineTabMatch || refineRootMatch);

  const handleBatchGenerate = () => {
    if (step === 2) advance();
    onBatchGenerate();
    onClose?.();
  };

  const handleRestart = () => {
    restart();
    navigate('/');
  };

  const sidebarContent = (
    <aside className="flex flex-col w-64 md:w-full h-full bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={onBack}
          className="p-1 rounded shrink-0 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="返回书架"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex-1 text-sm font-medium truncate text-zinc-800 dark:text-zinc-100">
          {projectTitle}
        </span>
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {id && <ChapterTree projectId={id} activeChapterId={activeChapterId} onNavigate={onClose} />}

      <div className="px-3 pb-3 pt-2 space-y-1 border-t border-zinc-200 dark:border-zinc-800">
        <GuideTarget
          targetStep={2}
          message="第三步：AI 一键生成"
          detail="点击这里，AI 将根据你的书名和简介，自动生成人物、世界观、大纲与伏笔。"
          side="top"
        >
          <button
            onClick={handleBatchGenerate}
            className="auth-btn-gold flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ color: '#052020', letterSpacing: '0.5px' }}
          >
            <Wand2 className="h-4 w-4 shrink-0" />
            <span>AI 一键生成</span>
          </button>
        </GuideTarget>

        {id && (
          <NavLink
            to={workRefinePath(id, 'characters')}
            onClick={() => onClose?.()}
            className={cn(
              'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors',
              inRefine
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60',
            )}
          >
            <Layers className="h-4 w-4 shrink-0" />
            <span>完善台</span>
            <span className="ml-auto text-[10px] text-zinc-400">设定 · 体检</span>
          </NavLink>
        )}

        <button
          onClick={handleRestart}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 transition-colors"
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>新手引导</span>
          <CornerDownRight className="h-3 w-3 ml-auto opacity-50" />
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* 桌面端：常驻宽度由作者的拖拽决定（默认 240，双击把手复位）；
          上限 40vw 是兜底 —— 窗口变小后也不该把正文挤没 */}
      <div
        className="hidden md:flex h-full shrink-0"
        style={desktopWidth ? { width: desktopWidth, maxWidth: '40vw' } : undefined}
      >
        {sidebarContent}
      </div>

      {/* 移动端：抽屉覆盖层（带滑动动画，常驻 DOM 用 transform 过渡）*/}
      <div className={cn('md:hidden fixed inset-0 z-40', open ? '' : 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-black/60 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
          onClick={onClose}
        />
        <div {...swipe.handlers} style={swipe.style}
          className={cn('absolute inset-y-0 left-0 z-50 h-full transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full')}>
          {sidebarContent}
        </div>
      </div>
    </>
  );
}
