/**
 * 人设草稿卡片（纯展示 + 回传事件，无 hooks）。
 *
 * 每张卡 = 一个角色：逐字段可勾选、可改文本，关系用「名字：关系」多行文本编辑。
 * 点「存到档案」才写库，勾掉或改空就是不采用模型的这一条。
 */
import { Check, Loader2, UserPlus } from 'lucide-react';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Textarea } from '@/shared/ui/textarea';
import type { TraitTextFieldKey } from '../traitDraft';
import type { TraitCard } from './cards';

interface TraitCardViewProps {
  card: TraitCard;
  onToggleField: (key: TraitTextFieldKey) => void;
  onFieldChange: (key: TraitTextFieldKey, value: string) => void;
  onRelationsChange: (value: string) => void;
  onSave: () => void;
}

export function TraitCardView({ card, onToggleField, onFieldChange, onRelationsChange, onSave }: TraitCardViewProps) {
  const known = !!card.characterId;
  return (
    <div className="rounded-md border border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={known ? 'secondary' : 'outline'} className="text-[10px]">{card.draftName}</Badge>
        {known ? (
          <span className="text-[11px] text-zinc-400">
            保留原设定，确认后补充到档案
          </span>
        ) : (
          <span className="text-[11px] text-amber-600 flex items-center gap-1">
            <UserPlus className="h-3 w-3" />档案里没有这个名字，先新建人物再保存
          </span>
        )}
        <div className="flex-1" />
        {card.saved
          ? <span className="text-[11px] text-ink-600 flex items-center gap-1"><Check className="h-3 w-3" />已保存</span>
          : (
            <Button size="sm" variant="outline" onClick={onSave} disabled={card.saving || !known} className="gap-1.5">
              {card.saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />保存中…</> : '存到档案'}
            </Button>
          )}
      </div>

      {card.fields.map(f => (
        <div key={f.key} className="space-y-1">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <input type="checkbox" checked={f.enabled} onChange={() => onToggleField(f.key)} className="accent-ink-600" />
            <span className="font-medium">{f.label}</span>
            <span className="text-[10px] text-zinc-400">
              {f.mode === 'append' ? '追加到原内容后面' : f.existing ? '将替换原内容' : '原来为空'}
            </span>
          </label>
          <Textarea
            value={f.value}
            onChange={e => onFieldChange(f.key, e.target.value)}
            rows={f.value.length > 60 ? 3 : 2}
            disabled={!f.enabled}
            className="text-xs leading-relaxed resize-y"
          />
          <p className="text-[11px] text-zinc-500">{f.evidence ? `素材依据：「${f.evidence}」` : '模型未提供可核对的原文引用，请对照素材确认后保存。'}</p>
        </div>
      ))}

      {card.fields.length === 0 && (
        <p className="text-[11px] text-zinc-400">这段素材里没有可提炼的字段（人物只是出现了一下）。</p>
      )}

      {card.relationsText.trim() && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            人物关系<span className="text-[10px] text-zinc-400 ml-1">每行「名字：关系」，档案里没有的名字不会保存</span>
          </label>
          <Textarea
            value={card.relationsText}
            onChange={e => onRelationsChange(e.target.value)}
            rows={3}
            className="text-xs leading-relaxed resize-y"
          />
        </div>
      )}
    </div>
  );
}
