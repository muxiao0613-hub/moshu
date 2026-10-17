/**
 * 角色扮演页 · 中栏（对话本体）。
 *
 * 上排是「这一场怎么开始」（角色名 + 情境 + 我在对话里的身份 + 额外要求），
 * 可以随时收起，把整屏留给对话；下面是气泡区与发言框。
 * 与完善台里的「对白演练」共用 @/features/roleplay/useRoleplayChat，所以这里的
 * 停止/失败/占位气泡行为与那边完全一致。
 *
 * 空态不空着：没选角色时给「怎么开始」的三步；选好角色还没开口时给几句示例开场白，
 * 点一下就填进发言框（不直接发，作者还能改字）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Play, Send, Settings2, Sparkles, Square, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { trunc } from '@/shared/lib/text';
import type { RoleplayMessage } from '@/shared/lib/roleplay';
import { workRefinePath } from '@/shared/lib/workRoutes';
import type { Chapter, Character } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { ChatBubbles } from '../character/drill/ChatBubbles';

interface RoleplayStageProps {
  projectId: string;
  /** 这部作品总共有几个角色：一个都没有时要引导去完善台建人 */
  hasCharacters: boolean;
  characters: Character[];
  cast: Character[];
  messages: RoleplayMessage[];
  streaming: boolean;
  scene: string;
  onSceneChange: (value: string) => void;
  instruction: string;
  onInstructionChange: (value: string) => void;
  writerRoleId: string;
  onWriterRoleChange: (value: string) => void;
  sceneCandidates: string[];
  chapters: Chapter[];
  throughOrder?: number;
  onThroughOrderChange: (value: number | undefined) => void;
  onSend: (text: string) => void;
  onOpen: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function RoleplayStage({
  projectId, hasCharacters, characters, cast, messages, streaming,
  scene, onSceneChange, instruction, onInstructionChange,
  writerRoleId, onWriterRoleChange, sceneCandidates,
  chapters, throughOrder, onThroughOrderChange,
  onSend, onOpen, onStop, onReset,
}: RoleplayStageProps) {
  const [input, setInput] = useState('');
  const [setupOpen, setSetupOpen] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // 选好角色就把光标给发言框：这个页面的主要动作是「说话」
  useEffect(() => {
    if (cast.length > 0) inputRef.current?.focus();
  }, [cast.length]);

  // 「清空」不弹窗，改成两段式：点一次变成确认，4 秒没动就复位
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const writerRole = cast.find(c => c.id === writerRoleId) ?? null;

  /** 示例开场白：作者不知道第一句写什么时，给三个可以直接改的起手式 */
  const openers = useMemo(() => {
    const names = cast.map(c => c.name || '他');
    const [a, b] = names;
    if (!a) return [];
    if (!writerRoleId) return [`${a}，你在上一章为什么作出那个选择？`, '你最怕失去什么？这影响了你哪一次行动？', '你和其他人之间，有什么还没说出口的话？'];
    const list = [`（旁白）${a}推门进来，脸色不太好看。`];
    if (b) list.push(`（旁白）${a}和${b}终于单独碰上了面。`);
    list.push(`（旁白）${a}开口前先停了两秒。`);
    return list;
  }, [cast, writerRoleId]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming || cast.length === 0) return;
    setInput('');
    onSend(text);
  };

  const showGuide = messages.length === 0;

  return (
    <section className="flex-1 min-w-0 flex flex-col">
      {/* 这一场怎么开始 */}
      <div className="border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
        <button
          onClick={() => setSetupOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs text-zinc-500 hover:text-ink-600 dark:hover:text-ink-400"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="flex-1 text-left truncate">
            {cast.length > 0 ? cast.map(c => c.name || '未命名').join('、') : '还没选角色'}
            {scene.trim() ? ` · ${trunc(scene, 40)}` : ' · 闲聊（没设情境）'}
            {writerRole ? ` · 我扮演 ${writerRole.name}` : writerRoleId ? ' · 我是旁白 / 导演' : ' · 我是作者本人'}
          </span>
          {setupOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {!setupOpen && messages.length === 0 && (
          <p className="px-4 pb-2 -mt-0.5 text-[11px] text-zinc-400">
            以作者身份聊小说里的选择与感受，也可以切换身份探索新场景。
          </p>
        )}

        {setupOpen && (
          <div className="px-4 pb-3 space-y-2.5">
            <div className="grid gap-2.5 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-500">我在对话里的身份</label>
                <Select value={writerRoleId} onChange={e => onWriterRoleChange(e.target.value)} className="h-8 text-xs">
                  <option value="">作者本人（和角色聊小说里的选择与感受）</option>
                  <option value="director">旁白 / 导演（探索一段新场景）</option>
                  {cast.map(c => (
                    <option key={c.id} value={c.id}>扮演 {c.name || '未命名'}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-zinc-500">额外要求（可选）</label>
                <Textarea
                  value={instruction}
                  onChange={e => onInstructionChange(e.target.value)}
                  placeholder="例如「这场是争吵，但谁都不许先让步」"
                  rows={1}
                  className="text-xs resize-none min-h-8"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-500">角色经历到哪里</label>
              <Select value={throughOrder ?? ''} onChange={e => onThroughOrderChange(e.target.value ? Number(e.target.value) : undefined)} className="h-8 text-xs" disabled={streaming}>
                <option value="">最新已确认经历</option>
                {chapters.map(c => <option key={c.id} value={c.order}>截至第{c.order}章《{c.title}》</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-500">情境（留空即闲聊）</label>
              <Textarea
                value={scene}
                onChange={e => onSceneChange(e.target.value)}
                placeholder="例如：深夜的修表铺，两个人都知道对方在撒谎。"
                rows={2}
                className="text-sm resize-none"
              />
              {sceneCandidates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sceneCandidates.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => onSceneChange(s)}
                      className="px-2 py-0.5 rounded border border-dashed border-zinc-300 dark:border-zinc-600 text-[11px] text-zinc-500 hover:border-ink-400 hover:text-ink-600"
                      title={s}
                    >
                      {trunc(s, 26)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 气泡区 */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {showGuide ? (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-5 space-y-3">
            {!hasCharacters ? (
              <>
                <p className="text-sm text-zinc-700 dark:text-zinc-200">这部作品还没有人物档案</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  角色扮演靠的是「这个人是什么样、怎么说话」，所以先建立角色 ——
                  至少给他们写一句性格，聊起来才不会千人一面。
                </p>
                <Link
                  to={workRefinePath(projectId, 'characters')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-ink-600 px-3 py-1.5 text-xs text-white hover:bg-ink-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />去人物档案建角色
                </Link>
              </>
            ) : cast.length === 0 ? (
              <>
                <p className="text-sm text-zinc-700 dark:text-zinc-200">先让谁上场？</p>
                <ol className="space-y-1.5 text-xs text-zinc-500 list-decimal list-inside">
                  <li>在左栏点 <strong className="font-medium text-zinc-600 dark:text-zinc-300">1–3 个角色</strong>（主角排在最前）</li>
                  <li>问角色一次选择的原因，或者直接点「让角色先开口」</li>
                  <li>聊完去右栏：台词存成语气样本，新长出来的性格写回人物档案</li>
                </ol>
              </>
            ) : (
              <>
                <p className="text-sm text-zinc-700 dark:text-zinc-200">
                  可以开始了：{cast.map(c => c.name || '未命名').join('、')}
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  直接聊他们在小说里的行动与感受；下方示例可以修改后发送。角色会直接读取档案中的已确认经历，
                  先在人物档案补齐小说经历；聊出来的新想法可在右侧提炼，确认后写回档案用于后续写作。
                </p>
                <Button onClick={onOpen} disabled={streaming} size="sm" className="gap-1.5">
                  <Play className="h-3.5 w-3.5" />让角色先开口
                </Button>
              </>
            )}
          </div>
        ) : (
          <ChatBubbles messages={messages} characters={characters} streaming={streaming} />
        )}
      </div>

      {/* 发言框 */}
      <div className="border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 space-y-2">
        {messages.length === 0 && cast.length > 0 && openers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {openers.map(s => (
              <button
                key={s}
                onClick={() => { setInput(s); inputRef.current?.focus(); }}
                className="px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-500 hover:border-ink-400 hover:text-ink-600"
                title="点一下填进发言框，你还可以改"
              >
                {trunc(s, 22)}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={cast.length === 0}
            placeholder={
              cast.length === 0
                ? '先从左栏选 1–3 个角色，他们才能开口'
                : writerRole
                  ? `你正扮演 ${writerRole.name}，说点什么（Enter 发送，Shift+Enter 换行）`
                  : writerRoleId ? '以旁白推进这一场对戏' : '直接问角色：你在那一章为什么作出那个选择？'
            }
            rows={2}
            className="text-sm resize-none flex-1"
          />
          <Button onClick={handleSend} disabled={streaming || !input.trim() || cast.length === 0} className="gap-1.5 h-9">
            <Send className="h-3.5 w-3.5" />发送
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {cast.length > 0 && (
            <Button onClick={onOpen} disabled={streaming} size="sm" variant="outline" className="gap-1.5">
              <Play className="h-3.5 w-3.5" />{messages.length === 0 ? '让角色先开口' : '让角色继续'}
            </Button>
          )}
          {streaming && (
            <>
              <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />角色正在回应…
              </span>
              <Button onClick={onStop} size="sm" variant="outline" className="gap-1.5">
                <Square className="h-3.5 w-3.5" />停止
              </Button>
            </>
          )}
          {messages.length > 0 && !streaming && (
            <Button
              onClick={() => {
                if (confirmReset) { setConfirmReset(false); onReset(); } else setConfirmReset(true);
              }}
              size="sm"
              variant="ghost"
              className={confirmReset ? 'gap-1.5 text-red-500 hover:text-red-600' : 'gap-1.5 text-zinc-500'}
            >
              <Trash2 className="h-3.5 w-3.5" />{confirmReset ? '再点一次就清空' : '清空这段对话'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
