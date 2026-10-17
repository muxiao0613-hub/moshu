/**
 * 拖动分栏把手改变面板宽度（写作台左栏章节树 / 右栏上下文与 AI 助手）。
 *
 * 为什么单独一层：左栏和右栏只是「向哪边长」不同，其余完全一样 ——
 * 起始宽度、拖动位移、上下限、窗口占比上限、localStorage 记忆、双击复位。
 * 抽成 hook 后两处共用一份实现，改钳制逻辑不会只改到一边。
 *
 * 落盘时机：只在松手时写 localStorage（拖动过程每帧都写没必要）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** 把手贴在面板哪一侧：左栏的把手在右边（向右拖变宽），右栏的把手在左边（向左拖变宽）。 */
export type PanelGrow = 'grow-right' | 'grow-left';

export interface DragWidthOptions {
  /** localStorage key，按面板区分，如 `mogao_right_panel_width`。 */
  storageKey: string;
  fallback: number;
  min: number;
  /** 面板自身允许的最大宽度；实际还会受窗口宽度限制（见 `MAX_VIEWPORT_RATIO`）。 */
  max: number;
  grow: PanelGrow;
}

export interface DragWidthHandle {
  width: number;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  /** 双击把手复位成默认宽度。 */
  reset: () => void;
}

/** 面板最多占窗口宽度的这个比例，避免把正文挤到看不见。 */
const MAX_VIEWPORT_RATIO = 0.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useDragWidth({ storageKey, fallback, min, max, grow }: DragWidthOptions): DragWidthHandle {
  const [width, setWidth] = useState(() => {
    if (typeof window === 'undefined') return fallback;
    const saved = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(saved) && saved > 0 ? clamp(saved, min, max) : fallback;
  });
  const [dragging, setDragging] = useState(false);

  const startRef = useRef({ x: 0, width: fallback });
  const widthRef = useRef(width);
  widthRef.current = width;

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, width: widthRef.current };
    setDragging(true);
  }, []);

  const reset = useCallback(() => {
    setWidth(fallback);
    window.localStorage.setItem(storageKey, String(fallback));
  }, [fallback, storageKey]);

  useEffect(() => {
    if (!dragging) return;
    const limit = Math.max(min, Math.min(max, Math.round(window.innerWidth * MAX_VIEWPORT_RATIO)));

    const onMove = (e: PointerEvent) => {
      const moved = e.clientX - startRef.current.x;
      const delta = grow === 'grow-right' ? moved : -moved;
      setWidth(clamp(startRef.current.width + delta, min, limit));
    };
    const onUp = () => {
      setDragging(false);
      window.localStorage.setItem(storageKey, String(widthRef.current));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // 拖动期间锁住整页指针形态：光标不会在划过正文时变回文本光标，也不会选中文字
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, grow, min, max, storageKey]);

  return { width, dragging, onPointerDown, reset };
}
