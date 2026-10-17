/**
 * 角色扮演页（顶部导航「角色扮演」）——平时想和角色闲聊、对戏的地方。
 *
 * 与完善台里的「对白演练」的分工：
 * - 对白演练：写前准备，围绕某一章的情境演一场，产物是语气样本；
 * - 这个页面：独立入口，可以随时和任意作品里的角色闲聊，聊出来的东西（说话方式 → 语气样本，
 *   性格/目标/经历/关系 → 人设草稿）都写回人物档案，下次写作直接用到。
 *
 * 三栏：左 = 谁能上场（1–3 人），中 = 对话，右 = 写回档案（语气样本 + 人设提炼）。
 * 窄屏下左右两栏变成抽屉（页头上有开关），中栏始终留给对话。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessagesSquare, PenLine, RefreshCw, Users } from 'lucide-react';
import { getCharacters, getChapters, getOutlines, getProjects, getThreads } from '@/api';
import { CharacterTraitPanel } from '@/features/character/CharacterTraitPanel';
import type { TraitSource } from '@/features/character/CharacterTraitPanel';
import { TopBar } from '@/shared/layout/TopBar';
import { trunc } from '@/shared/lib/text';
import { useDragWidth } from '@/shared/lib/useDragWidth';
import { cn } from '@/shared/lib/utils';
import { MAX_VOICE_CHARACTERS } from '@/shared/lib/voiceSample';
import type { Chapter, Character, Outline, PlotThread, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { PanelResizer } from '@/shared/ui/PanelResizer';
import { toast } from '@/shared/ui/toast';
import { CharacterRail } from './CharacterRail';
import { ProfileRail } from './ProfileRail';
import { ProjectPicker } from './ProjectPicker';
import { ProjectSwitcher } from './ProjectSwitcher';
import { RoleplayStage } from './RoleplayStage';
import { useRoleplayChat } from './useRoleplayChat';

/** 上次聊的那部作品：只用来排序与打标记，不再自动跳转（别替作者决定去哪部作品） */
const LAST_PROJECT_KEY = 'mogao_last_project';

export function RoleplayPage() {
  const { id: paramId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [outlines, setOutlines] = useState<Outline[]>([]);
  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [throughOrder, setThroughOrder] = useState<number | undefined>();
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(() => localStorage.getItem(LAST_PROJECT_KEY));

  const [castIds, setCastIds] = useState<string[]>([]);
  const [scene, setScene] = useState('');
  const [instruction, setInstruction] = useState('');
  const [writerRoleId, setWriterRoleId] = useState('');
  const [mode, setMode] = useState<'chat' | 'traits'>('chat');
  const [traitSource, setTraitSource] = useState<TraitSource | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  // 两栏都能拖：左栏往右长，右栏往左长，双击把手恢复默认（与写作台同一套手感）
  const leftWidth = useDragWidth({
    storageKey: 'mogao_roleplay_cast_width', fallback: 240, min: 200, max: 420, grow: 'grow-right',
  });
  const rightWidth = useDragWidth({
    storageKey: 'mogao_roleplay_profile_width', fallback: 320, min: 260, max: 560, grow: 'grow-left',
  });

  const projectId = paramId ?? '';

  // 作品列表：既用于「选一部作品」，也用于把 URL 里的 id 解析成作品对象
  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => { /* 取不到就让作者自己点「书架」 */ })
      .finally(() => setProjectsLoaded(true));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem(LAST_PROJECT_KEY, projectId);
    setLastProjectId(projectId);
    setCastIds([]);
    setScene('');
    setInstruction(searchParams.get('scene') === '1' ? '这是作者安排的对白演练。围绕给定场景对戏，保持角色档案中的语气、知情和经历；演练结果经作者确认才补充人设。' : '');
    setWriterRoleId('');
    setMode('chat');
    setTraitSource(null);
    setThroughOrder(undefined);
    setCharacters([]); setOutlines([]); setThreads([]); setChapters([]);
    setLeftOpen(false);
    setRightOpen(false);

    let dropped = false;
    setLoadingCharacters(true);
    Promise.all([getCharacters(projectId), getOutlines(projectId), getThreads(projectId), getChapters(projectId)])
      .then(([cs, os, ts, chs]) => {
        if (dropped) return;
        setCharacters(cs);
        setOutlines(os);
        setThreads(ts);
        setChapters(chs);
      })
      .catch(() => { if (!dropped) { setCharacters([]); setOutlines([]); setThreads([]); toast.error('角色与小说依据读取失败，请刷新后重试'); } })
      .finally(() => { if (!dropped) setLoadingCharacters(false); });
    return () => { dropped = true; };
  }, [projectId]);

  // 作品的元信息（标题/类型）可能还没进列表，单独兜一次
  useEffect(() => {
    setProject(projects.find(p => p.id === projectId) ?? null);
  }, [projectId, projects]);

  const cast = useMemo(() => characters.filter(c => castIds.includes(c.id)), [characters, castIds]);
  const writerRole = useMemo(() => cast.find(c => c.id === writerRoleId) ?? null, [cast, writerRoleId]);

  const chat = useRoleplayChat({
    project,
    characters,
    cast,
    scene,
    writerRole: writerRole?.name,
    instruction,
    threads,
    conversationMode: writerRoleId ? 'scene' : 'author',
    throughOrder,
  });

  const reloadCharacters = useCallback(async () => {
    if (!projectId) return;
    try { setCharacters(await getCharacters(projectId)); } catch { /* 取不到就保持原样，不打断对话 */ }
  }, [projectId]);

  const toggleCast = (id: string) => {
    setCastIds(prev => {
      if (prev.includes(id)) {
        if (writerRoleId === id) setWriterRoleId('');
        return prev.filter(x => x !== id);
      }
      if (prev.length >= MAX_VOICE_CHARACTERS) {
        chat.setError(`一次最多 ${MAX_VOICE_CHARACTERS} 个角色同时上场（再多就分不清谁在说话了）`);
        return prev;
      }
      chat.setError('');
      return [...prev, id];
    });
  };

  /** 情境候选：伏笔与大纲，省得作者从零想一个场面 */
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

  const startExtract = () => {
    setTraitSource({
      text: chat.transcript(writerRole?.name || '作者'),
      label: `角色扮演聊天记录（${chat.turns.length} 段对白）`,
      kind: 'roleplay', effectiveOrder: throughOrder ?? 0,
      sourceChapterIds: chat.sources.map(s => s.chapterId),
    });
    setMode('traits');
  };

  // 还没选作品：作品选择屏（上次聊过的排最前，不自动跳转）
  if (!projectId) {
    return (
      <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
        <TopBar />
        <ProjectPicker
          projects={projects}
          loaded={projectsLoaded}
          lastProjectId={lastProjectId}
          onOpen={id => navigate(`/roleplay/${id}`)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-900">
      <TopBar projectTitle={project?.title} />

      {/* 页头：换作品 + 窄屏抽屉开关 */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 md:px-4">
        <button
          onClick={() => setLeftOpen(true)}
          className="md:hidden flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="选择上场角色"
        >
          <Users className="h-3.5 w-3.5" />
          {cast.length > 0 ? `角色 ${cast.length}` : '角色'}
        </button>

        <MessagesSquare className="hidden md:block h-4 w-4 text-ink-500 shrink-0" />
        <ProjectSwitcher
          project={project}
          projectId={projectId}
          projects={projects}
          lastProjectId={lastProjectId}
          onSelect={id => navigate(`/roleplay/${id}`)}
        />
        <span className="hidden lg:inline text-[11px] text-zinc-400 truncate">
          根据正文里的经历和角色对话，聊出的新特点经你确认后用于后续写作
        </span>

        <div className="flex-1" />

        <span className={cn('hidden sm:inline text-[11px]', cast.length > 0 ? 'text-ink-600 dark:text-ink-400' : 'text-zinc-400')}>
          上场 {cast.length}/{MAX_VOICE_CHARACTERS}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-zinc-500"
          onClick={reloadCharacters}
          title="重新读取这部作品的人物档案"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">刷新角色</span>
        </Button>
        <button
          onClick={() => setRightOpen(true)}
          className="xl:hidden flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="写回档案"
        >
          <PenLine className="h-3.5 w-3.5" />档案
        </button>
      </div>

      <div className="relative flex flex-1 min-h-0">
        {(leftOpen || rightOpen) && (
          <div
            className="absolute inset-0 z-30 bg-black/20"
            onClick={() => { setLeftOpen(false); setRightOpen(false); }}
          />
        )}

        <CharacterRail
          projectId={projectId}
          characters={characters}
          castIds={castIds}
          onToggle={toggleCast}
          maxCast={MAX_VOICE_CHARACTERS}
          loading={loadingCharacters}
          width={leftWidth.width}
          className={cn(
            leftOpen ? 'absolute inset-y-0 left-0 z-40 flex shadow-2xl' : 'hidden',
            'md:static md:z-auto md:flex md:shadow-none'
          )}
        />
        <PanelResizer handle={leftWidth} label="调整角色栏宽度" />

        {mode === 'traits' ? (
          <section className="flex-1 min-w-0 overflow-y-auto p-4">
            <div className="mx-auto max-w-3xl space-y-3">
              <button
                onClick={() => setMode('chat')}
                className="text-xs text-zinc-500 hover:text-ink-600 dark:hover:text-ink-400"
              >
                ← 回到对话（提炼结果还没保存的会丢）
              </button>
              <CharacterTraitPanel
                projectId={projectId}
                project={project}
                characters={characters}
                source={traitSource}
                onSaved={reloadCharacters}
                onClose={() => setMode('chat')}
              />
            </div>
          </section>
        ) : (
          <section className="flex flex-1 min-w-0 flex-col">
            {loadingCharacters && (
              <p className="px-4 py-2 text-[11px] text-zinc-400">正在读取人物档案…</p>
            )}
            <RoleplayStage
              projectId={projectId}
              hasCharacters={characters.length > 0}
              characters={characters}
              cast={cast}
              messages={chat.messages}
              streaming={chat.streaming}
              scene={scene}
              onSceneChange={setScene}
              instruction={instruction}
              onInstructionChange={setInstruction}
              writerRoleId={writerRoleId}
              onWriterRoleChange={setWriterRoleId}
              sceneCandidates={sceneCandidates}
              chapters={chapters}
              throughOrder={throughOrder}
              onThroughOrderChange={setThroughOrder}
              onSend={chat.send}
              onOpen={chat.open}
              onStop={chat.stop}
              onReset={chat.reset}
            />
            {chat.notices.map(notice => <p key={notice} className="px-4 pb-2 text-xs text-amber-600">{notice}</p>)}
            {chat.error && <p className="px-4 pb-2 text-xs text-red-500">{chat.error}</p>}
            <details className="px-4 pb-2 text-xs text-zinc-500">
              <summary>本轮档案依据：{chat.sources.length} 章已确认经历的引用 · 对话自动保留在本机</summary>
              {chat.sources.map(s => <p className="mt-2" key={s.chapterId}>第{s.chapterOrder}章《{s.chapterTitle}》：{s.excerpt}</p>)}
              <p className="mt-2">聊天中的新设定只有经你确认写入档案后，才会用于后续写作。</p>
            </details>
          </section>
        )}

        <PanelResizer handle={rightWidth} label="调整档案栏宽度" visibleFrom="xl" />
        <ProfileRail
          projectId={projectId}
          cast={cast}
          turns={chat.turns}
          streaming={chat.streaming}
          onExtract={startExtract}
          onSaved={reloadCharacters}
          width={rightWidth.width}
          className={cn(
            rightOpen ? 'absolute inset-y-0 right-0 z-40 flex shadow-2xl' : 'hidden',
            'xl:static xl:z-auto xl:flex xl:shadow-none'
          )}
        />
      </div>
    </div>
  );
}
