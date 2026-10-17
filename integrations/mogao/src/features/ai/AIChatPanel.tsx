import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { saveMaterial } from '@/features/material/api';
import { toast } from '@/shared/ui/toast';
import { chatWithAI } from '@/features/ai/aiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = ['帮我想几个书名', '怎么写一个好的开头？', '主角的成长弧线怎么设计？', '如何制造悬念和伏笔？'];

export function AIChatPanel({ hideHeader = false }: { hideHeader?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const archive = async (content: string) => {
    try { await saveMaterial({ title: content.trim().slice(0, 24) || '创作问答', rawContent: content, expandedContent: '', category: '其他', tags: ['创作问答'] }); toast.success('已存为素材，可在素材库采用到作品'); }
    catch { toast.error('素材保存失败，请重试'); }
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: Message = { role: 'user', content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setLoading(true);
    setStreaming('');

    try {
      let full = '';
      await chatWithAI(history, chunk => {
        full += chunk;
        setStreaming(full);
      });
      setMessages(prev => [...prev, { role: 'assistant', content: full }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `出错了：${(e as Error).message}` }]);
    } finally {
      setStreaming('');
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-ink-500" />
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">AI 对话</span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />清空
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Bot className="h-10 w-10 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">和 AI 聊聊你的小说创作</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-ink-400 hover:text-ink-600 dark:hover:text-ink-400 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white ${
              msg.role === 'user' ? 'bg-ink-600' : 'bg-zinc-400 dark:bg-zinc-600'
            }`}>
              {msg.role === 'user'
                ? <User className="h-3.5 w-3.5" />
                : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className={`rounded-xl px-3 py-2 text-sm max-w-[82%] leading-relaxed whitespace-pre-wrap ${
              msg.role === 'user'
                ? 'bg-ink-600 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
            }`}>
              {msg.content}
              {msg.role === 'assistant' && <button className="block text-xs text-ink-600 mt-2" onClick={() => archive(msg.content)}>存为素材</button>}
            </div>
          </div>
        ))}

        {(streaming || (loading && !streaming)) && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-zinc-400 dark:bg-zinc-600 text-white">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-xl px-3 py-2 text-sm max-w-[82%] bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
              {streaming
                ? <>{streaming}<span className="inline-block w-0.5 h-3.5 bg-zinc-400 ml-0.5 animate-pulse align-middle" /></>
                : <Loader2 className="h-4 w-4 text-zinc-400 animate-spin" />}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="px-3 pb-3 pt-2 border-t border-zinc-200 dark:border-zinc-700 shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="发消息… Enter 发送，Shift+Enter 换行"
            rows={2}
            disabled={loading}
            className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-ink-500 focus:border-transparent disabled:opacity-50"
          />
          <Button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
