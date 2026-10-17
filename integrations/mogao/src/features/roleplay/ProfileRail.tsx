/**
 * 角色扮演页 · 右栏（把聊出来的东西写回档案）。
 *
 * 「不断完善的性格要写进人物档案」这件事必须落在一个显眼的地方：这里列出这一场上场的角色
 * 当前档案里写了什么，并给两条写回路径 ——
 * 1）把这一场的台词存成语气样本（他怎么说话）；
 * 2）把整场对话交给提炼，生成性格/目标/经历/关系的草稿，由作者改过再存（他是什么人）。
 * 两条路径都要求作者先改再存：模型直接写进档案会把 AI 腔固化成「这个人的设定」。
 * 没人上场时这里不摆空卡，而是写清楚「什么会被留下」——右栏本来就是给「回写」用的。
 */
import { Link } from 'react-router-dom';
import { ArrowRight, ScanText } from 'lucide-react';
import { confirmedMemories } from '@/shared/lib/characterMemory';
import { characterTurnsText } from '@/shared/lib/roleplay';
import { trunc } from '@/shared/lib/text';
import type { RoleplayTurn } from '@/shared/lib/roleplay';
import { cn } from '@/shared/lib/utils';
import { MAX_VOICE_SAMPLES, characterVoiceText } from '@/shared/lib/voiceSample';
import { workRefinePath } from '@/shared/lib/workRoutes';
import type { Character } from '@/shared/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { SampleSaver } from '../character/drill/SampleSaver';

/** 聊到这个段数就提醒一次「要不要写回档案」——再聊下去新东西会变少，回写一次更划算 */
const REMIND_TURNS = 6;

const FIELD_LABEL: Record<string, string> = { appearance: '外貌', personality: '性格', goals: '目标', background: '经历', abilities: '能力', arc: '人物弧线', notes: '备注', relationships: '关系' };

const ROLE_LABEL: Record<Character['role'], string> = {
  protagonist: '主角', antagonist: '反派', supporting: '配角', minor: '次要角色',
};

interface ProfileRailProps {
  projectId: string;
  cast: Character[];
  turns: RoleplayTurn[];
  streaming: boolean;
  onExtract: () => void;
  onSaved: () => void | Promise<void>;
  className?: string;
  /** 桌面端拖出来的宽度（手机端是覆盖抽屉，仍受 max-w 限制） */
  width?: number;
}

export function ProfileRail({
  projectId, cast, turns, streaming, onExtract, onSaved, className, width,
}: ProfileRailProps) {
  const said = cast.filter(c => characterTurnsText(turns, c).length > 0).length;

  return (
    <aside
      style={width ? { width, maxWidth: '70vw' } : undefined}
      className={cn(
        'w-80 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900',
        className
      )}
    >
      <div className="space-y-1 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2.5">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">这一场的人物</p>
        <p className="text-[11px] text-zinc-400">
          {cast.length === 0
            ? '从左边点一个角色拉他上场'
            : `${said}/${cast.length} 人已经开口，共 ${turns.length} 段对白`}
        </p>
      </div>

      <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-3">
        {cast.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700 p-3 space-y-2">
            <p className="text-[11px] font-medium text-zinc-500">聊完这一场，会有两样东西留下</p>
            <ul className="space-y-1.5 text-[11px] text-zinc-400 leading-relaxed">
              <li>· <strong className="font-medium text-zinc-500 dark:text-zinc-400">他怎么说话</strong> —— 台词存成语气样本，下次他上场时注入（最多 3 段、每段 300 字内）</li>
              <li>· <strong className="font-medium text-zinc-500 dark:text-zinc-400">他是什么人</strong> —— 整场对话提炼成性格、目标、经历、关系的草稿，你改过再存</li>
            </ul>
            <p className="text-[11px] text-zinc-400">两条都不会自动写入档案，都要你点一下。</p>
          </div>
        )}

        {cast.map(c => {
          const saidText = characterTurnsText(turns, c);
          return (
            <div key={c.id} className="space-y-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 p-2.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">{ROLE_LABEL[c.role] ?? '配角'}</Badge>
                <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">{c.name || '未命名'}</span>
              </div>
              <p className="text-[11px] text-zinc-500 line-clamp-3">
                {[c.age?.trim(), c.gender?.trim(), c.personality?.trim()].filter(Boolean).join(' · ')
                  || '（档案里还没有性格描述）'}
              </p>
              {c.goals?.trim() && (
                <p className="text-[11px] text-zinc-400 line-clamp-2">想要什么：{c.goals}</p>
              )}
              <p className="text-[11px] text-zinc-400">已确认经历 {confirmedMemories(c).length} 章 · 待更新/确认 {(c.lifeMemories ?? []).filter(m => m.status !== 'confirmed' && m.claims.length).length} 章</p>
              <p className="text-[11px] text-zinc-400">
                语气样本 {c.voiceSamples?.length ?? 0}/{MAX_VOICE_SAMPLES} 段
                {characterVoiceText(c) ? ` · ${characterVoiceText(c).replace(/\s/g, '').length} 字` : ''}
              </p>
              {(c.profileEvidence ?? []).length > 0 && <details className="text-[11px] text-zinc-500">
                <summary>已确认的人设补充 {(c.profileEvidence ?? []).length} 条</summary>
                {(c.profileEvidence ?? []).slice(-3).map(e => <div key={e.id} className="mt-2">
                  <p>{e.sourceLabel} · {new Date(e.confirmedAt).toLocaleDateString()}</p>
                  {Object.entries(e.fields).map(([field, value]) => <p key={field}>{FIELD_LABEL[field] ?? field}：{trunc(value, 100)}</p>)}
                </div>)}
              </details>}
              <p className="text-[11px] text-zinc-400">
                {saidText.length > 0
                  ? `这一场说了 ${saidText.replace(/\s/g, '').length} 字`
                  : '这一场还没开口'}
              </p>
              <Link
                to={workRefinePath(projectId, 'characters')}
                className="inline-flex items-center gap-1 text-[11px] text-ink-500 hover:text-ink-700 dark:hover:text-ink-300"
              >
                去人物档案里看/改<ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}

        {turns.length > 0 && (
          <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
            {turns.length >= REMIND_TURNS && (
              <p className="text-[11px] text-ink-600 dark:text-ink-400">
                已经聊了 {turns.length} 段 —— 顺手把新长出来的性格写回档案，下次写作就会用到。
              </p>
            )}
            <Button
              onClick={onExtract}
              disabled={streaming}
              size="sm"
              variant="outline"
              className="w-full gap-1.5"
              title="拿整场对话总结性格、目标、经历与关系，生成草稿由你改过再存"
            >
              <ScanText className="h-3.5 w-3.5" />总结性格写回档案
            </Button>
          </div>
        )}

        <SampleSaver projectId={projectId} cast={cast} turns={turns} onSaved={onSaved} />
      </div>
    </aside>
  );
}
