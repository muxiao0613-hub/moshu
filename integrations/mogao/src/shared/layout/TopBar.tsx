/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import { useState, useEffect } from 'react';
import { Download, Upload, Moon, Sun, Bot, Coins, Menu, BookMarked, ChevronLeft, Library, MessagesSquare } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getTodayUsage, formatTokens, TOKEN_UPDATE_EVENT } from '@/api/tokenTracker';
import { useOnboarding } from '@/shared/contexts/OnboardingContext';
import { useTheme } from '@/shared/contexts/ThemeContext';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { UserMenu } from './UserMenu';

export interface TopBarProps {
  onBack?: () => void;
  projectTitle?: string;
  /** 当前作品 id：让「角色扮演」直接进这部作品（在写作台里点它就不用再选一次作品） */
  projectId?: string;
  totalWordCount?: number;
  onToggleSidebar?: () => void;
  aiPanelOpen?: boolean;
  onToggleAI?: () => void;
  onExport?: () => void;
  onExportTxt?: () => void;
  onExportDocx?: () => void;
  onImport?: () => void;
}

export function TopBar({
  onBack,
  projectTitle, projectId, totalWordCount = 0,
  onToggleSidebar, aiPanelOpen, onToggleAI,
  onExport, onExportTxt, onExportDocx, onImport,
}: TopBarProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inRoleplay = pathname.startsWith('/roleplay');
  const { isDark, toggleTheme } = useTheme();
  const [exportOpen, setExportOpen] = useState(false);
  const [todayTokens, setTodayTokens] = useState(() => getTodayUsage()?.totalTokens ?? 0);
  const { advance: guideAdvance } = useOnboarding();

  useEffect(() => {
    const update = () => setTodayTokens(getTodayUsage()?.totalTokens ?? 0);
    window.addEventListener(TOKEN_UPDATE_EVENT, update);
    return () => window.removeEventListener(TOKEN_UPDATE_EVENT, update);
  }, []);

  const wc = totalWordCount >= 10000
    ? `${(totalWordCount / 10000).toFixed(1)}万字`
    : `${totalWordCount}字`;

  return (
    <header
      className="flex items-center justify-between px-4 h-12 shrink-0"
      style={{
        background: isDark ? '#07070f' : undefined,
        borderBottom: isDark
          ? '1px solid rgba(78,216,212,0.2)'
          : '1px solid rgba(120,90,40,0.35)',
        backgroundColor: isDark ? '#07070f' : '#2b241c',
      }}
    >
      {/* 左侧 */}
      <div className="flex items-center gap-2 min-w-0">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}
            className="text-zinc-400 hover:text-zinc-100 shrink-0" title="返回首页">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {onToggleSidebar && (
          <Button variant="ghost" size="icon" onClick={onToggleSidebar}
            className="md:hidden text-zinc-400 hover:text-zinc-100 shrink-0">
            <Menu className="h-4 w-4" />
          </Button>
        )}
        <img src="./logo.png" alt="墨稿" className="h-7 w-7 rounded-lg shrink-0" />
        {projectTitle ? (
          <>
            <span className="text-sm truncate max-w-32 md:max-w-48 hidden sm:block"
              style={{ color: isDark ? 'rgba(78,216,212,0.65)' : '#c2b495' }}>
              {projectTitle}
            </span>
            <span className="text-xs hidden lg:block shrink-0"
              style={{ color: isDark ? 'rgba(78,216,212,0.35)' : '#a89a7e' }}>
              共 {wc}
            </span>
          </>
        ) : (
          <span
            className="text-sm font-bold hidden sm:block"
            style={isDark ? {
              background: 'linear-gradient(135deg, #1a9490 0%, #3acac8 40%, #80f0ee 70%, #2ab0ae 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: 'Noto Serif SC, SimSun, serif',
              fontSize: '16px',
            } : { color: '#f0e6d2' }}
          >
            墨稿
          </span>
        )}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Token 用量 */}
        {projectTitle && todayTokens > 0 && (() => {
          return (
            <span className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ color: isDark ? 'rgba(78,216,212,0.5)' : '#b8a888' }}>
              <Coins className="h-3 w-3" />
              <span title="未返回用量的请求按字符估算">约 {formatTokens(todayTokens)} tokens</span>
            </span>
          );
        })()}

        {/* AI 助手 / 上下文右栏开关（收起后靠它 + 工作区右边的把手回来） */}
        {onToggleAI && (
          <Button variant="ghost" size="icon" onClick={onToggleAI}
            className={cn('hover:text-zinc-100', aiPanelOpen ? 'text-zinc-100' : 'text-zinc-400')}
            style={aiPanelOpen ? {
              background: isDark ? 'rgba(78,216,212,0.18)' : 'rgba(240,230,210,0.16)',
              color: isDark ? '#c0f0ee' : '#f0e6d2',
            } : {}}
            title={aiPanelOpen ? '收起右栏（上下文 / AI 助手）' : '展开右栏（上下文 / AI 助手）'}>
            <Bot className="h-4 w-4" />
          </Button>
        )}

        {/* 书架（首页） */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}
          className="text-zinc-400 hover:text-zinc-100 gap-1.5" title="我的书架">
          <Library className="h-4 w-4" />
          <span className="hidden md:inline text-sm">书架</span>
        </Button>

        {/* 作品广场入口已随社区一起移出写作台（第 4 批，见 extras/README.md） */}

        {/* 角色扮演（独立页面）：平时和角色闲聊、对戏，聊出来的性格写回人物档案 */}
        <Button variant="ghost" size="sm"
          onClick={() => navigate(projectId ? `/roleplay/${projectId}` : '/roleplay')}
          className={cn('gap-1.5', inRoleplay ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-100')}
          style={inRoleplay ? {
            background: isDark ? 'rgba(78,216,212,0.18)' : 'rgba(240,230,210,0.16)',
            color: isDark ? '#c0f0ee' : '#f0e6d2',
          } : {}}
          title="角色对话：根据小说经历聊人物选择，确认新特点后用于后续写作">
          <MessagesSquare className="h-4 w-4" />
          <span className="hidden md:inline text-sm">角色对话</span>
        </Button>

        {/* 素材库 */}
        <Button variant="ghost" size="sm" onClick={() => navigate('/materials')}
          className="text-zinc-400 hover:text-zinc-100 gap-1.5" title="素材库">
          <BookMarked className="h-4 w-4" />
          <span className="hidden md:inline text-sm">素材库</span>
        </Button>

        {/* 导入 .mgao */}
        {onImport && (
          <Button variant="ghost" size="icon" onClick={onImport}
            className="hidden sm:flex text-zinc-400 hover:text-zinc-100" title="导入 .mgao">
            <Upload className="h-4 w-4" />
          </Button>
        )}

        {/* 导出 */}
        {onExport && (
          <div className="relative hidden sm:block">
            <Button variant="ghost" size="icon"
              className="text-zinc-400 hover:text-zinc-100" title="导出"
              onClick={() => setExportOpen(o => !o)}>
              <Download className="h-4 w-4" />
            </Button>
            {exportOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                <div
                  className="absolute right-0 top-full mt-1 w-44 rounded-xl shadow-2xl py-1.5 z-20 overflow-hidden"
                  style={{
                    background: isDark ? 'rgba(12,12,22,0.98)' : '#2b241c',
                    border: isDark ? '1px solid rgba(78,216,212,0.2)' : '1px solid #4a3f30',
                    backdropFilter: 'blur(20px)',
                  }}
                >
                  {[
                    { label: '📦 .mgao（完整备份）', action: onExport },
                    { label: '📄 .txt（纯文本）',    action: onExportTxt },
                    { label: '📝 .docx（Word）',     action: onExportDocx },
                  ].map(({ label, action }) => (
                    <button key={label}
                      onClick={() => { action?.(); setExportOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs transition-colors"
                      style={{ color: isDark ? 'rgba(78,216,212,0.8)' : '#e8dcc4' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(78,216,212,0.1)' : 'rgba(255,255,255,0.1)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 主题 */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}
          className="text-zinc-400 hover:text-zinc-100" title="切换主题">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* 分隔线 */}
        <div className="w-px h-5" style={{
          background: isDark ? 'rgba(78,216,212,0.25)' : 'rgba(255,255,255,0.15)',
        }} />

        <UserMenu />
      </div>
    </header>
  );
}
