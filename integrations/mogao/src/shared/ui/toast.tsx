/**
 * 轻量全局 Toast 通知系统
 * 用法：
 *   import { toast } from '@/shared/ui/toast';
 *   toast.success('保存成功');
 *   toast.error('操作失败：' + msg);
 *   toast.info('提示信息');
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

let _counter = 0;
const _listeners: Array<(items: ToastItem[]) => void> = [];
let _items: ToastItem[] = [];

function notify(items: ToastItem[]) {
  _items = items;
  _listeners.forEach(fn => fn(items));
}

function add(type: ToastType, message: string, duration = 3500) {
  const id = ++_counter;
  notify([..._items, { id, type, message }]);
  setTimeout(() => {
    notify(_items.filter(t => t.id !== id));
  }, duration);
}

export const toast = {
  success: (msg: string, duration?: number) => add('success', msg, duration),
  error:   (msg: string, duration?: number) => add('error',   msg, duration ?? 5000),
  info:    (msg: string, duration?: number) => add('info',    msg, duration),
};

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
  error:   <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
  info:    <Info className="h-4 w-4 text-blue-500 shrink-0" />,
};

const BG: Record<ToastType, string> = {
  success: 'bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800',
  error:   'bg-red-50   dark:bg-red-950/40   border-red-200   dark:border-red-800',
  info:    'bg-blue-50  dark:bg-blue-950/40  border-blue-200  dark:border-blue-800',
};

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _listeners.push(setItems);
    return () => {
      const idx = _listeners.indexOf(setItems);
      if (idx !== -1) _listeners.splice(idx, 1);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {items.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm text-zinc-800 dark:text-zinc-100 animate-in slide-in-from-bottom-2 duration-200 ${BG[t.type]}`}
        >
          {ICONS[t.type]}
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => notify(_items.filter(i => i.id !== t.id))}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 mt-0.5 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
