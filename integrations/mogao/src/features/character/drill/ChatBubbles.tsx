/**
 * 对白演练 · 对话气泡（纯展示，无 hooks、无网络）。
 *
 * 角色的回复是一整段文本（每个角色一段，以「【名字】」开头），这里按 @/shared/lib/roleplay
 * 的规则切成气泡：一个角色一个气泡、作者一个气泡，流式生成时最后一个气泡实时变长。
 * 拆成独立文件是为了让「怎么切」与「怎么画」分开 —— 切法可单测，画法不用。
 */
import { parseRoleplay } from '@/shared/lib/roleplay';
import type { RoleplayMessage } from '@/shared/lib/roleplay';
import type { Character } from '@/shared/types';
import { cn } from '@/shared/lib/utils';

interface ChatBubblesProps {
  messages: RoleplayMessage[];
  characters: Character[];
  streaming: boolean;
}

export function ChatBubbles({ messages, characters, streaming }: ChatBubblesProps) {
  if (messages.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 p-6 text-center space-y-1">
        <p className="text-xs text-zinc-500">对话还没开始。</p>
        <p className="text-xs text-zinc-400">
          写一句旁白交代场面（例如「雨夜，车站，两人都还没开口」），或者点下面的「让角色先开口」。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((m, mi) => {
        const isLast = mi === messages.length - 1;
        if (m.role === 'author') {
          return (
            <div key={mi} className="flex justify-end">
              <div className="max-w-[85%] space-y-1">
                <p className="text-[11px] text-zinc-400 text-right">
                  {m.speaker ? `我（扮演 ${m.speaker}）` : '我（旁白 / 导演）'}
                </p>
                <div className="rounded-lg rounded-tr-none bg-ink-600/90 text-white px-3 py-2 text-sm whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            </div>
          );
        }
        const turns = parseRoleplay(m.text, characters);
        if (turns.length === 0) {
          return (
            <div key={mi} className="flex justify-start">
              <div className="max-w-[85%] rounded-lg bg-zinc-100 dark:bg-zinc-700/60 px-3 py-2 text-sm text-zinc-500">
                {streaming && isLast ? '（正在演…）' : '（这一轮没有产出内容）'}
              </div>
            </div>
          );
        }
        return (
          <div key={mi} className="space-y-3">
            {turns.map((t, ti) => {
              const growing = streaming && isLast && ti === turns.length - 1;
              return (
                <div key={ti} className="flex justify-start">
                  <div className="max-w-[85%] space-y-1">
                    <p className="text-[11px] text-zinc-500">{t.name || '（未标注）'}</p>
                    <div
                      className={cn(
                        'rounded-lg rounded-tl-none px-3 py-2 text-sm whitespace-pre-wrap',
                        'bg-zinc-100 dark:bg-zinc-700/60 text-zinc-800 dark:text-zinc-100'
                      )}
                    >
                      {t.text}
                      {growing && <span className="ml-0.5 text-ink-500 animate-pulse">▍</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
