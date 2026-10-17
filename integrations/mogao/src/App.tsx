/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { OnboardingProvider } from '@/shared/contexts/OnboardingContext';
import { ThemeProvider, useTheme } from '@/shared/contexts/ThemeContext';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { FloatingAIChat } from '@/features/ai/FloatingAIChat';
import { ToastContainer } from '@/shared/ui/toast';
import { legacySectionPath } from '@/shared/lib/workRoutes';

// 路由级懒加载：编辑器 / AI / 关系图 / 导出等重依赖按需加载，首屏只下当前页
const ProjectList         = lazy(() => import('@/features/project/ProjectList').then(m => ({ default: m.ProjectList })));
const ProjectWorkspace    = lazy(() => import('@/shared/layout/ProjectWorkspace').then(m => ({ default: m.ProjectWorkspace })));
const MaterialLibrary     = lazy(() => import('@/features/material/MaterialLibrary').then(m => ({ default: m.MaterialLibrary })));
const ShortStoryWorkspace = lazy(() => import('@/features/short-story/ShortStoryWorkspace').then(m => ({ default: m.ShortStoryWorkspace })));
const SettingsPage        = lazy(() => import('@/features/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));
const RoleplayPage        = lazy(() => import('@/features/roleplay/RoleplayPage').then(m => ({ default: m.RoleplayPage })));

function RouteFallback() {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 text-sm">
      加载中...
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-900">
        <div className="text-zinc-500 dark:text-zinc-400">加载中...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// 浮动 AI 助手只在创作相关页面显示；登录/注册/设置不显示。
// 写作台（/work/:id）右栏已有常驻上下文与 AI 面板，再挂浮动球会同时出现两个 AI 入口。
// 第 4 批已把社区（广场/阅读器）与管理后台移出写作台（见 extras/README.md）。
const HIDE_AI_CHAT = ['/login', '/register', '/project', '/settings', '/roleplay', '/work', '/short'];
const WORKBENCH_RE = /^\/work\/[^/]+(\/|$)/;

function isHiddenPath(pathname: string): boolean {
  if (HIDE_AI_CHAT.some(p => pathname === p || pathname.startsWith(p + '/'))) return true;
  return WORKBENCH_RE.test(pathname);
}

/**
 * 旧写作台地址 `/project/:id/*` 的兼容层：按 REFACTOR_PLAN.md §7.1 重定向到 `/work/:id/*`。
 * 老链接、老书签、以及任何遗漏的硬编码路径都能继续工作。
 */
function LegacyProjectRedirect() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  if (!id) return <Navigate to="/" replace />;

  const parts = pathname.replace(/^\/project\/[^/]+\/?/, '').split('/').filter(Boolean);
  return <Navigate to={legacySectionPath(id, parts[0], parts[1])} replace />;
}

/**
 * 写作台入口。
 * `/work/novel/:id`、`/work/story/:id` 曾是社区作品详情页的旧地址；
 * 社区已随第 4 批移出写作台（见 extras/README.md），这里只把老链接送回书架。
 */
function WorkbenchRoute() {
  const params = useParams<{ id: string; '*': string }>();
  if (params.id === 'novel' || params.id === 'story') {
    return <Navigate to="/" replace />;
  }
  return <ProjectWorkspace />;
}

function AppRoutes() {
  const { isDark } = useTheme();
  const { pathname } = useLocation();
  const showAIChat = !isHiddenPath(pathname);
  useEffect(()=>{localStorage.setItem("mogao_studio_location",pathname);},[pathname]);

  return (
    <div className={`h-full ${isDark ? 'dark' : ''}`}>
      <div className="h-full bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<ProtectedRoute><ProjectList /></ProtectedRoute>} />
          {/* 写作台（规范路由）与旧地址兼容层 */}
          <Route path="/work/:id/*" element={<ProtectedRoute><WorkbenchRoute /></ProtectedRoute>} />
          <Route path="/project/:id/*" element={<LegacyProjectRedirect />} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          {/* 角色扮演：独立页面（顶部导航进入），平时和角色闲聊/对戏，聊出来的东西写回人物档案 */}
          <Route path="/roleplay" element={<ProtectedRoute><RoleplayPage /></ProtectedRoute>} />
          <Route path="/roleplay/:id" element={<ProtectedRoute><RoleplayPage /></ProtectedRoute>} />
          <Route path="/materials" element={<ProtectedRoute><MaterialLibrary /></ProtectedRoute>} />
          <Route path="/short/:id" element={<ProtectedRoute><ShortStoryWorkspace /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
      {showAIChat && <FloatingAIChat />}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <ThemeProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </ThemeProvider>
      </OnboardingProvider>
    </AuthProvider>
  );
}
