import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, User, Trash2, Crown, Sword, Users, UserCheck, BarChart2, Wand2, MessagesSquare, ScanText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { getCharacters, saveCharacter, deleteCharacter, getWorldSettings, getProject, getChapters } from '@/api';
import { AIContinueDialog } from '@/features/ai/AIContinueDialog';
import { generateCharactersContinuation, type CharacterDraft } from '@/features/ai/aiService';
import type { Character, WorldSetting, Project, Chapter } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { CharacterEditor } from './CharacterEditor';
import { CharacterTraitPanel, type TraitSource } from './CharacterTraitPanel';

interface CharacterListProps {
  projectId: string;
}

const roleConfig = {
  protagonist: { label: '主角', icon: Crown, variant: 'default' as const },
  antagonist:  { label: '反派', icon: Sword, variant: 'destructive' as const },
  supporting:  { label: '配角', icon: Users, variant: 'secondary' as const },
  minor:       { label: '次要', icon: UserCheck, variant: 'outline' as const },
};

export function CharacterList({ projectId }: CharacterListProps) {
  const [editTarget, setEditTarget] = useState<Character | null>(null);
  const [aiContOpen, setAiContOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const navigate = useNavigate();
  const [traitOpen, setTraitOpen] = useState(false);
  const [traitSource, setTraitSource] = useState<TraitSource | null>(null);
  const [tab, setTab] = useState('list');

  const [characters, setCharacters] = useState<Character[]>([]);
  const [worldSettings, setWorldSettings] = useState<WorldSetting[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);

  const refresh = useCallback(async () => {
    const [c, w, p, ch] = await Promise.all([
      getCharacters(projectId),
      getWorldSettings(projectId),
      getProject(projectId),
      getChapters(projectId),
    ]);
    setCharacters(c);
    setWorldSettings(w);
    setProject(p ?? null);
    setChapters(ch);
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  // 经历覆盖：每个人物在哪些章节出现过
  const appearanceMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const char of characters) {
      map[char.id] = (char.lifeMemories ?? []).filter(m => m.status === 'confirmed' && m.claims.length)
        .sort((a, b) => a.chapterOrder - b.chapterOrder).map(m => m.chapterTitle);
    }
    return map;
  }, [characters]);

  const handleCreate = () => {
    setEditTarget({
      id: uuidv4(), projectId, name: '', aliases: [], role: 'supporting',
      appearance: '', personality: '', background: '', abilities: '',
      relationships: [], arc: '', firstAppearance: '', notes: '',
    });
  };

  const handleSave = async (character: Character) => {
    await saveCharacter(character);
    setEditTarget(null);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCharacter(deleteTarget.id, projectId);
    setDeleteTarget(null);
    await refresh();
  };

  const emptyProject = { id: projectId, title: '', genre: '', synopsis: '', createdAt: new Date(), updatedAt: new Date() };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-zinc-700 shrink-0">
        <div>
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">人物档案</h2>
          <p className="text-xs text-zinc-500 mt-0.5">共 {characters.length} 位人物 · 底色、经历与语气持续积累</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => navigate(`/roleplay/${projectId}?scene=1`)}
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={characters.length === 0}
            title={characters.length === 0 ? '先新建人物再做对白演练' : '像聊天一样和角色对戏，演完把台词存成语气样本'}
          >
            <MessagesSquare className="h-3.5 w-3.5" />对白演练
          </Button>
          <Button
            onClick={() => { setTraitSource(null); setTraitOpen(v => !v); }}
            size="sm"
            variant="outline"
            className="gap-1.5"
            title="从正文或一段对白里总结这个人物的性格、目标、经历"
          >
            <ScanText className="h-3.5 w-3.5" />人设提炼
          </Button>
          <Button onClick={() => setAiContOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />AI续写
          </Button>
          <Button onClick={handleCreate} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />新建人物
          </Button>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="px-4 sm:px-6 pt-3 pb-0 shrink-0 overflow-x-auto">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list" className="gap-1.5 text-xs">
              <User className="h-3.5 w-3.5" />档案列表
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5 text-xs">
              <BarChart2 className="h-3.5 w-3.5" />经历覆盖
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {/* 人设提炼：把人「从素材里总结回档案」，产物是人物档案字段（会进写作 prompt） */}
        {traitOpen && tab === 'list' && (
          <div className="mb-4">
            <CharacterTraitPanel
              projectId={projectId}
              project={project}
              characters={characters}
              source={traitSource}
              onSaved={refresh}
              onClose={() => setTraitOpen(false)}
            />
          </div>
        )}
        {/* 档案列表 */}
        {tab === 'list' && (
          characters.length === 0 ? (
            <div className="text-center py-16 text-zinc-400">
              <User className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-4">还没有人物档案</p>
              <Button onClick={handleCreate} size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />新建人物
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {characters.map(char => {
                const { label, icon: RoleIcon, variant } = roleConfig[char.role] ?? roleConfig.minor;
                return (
                  <div
                    key={char.id}
                    className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => setEditTarget(char)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-ink-100 dark:bg-ink-900 flex items-center justify-center">
                          <RoleIcon className="h-4 w-4 text-ink-600 dark:text-ink-400" />
                        </div>
                        <div>
                          <h3 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">{char.name || '未命名'}</h3>
                          {!!char.aliases?.length && <p className="text-xs text-zinc-400">{char.aliases.join(' / ')}</p>}
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(char); }}
                        className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-zinc-400 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Badge variant={variant} className="mb-2">{label}</Badge>
                    {char.personality && <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{char.personality}</p>}
                    {/* 已确认经历章数 */}
                    {(appearanceMap[char.id]?.length ?? 0) > 0 && (
                      <p className="text-xs text-zinc-400 mt-1.5">
                        已确认 {appearanceMap[char.id].length} 章经历
                      </p>
                    )}
                    {(char.voiceSamples?.length ?? 0) > 0 && (
                      <p className="text-xs text-ink-500 mt-1 flex items-center gap-1">
                        <MessagesSquare className="h-3 w-3" />语气样本 {char.voiceSamples?.length} 段
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* 经历覆盖 */}
        {tab === 'stats' && (
          <div className="space-y-2">
            {characters.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-12">暂无人物</p>
            ) : (
              characters
                .slice()
                .sort((a, b) => (appearanceMap[b.id]?.length ?? 0) - (appearanceMap[a.id]?.length ?? 0))
                .map(char => {
                  const appeared = appearanceMap[char.id] ?? [];
                  const total = chapters.filter(c => c.status === 'final').length;
                  const pct = total > 0 ? Math.round((appeared.length / total) * 100) : 0;
                  return (
                    <div key={char.id} className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{char.name}</span>
                          <Badge variant={roleConfig[char.role].variant} className="text-xs">{roleConfig[char.role].label}</Badge>
                        </div>
                        <span className="text-xs text-zinc-400">
                          {appeared.length} / {total} 章（{pct}%）
                        </span>
                      </div>
                      {/* 进度条 */}
                      <div className="h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-ink-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {/* 已确认经历来源章名 */}
                      {appeared.length > 0 && (
                        <p className="text-xs text-zinc-400 mt-1.5 line-clamp-2">
                          {appeared.slice(0, 8).join('、')}{appeared.length > 8 ? `…等${appeared.length}章` : ''}
                        </p>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editTarget && (
        <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
          <DialogContent onClose={() => setEditTarget(null)} className="max-w-2xl w-full">
            <CharacterEditor
              character={editTarget}
              characters={characters}
              project={project || emptyProject}
              worldSettings={worldSettings}
              onMemoryUpdated={next => setCharacters(previous => previous.map(c => c.id === next.id ? next : c))}
              onSave={handleSave}
              onCancel={() => setEditTarget(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent onClose={() => setDeleteTarget(null)} className="max-w-sm">
          <DialogHeader><DialogTitle>删除人物</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">确定删除人物「{deleteTarget?.name}」？</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI 续写人物 */}
      {aiContOpen && (
        <AIContinueDialog<CharacterDraft>
          title="AI 续写人物"
          noun="人物"
          defaultCount={3}
          maxCount={10}
          onGenerate={(instruction, count) => generateCharactersContinuation({
            project: project || emptyProject,
            existingChars: characters,
            existingWorld: worldSettings,
            instruction, count,
          })}
          renderItem={(c) => (
            <div>
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{c.name}</span>
              <span className="ml-2 text-xs text-zinc-400">
                {c.role === 'protagonist' ? '主角' : c.role === 'antagonist' ? '反派' : c.role === 'supporting' ? '配角' : '次要'}
              </span>
              <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{c.personality}</p>
            </div>
          )}
          onSave={async (drafts) => {
            for (const d of drafts) {
              await saveCharacter({
                id: uuidv4(), projectId,
                name: d.name, role: d.role,
                aliases: d.aliases || [],
                appearance: d.appearance || '',
                personality: d.personality || '',
                background: d.background || '',
                abilities: d.abilities || '',
                arc: d.arc || '',
                relationships: [],
                firstAppearance: '', notes: '',
              });
            }
            await refresh();
          }}
          onClose={() => setAiContOpen(false)}
        />
      )}
    </div>
  );
}
