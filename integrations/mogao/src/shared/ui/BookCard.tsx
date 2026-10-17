import { Globe, Lock, Pencil, Download, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface BookCardAction {
  /** 是否已公开；后端字段可能是 undefined（旧数据没写过），按未公开处理 */
  isPublic?: boolean;
  onPublish: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDownload: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

interface BookCardProps extends BookCardAction {
  title: string;
  meta: string;
  onClick: () => void;
  coverClassName?: string;
  coverStyle?: React.CSSProperties;
  children?: React.ReactNode;
}

export function BookCard({
  title, meta, onClick,
  isPublic, onPublish, onEdit, onDownload, onDelete,
  coverClassName, coverStyle, children,
}: BookCardProps) {
  return (
    <div className="cursor-pointer group flex flex-col" onClick={onClick}>
      {/* 封面 */}
      <div
        className={cn(
          'aspect-[3/4] rounded-xl mb-2.5 relative overflow-hidden shadow-sm group-hover:shadow-lg transition-all',
          coverClassName,
        )}
        style={coverStyle}
      >
        {/* 书脊阴影 */}
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-black/15" />

        {/* 封面主内容 */}
        {children}

        {/* 已发布标记 */}
        {isPublic && (
          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
            <Globe className="h-2.5 w-2.5 text-white" />
          </div>
        )}

        {/* hover 操作条 */}
        <div className="absolute bottom-0 left-0 right-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
          <div
            className="flex items-center justify-around px-1 py-1.5 bg-black/70 backdrop-blur-sm"
            onClick={e => e.stopPropagation()}
          >
            {isPublic && <button
              onClick={onPublish}
              className={cn('p-1 rounded transition-colors', isPublic ? 'text-emerald-400 hover:text-emerald-300' : 'text-white/70 hover:text-white')}
              title={isPublic ? '取消公开' : '公开作品'}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>}
            <button onClick={onEdit} className="p-1 rounded text-white/70 hover:text-white transition-colors" title="编辑">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDownload} className="p-1 rounded text-white/70 hover:text-white transition-colors" title="导出">
              <Download className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="p-1 rounded text-red-400/80 hover:text-red-300 transition-colors" title="删除">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 标题 + 元信息 */}
      <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-1 group-hover:text-ink-600 dark:group-hover:text-ink-400 transition-colors">
        {title}
      </h3>
      <p className="text-[10px] text-zinc-400 mt-0.5">{meta}</p>
    </div>
  );
}
