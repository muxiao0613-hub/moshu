import { useRef, useState, useCallback } from 'react';

/**
 * 抽屉「手指滑动关闭」手势。
 * - 左侧抽屉：向左滑关闭；右侧抽屉：向右滑关闭。
 * - 跟手位移，松手超过阈值或快速滑动则关闭，否则回弹。
 * - 横向滑判定为关闭手势，纵向滑让内容正常滚动。
 */
export function useDrawerSwipe(opts: { side: 'left' | 'right'; open: boolean; onClose: () => void }) {
  const { side, open, onClose } = opts;
  // mode: null=未决定, 'drag'=横向拖动, 'scroll'=纵向滚动(放弃)
  const st = useRef<{ x: number; y: number; t: number; mode: 'drag' | 'scroll' | null } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!open || e.pointerType === 'mouse') return; // 仅触摸
    st.current = { x: e.clientX, y: e.clientY, t: Date.now(), mode: null };
  }, [open]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (s.mode === null) {
      // 累计移动够 10px 才判定方向，避免误判
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.mode = Math.abs(dx) > Math.abs(dy) ? 'drag' : 'scroll';
      if (s.mode === 'drag') {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
        setDragging(true);
      }
    }
    if (s.mode !== 'drag') return;
    setDragX(side === 'left' ? Math.min(0, dx) : Math.max(0, dx)); // 只允许往关闭方向
  }, [side]);

  const end = useCallback(() => {
    const s = st.current;
    st.current = null;
    if (s?.mode === 'drag') {
      const dist = Math.abs(dragX);
      const velocity = dist / Math.max(1, Date.now() - s.t); // px/ms
      // 拖过 45px 或快速一甩（>0.3px/ms 且过了 15px）即关闭
      if (dist > 45 || (velocity > 0.3 && dist > 15)) onClose();
    }
    setDragging(false);
    setDragX(0);
  }, [dragX, onClose]);

  const handlers = { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
  const style: React.CSSProperties = {
    touchAction: 'pan-y',
    ...(dragging ? { transform: `translateX(${dragX}px)`, transition: 'none' } : {}),
  };
  return { handlers, style, dragging };
}
