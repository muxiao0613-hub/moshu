/**
 * 短篇写作台 · 状态徽标：空态引导里的检查徽标（Chip）与成稿检查条目（CraftItem）。
 *
 * 在拆分中的位置：workspace 的最上层展示叶子组件，被 WritingCanvas / AiPanel 使用；对外门面是 ../ShortStoryWorkspace.tsx。
 * 依赖方向：只依赖 lucide-react，不依赖 workspace 内其它模块。
 */
import { Check, Circle, X } from 'lucide-react';

export function Chip({ ok, label, color }: { ok: boolean; label: string; color: string }) {
  return (
    <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-0.5 font-medium"
      style={ok ? { backgroundColor: `${color}15`, color } : { backgroundColor: '#f1f5f9', color: '#94a3b8' }}>
      {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

export function CraftItem({ ok, text, color }: { ok: boolean; text: string; color: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700">
      <span className="mt-0.5 h-3 w-3 rounded-full flex items-center justify-center shrink-0"
        style={ok ? { backgroundColor: `${color}20`, color } : { backgroundColor: '#f1f5f9', color: '#94a3b8' }}>
        {ok ? <Check className="h-2 w-2" /> : <Circle className="h-2 w-2" />}
      </span>
      <span>{text}</span>
    </div>
  );
}
