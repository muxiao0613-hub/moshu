/**
 * 人物对白演练面板（完善台 › 人物档案 里的入口）——像聊天一样的角色扮演。
 *
 * 这里是「写前准备」形态：选好 1–3 个角色、写一句情境，和角色一来一回地对戏，
 * 演完把台词存成语气样本（`character.voiceSamples`）。同一套聊天逻辑也用在独立的
 * 「角色扮演」页（顶部导航），两边共用 @/features/roleplay/useRoleplayChat。
 *
 * 依赖方向：只依赖 @/api 取数、@/features/ai/aiService 门面与 features/roleplay 的聊天 hook，
 * 不直接碰 service 实现。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessagesSquare, Play, ScanText, Send, Square, Trash2, X } from 'lucide-react';
import { getOutlines, getThreads } from '@/api';
import { transcriptOf } from '@/shared/lib/roleplay';
import { trunc } from '@/shared/lib/text';
import { cn } from '@/shared/lib/utils';
import { MAX_VOICE_CHARACTERS } from '@/shared/lib/voiceSample';
import type { Character, Outline, PlotThread, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { useRoleplayChat } from '../roleplay/useRoleplayChat';
import { ChatBubbles } from './drill/ChatBubbles';
import { SampleSaver } from './drill/SampleSaver';

interface VoiceDrillPanelProps {
  projectId: string;
  project: Project | null;
  characters: Character[];
  /** 保存成功后通知外部重新取数据（样本数会变） */
  onSaved: () => void | Promise<void>;
  /** 拿整场对话去做人设提炼（把「他怎么说话」之外的性格/目标也总结回档案） */
  onExtractTraits?: (text: string) => void;
  /** 收起草稿区（入口按钮的展开/收起） */
  onClose?: () => void;
}

export function VoiceDrillPanel({ projectId, project, characters, onSaved, onExtractTraits, onClose }: VoiceDrillPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scene, setScene] = useState('');
  const [instruction, setInstruction] = useState('');
  /** '' = 作者以旁白/导演身份说话；否则是作者在扮演的那个角色 id */
  const [writerRoleId, setWriterRoleId] = useState('');
  const [input, setInput] = useState('');
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [setupOpen, setSetupOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([getOutlines(projectId), getThreads(projectId)])
      .then(([o, t]) => { setOutlines(o); setThreads(t); })
      .catch(() => { /* 候选材料取不到不影响演练，作者可以手写情境 */ });
  }, [projectId]);

  const cast = useMemo(
    () => characters.filter(c => selectedIds.includes(c.id)),
    [characters, selectedIds]
  );
  const writerRole = useMemo(
    () => cast.find(c => c.id === writerRoleId) ?? null,
    [cast, writerRoleId]
  );

  const chat = useRoleplayChat({
    project,
    characters,
    cast,
    scene,
    writerRole: writerRole?.name,
    instruction,
    threads,
    conversationMode: 'scene',
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.messages]);

  /** 演练要求先有一句情境（与独立的「角色扮演」页不同：那边允许纯闲聊） */
  const guard = () => {
    if (!scene.trim()) { chat.setError('先写一句情境（或点上方的候选项）'); return false; }
    return true;
  };

  const handleSend = () => {
    if (!guard()) return;
    const text = input.trim();
    if (!text) return;
    setInput('');
    chat.send(text);
  };

  const handleOpen = () => { if (guard()) chat.open(); };

  const handleReset = () => { setInput(''); chat.reset(); };

  const toggleCharacter = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        if (writerRoleId === id) setWriterRoleId('');
        return prev.filter(x => x !== id);
      }
      if (prev.length >= MAX_VOICE_CHARACTERS) {
        chat.setError(`一次最多演练 ${MAX_VOICE_CHARACTERS} 个角色（再多就分不清谁在说话了）`);
        return prev;
      }
      chat.setError('');
      return [...prev, id];
    });
  };

  /** 情境候选：从伏笔与大纲取，省得作者从零想一个场面 */
  const sceneCandidates = useMemo(() => {
    const names = cast.map(c => c.name).filter(Boolean);
    const who = names.length >= 2 ? names.slice(0, 2).join('和') : names[0] ?? '他们';
    const list: string[] = [];
    threads
      .filter(t => t.status !== 'resolved' && t.status !== 'abandoned')
      .slice(0, 3)
      .forEach(t => list.push(`围绕「${t.title}」，${who}第一次当面摊牌。`));
    outlines
      .filter(o => o.summary)
      .slice(0, 2)
      .forEach(o => list.push(`${o.title}：${trunc(o.summary, 50)}`));
    return list;
  }, [threads, outlines, cast]);

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <MessagesSquare className="h-4 w-4 text-ink-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">对白演练（角色扮演）</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            像聊天一样一来一回：你以旁白交代场面推进剧情，也可以扮演某个角色；AI 让角色们接着演。
            演完把各自说过的台词存成语气样本 —— 存下来后，这个角色上场时 AI 会照着他的说话方式写。
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            title="收起"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {setupOpen ? (
        <>
          {/* 选角色 */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1.5">
              出场角色（已选 {cast.length}/{MAX_VOICE_CHARACTERS}）
            </label>
            {characters.length === 0 ? (
              <p className="text-xs text-zinc-400">还没有人物档案，先在下面新建一个</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {characters.map(c => {
                  const active = selectedIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCharacter(c.id)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        active
                          ? 'bg-ink-600 text-white border-ink-600'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-ink-300'
                      )}
                    >
                      {c.name || '未命名'}
                      {(c.voiceSamples?.length ?? 0) > 0 && (
                        <span className={cn('ml-1', active ? 'text-white/70' : 'text-ink-500')}>
                          ·{c.voiceSamples?.length} 段
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 情境 */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1.5">情境（这场戏的起点）</label>
            <Textarea
              value={scene}
              onChange={e => setScene(e.target.value)}
              placeholder="例如：雨夜，两人在车站最后一次见面，谁都没有先开口。"
              rows={2}
              className="text-sm resize-none"
            />
            {sceneCandidates.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {sceneCandidates.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setScene(s)}
                    className="px-2 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-600 text-[11px] text-zinc-500 hover:border-ink-400 hover:text-ink-600"
                    title={s}
                  >
                    {trunc(s, 26)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 作者在这轮里是谁 */}
          <div>
            <label className="text-xs font-medium text-zinc-500 block mb-1.5">我在对话里的身份</label>
            <Select value={writerRoleId} onChange={e => setWriterRoleId(e.target.value)} className="h-8 text-xs">
              <option value="">旁白 / 导演（我说的是事实交代或剧情推进）</option>
              {cast.map(c => (
                <option key={c.id} value={c.id}>扮演 {c.name || '未命名'}</option>
              ))}
            </Select>
          </div>

          <Textarea
            value={instruction}
            onChange={e => setInstruction(e.target.value)}
            placeholder="额外要求（可选）：例如「这场是争吵，但谁都不许先让步」"
            rows={1}
            className="text-sm resize-none"
          />
        </>
      ) : (
        <button
          onClick={() => setSetupOpen(true)}
          className="text-[11px] text-zinc-500 hover:text-ink-600 dark:hover:text-ink-400"
          title="改角色、情境或身份"
        >
          情境与角色：{cast.map(c => c.name || '未命名').join('、') || '（没选角色）'} · {trunc(scene.trim() || '（没写情境）', 30)} —— 点这里修改
        </button>
      )}

      {/* 对话 */}
      <div ref={scrollRef} className="max-h-[420px] overflow-y-auto pr-1">
        <ChatBubbles messages={chat.messages} characters={characters} streaming={chat.streaming} />
      </div>

      {/* 发言框 */}
      <div className="space-y-1.5">
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={
            writerRole
              ? `你正扮演 ${writerRole.name}，说点什么（Enter 发送，Shift+Enter 换行）`
              : '以旁白 / 导演的身份写一句（Enter 发送，Shift+Enter 换行）'
          }
          rows={2}
          className="text-sm resize-none"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleSend} disabled={chat.streaming || !input.trim()} size="sm" className="gap-1.5">
            <Send className="h-3.5 w-3.5" />发送
          </Button>
          {chat.messages.length === 0 && (
            <Button onClick={handleOpen} disabled={chat.streaming} size="sm" variant="outline" className="gap-1.5">
              <Play className="h-3.5 w-3.5" />让角色先开口
            </Button>
          )}
          {chat.streaming && (
            <>
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />角色正在回应…
              </span>
              <Button onClick={chat.stop} size="sm" variant="outline" className="gap-1.5">
                <Square className="h-3.5 w-3.5" />停止
              </Button>
            </>
          )}
          {chat.messages.length > 0 && !chat.streaming && (
            <Button onClick={handleReset} size="sm" variant="ghost" className="gap-1.5 text-zinc-500">
              <Trash2 className="h-3.5 w-3.5" />清空对话
            </Button>
          )}
        </div>
      </div>

      {chat.notices.map(notice => <p key={notice} className="text-xs text-amber-600">{notice}</p>)}
        {chat.error && <p className="text-xs text-red-500">{chat.error}</p>}

      {/* 演出结果：总结人设 + 把台词存成语气样本（每个角色各存各的） */}
      {chat.turns.length > 0 && (
        <div className="space-y-3">
          {onExtractTraits && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-zinc-400">
                已经演了 {chat.turns.length} 段对白 —— 拿整场对话去总结人设，或把台词存成语气样本。
              </p>
              <Button
                onClick={() => onExtractTraits(transcriptOf(chat.messages, characters, writerRole?.name || '作者'))}
                disabled={chat.streaming}
                size="sm"
                variant="outline"
                className="gap-1.5 shrink-0"
                title="拿这场对话去总结这几个人的性格、目标与关系"
              >
                <ScanText className="h-3.5 w-3.5" />总结人设
              </Button>
            </div>
          )}
          <SampleSaver projectId={projectId} cast={cast} turns={chat.turns} onSaved={onSaved} />
        </div>
      )}
    </div>
  );
}
