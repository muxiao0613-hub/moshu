/**
 * 人设提炼面板（完善台 › 人物档案 的入口，也可从对白演练里直接带素材进来）。
 *
 * 职责：拿一段素材（某章正文 / 粘贴的片段 / 刚生成的对白稿）→ AI 按档案字段输出人物特点草稿
 * → **作者逐项确认、可改** → 写回人物档案。
 *
 * 为什么要作者确认而不是直接写入：模型给的概括会把「他做过什么」写成「他是什么样的人」，
 * 这一步是**判断**，判断权在作者手上；直接入库等于把 AI 的理解固化成人物设定。
 * 素材没体现的字段在这里根本不出现，避免用空值覆盖作者写过的东西。
 *
 * 依赖方向：只依赖 @/api 取数、@/features/ai/aiService 门面、同目录纯逻辑 traitDraft 与 trait/ 子目录。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, Square, X } from 'lucide-react';
import { getChapter, getChapters, getCharacter, saveCharacter } from '@/api';
import {
  AIAbortError,
  MAX_TRAIT_SOURCE_CHARS,
  extractCharacterTraits,
  stripHtml,
} from '@/features/ai/aiService';
import { trunc } from '@/shared/lib/text';
import { cn, getAIErrorMessage } from '@/shared/lib/utils';
import type { Character, Project } from '@/shared/types';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { buildCharacterPatch, type TraitTextFieldKey } from './traitDraft';
import { buildCards, type TraitCard } from './trait/cards';
import { TraitCardView } from './trait/TraitCardView';

/** 素材下限：低于这个长度谈不上「提炼」，只会让模型硬编 */
const MIN_TRAIT_SOURCE_CHARS = 200;

export interface TraitSource {
  text: string;
  label: string;
  kind?: 'chapter' | 'roleplay' | 'paste';
  sourceChapterIds?: string[];
  effectiveOrder?: number;
}

interface CharacterTraitPanelProps {
  projectId: string;
  project: Project | null;
  characters: Character[];
  /** 已经有的素材（如刚生成的对白稿）：给了就不显示来源选择器 */
  source?: TraitSource | null;
  onSaved: () => void | Promise<void>;
  onClose?: () => void;
}

export function CharacterTraitPanel({ projectId, project, characters, source, onSaved, onClose }: CharacterTraitPanelProps) {
  const [mode, setMode] = useState<'chapter' | 'paste'>('chapter');
  const [chapters, setChapters] = useState<{ id: string; title: string }[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [pasted, setPasted] = useState('');
  const [instruction, setInstruction] = useState('');
  const [cards, setCards] = useState<TraitCard[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [error, setError] = useState('');
  const [extractedSource, setExtractedSource] = useState<TraitSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getChapters(projectId)
      .then(list => setChapters(list.map(c => ({ id: c.id, title: c.title || '未命名' }))))
      .catch(() => { /* 取不到章节只影响「从章节取」这一种来源，粘贴仍然可用 */ });
  }, [projectId]);

  /** 素材文本：面板自带来源时直接用，否则按选择去拉章节正文 / 用粘贴内容 */
  const resolveSource = useCallback(async (): Promise<TraitSource | null> => {
    if (source) return source;
    if (mode === 'paste') {
      return pasted.trim() ? { text: pasted.trim(), label: '作者粘贴的片段', kind: 'paste' } : null;
    }
    if (!chapterId) return null;
    const chapter = await getChapter(chapterId, projectId);
    const text = stripHtml(chapter?.content ?? '').trim();
    if (!text) return null;
    const index = chapters.findIndex(c => c.id === chapterId);
    return { text, label: `第 ${index + 1} 章《${chapter?.title || '未命名'}》正文`, kind: 'chapter', sourceChapterIds: [chapterId], effectiveOrder: chapter?.order };
  }, [source, mode, pasted, chapterId, projectId, chapters]);

  const handleExtract = async () => {
    if (!project) { setError('作品信息还没加载完，稍后再试'); return; }
    let picked: TraitSource | null = null;
    try {
      picked = await resolveSource();
    } catch {
      setError('章节正文没取到，请重试或改用「粘贴片段」');
      return;
    }
    if (!picked) { setError('先选一章或粘贴一段素材'); return; }
    if (picked.text.length < MIN_TRAIT_SOURCE_CHARS) {
      setError(`素材太短（${picked.text.length} 字），至少 ${MIN_TRAIT_SOURCE_CHARS} 字才提炼得出特点`);
      return;
    }

    setExtracting(true);
    setError('');
    setCards([]);
    setExtractedSource(picked);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const drafts = await extractCharacterTraits({
        project,
        characters,
        source: picked.text,
        sourceLabel: picked.label,
        instruction: instruction.trim() || undefined,
        signal: controller.signal,
      });
      const built = buildCards(drafts, characters);
      setCards(built);
      if (built.length === 0) setError('没提炼出人物，换一段更完整、人物出场更多的素材再试');
    } catch (e) {
      if (e instanceof AIAbortError) toast.info('已停止提炼');
      else setError(getAIErrorMessage(e, '提炼失败，请重试'));
    } finally {
      abortRef.current = null;
      setExtracting(false);
    }
  };

  const patchCard = (index: number, patch: Partial<TraitCard>) => {
    setCards(prev => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const saveCard = useCallback(async (index: number): Promise<boolean> => {
    const card = cards[index];
    const character = characters.find(c => c.id === card.characterId);
    if (!character) { setError(`「${card.draftName}」不在人物档案里，先新建这个人物再保存`); return false; }

    const fields: Partial<Record<TraitTextFieldKey, string>> = {};
    for (const f of card.fields) if (f.enabled && f.value.trim()) fields[f.key] = f.value;
    const { patch, unmatched } = buildCharacterPatch(character, fields, card.relationsText, characters);
    if (Object.keys(patch).length === 0) { setError(`「${card.draftName}」没有勾选任何要保存的内容`); return false; }

    patchCard(index, { saving: true });
    try {
      const latest = await getCharacter(character.id, projectId);
      if (!latest) throw new Error('人物已删除');
      if (Object.keys(fields).some(key => latest[key as TraitTextFieldKey] !== character[key as TraitTextFieldKey])
        || JSON.stringify(latest.relationships) !== JSON.stringify(character.relationships)) {
        throw new Error('人物档案刚被修改，请刷新后重新核对，避免覆盖新设定');
      }
      const provenance = extractedSource ? {
        id: crypto.randomUUID(), sourceLabel: extractedSource.label, kind: extractedSource.kind ?? 'paste',
        sourceChapterIds: extractedSource.sourceChapterIds ?? [], sourceExcerpt: extractedSource.text.slice(-1600),
        fields: Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)])),
        confirmedAt: new Date().toISOString(),
      } : null;
      await saveCharacter({ id: character.id, projectId, ...patch, profileEffectiveOrder: extractedSource?.effectiveOrder ?? 0,
        profileEvidence: provenance ? [...(latest.profileEvidence ?? []), provenance] : latest.profileEvidence });
      patchCard(index, { saving: false, saved: true });
      toast.success(`已保存「${character.name}」的 ${Object.keys(patch).length} 项特点`);
      if (unmatched.length > 0) toast.info(`「${unmatched.join('、')}」不在人物档案里，这几条关系没有保存`);
      await onSaved();
      return true;
    } catch (e) {
      // 保存失败必须提示：静默失败会让作者以为人设已经存上了
      patchCard(index, { saving: false });
      setError((e as Error).message || `「${card.draftName}」保存失败，请重试`);
      return false;
    }
  }, [cards, characters, projectId, onSaved, extractedSource]);

  const handleSaveAll = async () => {
    const targets = cards.map((c, i) => ({ c, i })).filter(({ c }) => c.characterId && !c.saved);
    if (targets.length === 0) { setError('没有可保存的人物（档案里没有的名字要先建人物）'); return; }
    setSavingAll(true);
    setError('');
    let ok = 0;
    for (const { i } of targets) {
      if (await saveCard(i)) ok += 1;
    }
    setSavingAll(false);
    if (ok > 0) toast.success(`已保存 ${ok} 个人物的特点`);
  };

  const sourcePreview = source
    ? `${source.label}（${source.text.replace(/\s/g, '').length} 字）`
    : mode === 'paste'
      ? pasted.trim() ? `已粘贴 ${pasted.replace(/\s/g, '').length} 字` : '还没粘贴内容'
      : chapters.length === 0 ? '这部作品还没有章节' : '按所选章节的正文提炼';

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-ink-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">人设提炼</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            从正文或一段对白里，把这个人的性格、目标、经历、能力和关系总结出来，改好再存进人物档案 ——
            这些字段会一起进写作 prompt，直接影响后面怎么写他。素材最多读 {MAX_TRAIT_SOURCE_CHARS} 字。
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

      {!source && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">素材来源</label>
            <div className="flex gap-1">
              {([['chapter', '从章节取'], ['paste', '粘贴片段']] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[11px] border transition-colors',
                    mode === value
                      ? 'bg-ink-600 text-white border-ink-600'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-ink-300'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-zinc-400">{sourcePreview}</span>
          </div>
          {mode === 'chapter' ? (
            <Select value={chapterId} onChange={e => setChapterId(e.target.value)} className="text-sm">
              <option value="">选择一章</option>
              {chapters.map((c, i) => <option key={c.id} value={c.id}>第 {i + 1} 章 {c.title}</option>)}
            </Select>
          ) : (
            <Textarea
              value={pasted}
              onChange={e => setPasted(e.target.value)}
              rows={6}
              placeholder="把一段正文或对白粘进来（例如从别处拿到的片段、自己手写的场景）"
              className="text-sm leading-relaxed"
            />
          )}
        </div>
      )}

      {source && (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-900/50 p-2 text-[11px] text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-600 dark:text-zinc-300">{sourcePreview}</p>
          <p className="line-clamp-3">{trunc(source.text, 240)}</p>
        </div>
      )}

      <Textarea
        value={instruction}
        onChange={e => setInstruction(e.target.value)}
        placeholder="额外要求（可选）：例如「只总结反派，重点写他的恐惧」"
        rows={1}
        className="text-sm resize-none"
      />

      <div className="flex gap-2">
        <Button onClick={handleExtract} disabled={extracting} size="sm" className="gap-1.5">
          {extracting
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />提炼中…</>
            : <><Sparkles className="h-3.5 w-3.5" />提炼人设</>}
        </Button>
        {extracting && (
          <Button onClick={() => abortRef.current?.abort()} size="sm" variant="outline" className="gap-1.5">
            <Square className="h-3.5 w-3.5" />停止
          </Button>
        )}
        {cards.length > 0 && (
          <Button onClick={handleSaveAll} disabled={savingAll} size="sm" variant="outline" className="gap-1.5 ml-auto">
            {savingAll
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />保存中…</>
              : <><Check className="h-3.5 w-3.5" />全部存到档案</>}
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {cards.length > 0 && (
        <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-700 pt-3">
          {cards.map((card, i) => (
            <TraitCardView
              key={card.key}
              card={card}
              onToggleField={key => patchCard(i, {
                fields: card.fields.map(f => (f.key === key ? { ...f, enabled: !f.enabled } : f)),
              })}
              onFieldChange={(key, value) => patchCard(i, {
                fields: card.fields.map(f => (f.key === key ? { ...f, value } : f)),
              })}
              onRelationsChange={value => patchCard(i, { relationsText: value })}
              onSave={() => saveCard(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
