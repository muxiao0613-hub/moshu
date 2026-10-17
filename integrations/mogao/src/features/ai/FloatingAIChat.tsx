import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { MessageCircle, X, Trash2, Loader2, EyeOff, ChevronLeft } from 'lucide-react';

// 懒加载：聊天面板会引入 openai SDK，仅在用户首次打开时才下载
const AIChatPanel = lazy(() => import('./AIChatPanel').then(m => ({ default: m.AIChatPanel })));

const FAB = 48;       // 气泡直径
const PANEL_W = 340;
const PANEL_H = 500;
const POS_KEY = 'mogao_aichat_pos';
const HIDDEN_KEY = 'mogao_aichat_hidden';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function defaultPos() {
  return { x: window.innerWidth - FAB - 16, y: window.innerHeight - FAB - 80 };
}

export function FloatingAIChat() {
  const [open, setOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const [hidden, setHidden] = useState(() => localStorage.getItem(HIDDEN_KEY) === '1');
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const s = JSON.parse(localStorage.getItem(POS_KEY) || ''); if (s && typeof s.x === 'number') return s; } catch { /* ignore */ }
    return defaultPos();
  });

  const drag = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  const longPress = useRef<number | null>(null);

  // 视口变化时把气泡夹回可见区域
  useEffect(() => {
    const onResize = () => setPos(p => ({ x: clamp(p.x, 8, window.innerWidth - FAB - 8), y: clamp(p.y, 8, window.innerHeight - FAB - 8) }));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const savePos = (p: { x: number; y: number }) => localStorage.setItem(POS_KEY, JSON.stringify(p));
  const setHide = (v: boolean) => { setHidden(v); localStorage.setItem(HIDDEN_KEY, v ? '1' : '0'); if (v) setOpen(false); };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };
    // 长按 550ms 隐藏
    longPress.current = window.setTimeout(() => { if (drag.current && !drag.current.moved) setHide(true); }, 550);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      drag.current.moved = true;
      if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
      setPos({
        x: clamp(drag.current.origX + dx, 8, window.innerWidth - FAB - 8),
        y: clamp(drag.current.origY + dy, 8, window.innerHeight - FAB - 8),
      });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (longPress.current) { clearTimeout(longPress.current); longPress.current = null; }
    if (drag.current) {
      if (drag.current.moved) savePos(pos);
      else setOpen(o => !o); // 没拖动 = 点击
    }
    drag.current = null;
  }, [pos]);

  // 隐藏态：屏幕右缘一个细把手，点一下恢复
  if (hidden) {
    return (
      <button
        onClick={() => setHide(false)}
        title="显示 AI 助手"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-[500] h-12 w-5 rounded-l-lg bg-ink-700/90 hover:bg-ink-600 text-white flex items-center justify-center shadow-lg"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  // 面板位置：尽量贴着气泡上方，空间不够则放下方
  const panelLeft = clamp(pos.x + FAB - PANEL_W, 8, window.innerWidth - PANEL_W - 8);
  const panelTop = pos.y - PANEL_H - 8 >= 8 ? pos.y - PANEL_H - 8 : clamp(pos.y + FAB + 8, 8, window.innerHeight - PANEL_H - 8);

  return (
    <>
      {open && (
        <div
          className="fixed z-[500] flex flex-col rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden"
          style={{ left: panelLeft, top: panelTop, width: PANEL_W, height: PANEL_H }}
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800 shrink-0">
            <span className="text-sm font-medium text-white">AI 对话</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setChatKey(k => k + 1)} title="清空对话"
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setHide(true)} title="隐藏气泡"
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
                <EyeOff className="h-4 w-4" />
              </button>
              <button onClick={() => setOpen(false)} title="关闭"
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="flex items-center justify-center h-full text-zinc-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
              <AIChatPanel key={chatKey} hideHeader />
            </Suspense>
          </div>
        </div>
      )}

      {/* 气泡容器：可拖动；点击开合；右上角小按钮隐藏 */}
      <div className="fixed z-[500] group" style={{ left: pos.x, top: pos.y, width: FAB, height: FAB }}>
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: 'none' }}
          className={`w-full h-full rounded-full shadow-lg flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing ${
            open ? 'bg-zinc-600 hover:bg-zinc-500' : 'bg-ink-700 hover:bg-ink-600'
          } text-white`}
          title="AI 对话（按住可拖动）"
        >
          {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        </button>
        {/* 隐藏按钮：始终可见，hover 更明显 */}
        <button
          onClick={(e) => { e.stopPropagation(); setHide(true); }}
          title="隐藏 AI 助手"
          className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-zinc-700 text-white border-2 border-white dark:border-zinc-900 flex items-center justify-center shadow opacity-80 hover:opacity-100 hover:bg-zinc-600 transition-opacity"
        >
          <EyeOff className="h-2.5 w-2.5" />
        </button>
      </div>
    </>
  );
}
