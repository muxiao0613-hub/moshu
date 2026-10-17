import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/ui/toast';

interface AIFieldButtonProps {
  /** 点击时执行的 AI 生成函数，返回生成的文字 */
  onGenerate: () => Promise<string>;
  /** 生成完成后的回调 */
  onResult: (result: string) => void;
  className?: string;
  label?: string;
  title?: string;
}

export function AIFieldButton({ onGenerate, onResult, className, label, title }: AIFieldButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const result = await onGenerate();
      if (result) onResult(result);
    } catch (err) {
      toast.error('AI生成失败：' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={title || 'AI生成'}
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
        'text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-900/30',
        'border border-ink-200 dark:border-ink-700 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {loading
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Sparkles className="h-3 w-3" />
      }
      {label && <span>{label}</span>}
    </button>
  );
}
