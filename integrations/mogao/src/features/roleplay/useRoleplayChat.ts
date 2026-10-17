/** 角色对话编排：小说依据 → 流式回应 → 本地会话；已确认特点由人设面板独立写回。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AIAbortError, roleplayTurn } from '@/features/ai/aiService';
import { useAuth } from '@/features/auth/AuthContext';
import { transcriptOf, turnsOf } from '@/shared/lib/roleplay';
import type { RoleplayMessage, RoleplayTurn } from '@/shared/lib/roleplay';
import { getAIErrorMessage } from '@/shared/lib/utils';
import type { Character, PlotThread, Project, RagChunk } from '@/shared/types';
import { toast } from '@/shared/ui/toast';
import { loadRoleplayKnowledge } from './knowledge';
import { readChatSession, writeChatSession } from './session';

export interface RoleplayChatOptions {
  project: Project | null;
  characters: Character[];
  cast: Character[];
  scene: string;
  writerRole?: string;
  instruction?: string;
  threads?: PlotThread[];
  conversationMode?: 'author' | 'scene';
  throughOrder?: number;
}
export interface RoleplayChat {
  messages: RoleplayMessage[];
  turns: RoleplayTurn[];
  sources: RagChunk[];
  notices: string[];
  streaming: boolean;
  error: string;
  setError: (value: string) => void;
  send: (text: string) => void;
  open: () => void;
  stop: () => void;
  reset: () => void;
  transcript: (authorLabel?: string) => string;
}

export function useRoleplayChat({ project, characters, cast, scene, writerRole, instruction, threads,
  conversationMode = 'author', throughOrder }: RoleplayChatOptions): RoleplayChat {
  const { user } = useAuth();
  const key = `mogao_chat:${user?.id ?? 'guest'}:${project?.id ?? ''}:${cast.map(c => c.id).sort().join(',')}:${conversationMode}:${writerRole ?? ''}:${throughOrder ?? 'latest'}`;
  const [session, setSession] = useState<{ key: string; messages: RoleplayMessage[] }>({ key: '', messages: [] });
  const messages = useMemo(() => session.key === key ? session.messages : [], [session, key]);
  const [notices, setNotices] = useState<string[]>([]);
  const [sources, setSources] = useState<RagChunk[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);
  const runningRef = useRef(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    abortRef.current?.abort();
    epochRef.current += 1;
    runningRef.current = false;
    setStreaming(false); setError(''); setSources([]); setNotices([]);
    setSession({ key, messages: readChatSession(key) });
    return () => { abortRef.current?.abort(); epochRef.current += 1; };
  }, [key]);
  useEffect(() => {
    if (session.key !== key || !project || !cast.length) return;
    if (!writeChatSession(key, messages) && !warnedRef.current) {
      warnedRef.current = true;
      toast.error('对话本地保存失败，请复制需要保留的内容');
    }
  }, [session.key, key, messages, project, cast.length]);

  const turns = useMemo(() => turnsOf(messages, characters), [messages, characters]);
  const runTurn = useCallback(async (history: RoleplayMessage[]) => {
    if (runningRef.current) return;
    if (!project) { setError('作品信息还没加载完，稍后再试'); return; }
    if (!cast.length) { setError('先选 1–3 个角色'); return; }
    runningRef.current = true;
    setStreaming(true); setError('');
    const epoch = ++epochRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const at = history.length;
    setSession({ key, messages: [...history, { role: 'character', text: '' }] });
    const updateMessages = (fn: (previous: RoleplayMessage[]) => RoleplayMessage[]) => {
      if (epoch !== epochRef.current) return;
      setSession(prev => prev.key === key ? { key, messages: fn(prev.messages) } : prev);
    };
    try {
      const question = history.slice(-2).map(m => m.text).join('\n');
      const knowledge = await loadRoleplayKnowledge(project.id, cast.map(c => c.id), `${scene} ${question}`, throughOrder);
      if (epoch !== epochRef.current || controller.signal.aborted) return;
      setSources(knowledge.sources); setNotices(knowledge.notices ?? []);
      await roleplayTurn({
        project: knowledge.project, characters: knowledge.cast, allCharacters: knowledge.characters,
        sources: knowledge.sources, facts: knowledge.facts, storyBible: knowledge.storyBible,
        memoryContext: knowledge.memoryContext,
        conversationMode, scene: scene.trim() || '作者与角色交流，探索其选择、动机和个性。',
        history, writerRole, instruction: instruction?.trim() || undefined, threads,
        onChunk: c => updateMessages(prev => prev.map((m, i) => i === at ? { ...m, text: m.text + c } : m)),
        signal: controller.signal,
      });
    } catch (e) {
      if (epoch !== epochRef.current) return;
      if (e instanceof AIAbortError) {
        updateMessages(prev => prev.map((m, i) => i === at ? { ...m, text: e.partial || m.text } : m));
        toast.info('已停止，已生成的部分留着');
      } else { setError(getAIErrorMessage(e, '这一轮没聊下去，请重试')); }
    } finally {
      updateMessages(prev => prev.filter((m, i) => !(i === at && !m.text.trim())));
      if (epoch === epochRef.current) { runningRef.current = false; abortRef.current = null; setStreaming(false); }
    }
  }, [project, cast, scene, writerRole, instruction, threads, conversationMode, throughOrder, key]);

  const send = useCallback((text: string) => {
    if (!text.trim() || runningRef.current) return;
    void runTurn([...messages, { role: 'author', speaker: writerRole, text: text.trim() }]);
  }, [messages, writerRole, runTurn]);
  const open = useCallback(() => { void runTurn(messages); }, [messages, runTurn]);
  const stop = useCallback(() => { abortRef.current?.abort(); }, []);
  const reset = useCallback(() => {
    abortRef.current?.abort(); epochRef.current += 1; runningRef.current = false;
    setStreaming(false); setSession({ key, messages: [] }); setSources([]); setNotices([]); setError('');
  }, [key]);
  const transcript = useCallback((authorLabel?: string) => transcriptOf(messages, characters, authorLabel), [messages, characters]);
  return { messages, turns, sources, notices, streaming, error, setError, send, open, stop, reset, transcript };
}
