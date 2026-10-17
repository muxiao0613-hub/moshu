/**
 * 对白演练 · 把对话里的台词存成语气样本（每个角色各存各的）。
 *
 * 为什么按角色分开存：一场对话里每个角色说过的台词是**他自己的语感证据**，
 * 存进 `character.voiceSamples` 后只在这个角色上场时注入（见 plan/groups.ts 的人物语气组）。
 * 一次对话存给多个角色会把同一段文本重复带上，所以这里逐人预填、逐人保存。
 *
 * 作者必须先改再存：模型给的台词直接入库会把 AI 腔固化成「这个人的说话方式」。
 */
import { useState } from 'react';
import { Check, Loader2, Save, Trash2 } from 'lucide-react';
import { saveCharacter } from '@/api';
import { estimateVoiceTokens } from '@/features/ai/aiService';
import { characterTurnsText } from '@/shared/lib/roleplay';
import type { RoleplayTurn } from '@/shared/lib/roleplay';
import { trunc } from '@/shared/lib/text';
import {
  MAX_VOICE_SAMPLES,
  MAX_VOICE_CHARS,
  MIN_VOICE_SAMPLE_CHARS,
  characterVoiceText,
  clampVoiceSample,
  saveableVoiceSample,
} from '@/shared/lib/voiceSample';
import type { Character } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';

interface SampleSaverProps {
  projectId: string;
  /** 上场角色（已选的那几个） */
  cast: Character[];
  /** 整段对话里切出的所有角色发言 */
  turns: RoleplayTurn[];
  onSaved: () => void | Promise<void>;
}

export function SampleSaver({ projectId, cast, turns, onSaved }: SampleSaverProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = (character: Character) => {
    setError('');
    setEditingId(character.id);
    setDraft(clampVoiceSample(characterTurnsText(turns, character)));
  };

  const handleSave = async (character: Character) => {
    const sample = saveableVoiceSample(draft);
    if (!sample) {
      setError(`至少 ${MIN_VOICE_SAMPLE_CHARS} 字才能当语气样本（太短学不到说话方式）`);
      return;
    }
    if ((character.voiceSamples?.length ?? 0) >= MAX_VOICE_SAMPLES) {
      setError(`${character.name} 的样本已满 ${MAX_VOICE_SAMPLES} 段，先删掉一段再存`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveCharacter({
        id: character.id,
        projectId,
        voiceSamples: [...(character.voiceSamples ?? []), sample].slice(0, MAX_VOICE_SAMPLES),
      });
      toast.success(`已存为 ${character.name} 的语气样本`);
      setEditingId(null);
      setDraft('');
      await onSaved();
    } catch {
      // 保存失败必须提示：静默失败会让作者以为样本已经存上了
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (character: Character, index: number) => {
    try {
      await saveCharacter({
        id: character.id,
        projectId,
        voiceSamples: (character.voiceSamples ?? []).filter((_, i) => i !== index),
      });
      toast.success('已删除该段样本');
      await onSaved();
    } catch {
      toast.error('删除失败，请重试');
    }
  };

  const withSamples = cast.filter(c => (c.voiceSamples?.length ?? 0) > 0);

  return (
    <div className="space-y-3 border-t border-zinc-100 dark:border-zinc-700 pt-3">
      <p className="text-xs font-medium text-zinc-500">
        把台词存成语气样本（每人最多 {MAX_VOICE_SAMPLES} 段、每段 ≤{MAX_VOICE_CHARS} 字，存下来才会进入写作提示词）
      </p>

      {cast.map(character => {
        const lines = characterTurnsText(turns, character);
        const editing = editingId === character.id;
        const full = (character.voiceSamples?.length ?? 0) >= MAX_VOICE_SAMPLES;
        return (
          <div key={character.id} className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">{character.name || '未命名'}</Badge>
              <span className="text-[11px] text-zinc-400">
                {lines ? `这一场说了 ${lines.replace(/\s/g, '').length} 字` : '这一场还没开口'}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7"
                disabled={!lines || full || editing}
                onClick={() => startEdit(character)}
                title={full ? `样本已满 ${MAX_VOICE_SAMPLES} 段，先删一段` : '从这场对话里挑这个角色的台词，改顺了再存'}
              >
                <Save className="h-3 w-3" />存为语气样本
              </Button>
            </div>
            {editing && (
              <div className="space-y-1.5 pl-1">
                <Textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={5}
                  className="text-sm leading-relaxed"
                  placeholder="这里是他在这一场说过的全部台词，删掉不代表性的、改顺不顺口的句子"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" className="gap-1.5 h-7" disabled={saving} onClick={() => handleSave(character)}>
                    {saving
                      ? <><Loader2 className="h-3 w-3 animate-spin" />保存中…</>
                      : <><Save className="h-3 w-3" />保存这段</>}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingId(null); setError(''); }}>
                    取消
                  </Button>
                  <span className="text-[11px] text-zinc-400">
                    {draft.replace(/\s/g, '').length} / {MAX_VOICE_CHARS} 字 · 约 {estimateVoiceTokens(draft)} token
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {withSamples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500">已存的语气样本</p>
          {withSamples.map(c => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{c.name}</Badge>
                <span className="text-[11px] text-zinc-400">
                  {c.voiceSamples?.length}/{MAX_VOICE_SAMPLES} 段 · 每次注入约 {estimateVoiceTokens(characterVoiceText(c))} token
                </span>
              </div>
              {(c.voiceSamples ?? []).map((s, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                  <Check className="h-3.5 w-3.5 text-ink-500 mt-0.5 shrink-0" />
                  <span className="flex-1 line-clamp-2">{trunc(s, 120)}</span>
                  <button
                    onClick={() => handleDelete(c, i)}
                    className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                    title="删除这段样本"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
