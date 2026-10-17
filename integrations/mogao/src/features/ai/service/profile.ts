/**
 * AI 服务 · 人设提炼（把「人怎么演」从素材里总结回人物档案）。
 *
 * 为什么需要它：对白演练只产出「他怎么说话」的语气样本，章节正文里其实还有大量
 * 关于这个人的信息（在意什么、底线在哪、想要什么、经历过什么），散落在正文里就浪费了。
 * 这里把素材读一遍，按**档案字段**输出结构化草稿，作者改完再保存 —— 与语气样本同一原则：
 * 模型给的是候选，入库的必须是作者认可的那一版（直接入库会把 AI 腔固化成"人物设定"）。
 *
 * 本文件是 ./service 的内部实现，对外统一由 @/features/ai/aiService 导出。
 * 依赖方向：json / transport（底层），不引用上层业务模块。
 */
import { characterProfile } from '@/shared/lib/characterProfile';
import { trunc } from '@/shared/lib/text';
import type { Character, Project } from '@/shared/types';
import { parseJsonFromAI } from './json';
import { streamChat } from './transport';

/** 素材最多喂多少字：再长就不是"提炼"而是"通读全书"了，成本也控不住 */
export const MAX_TRAIT_SOURCE_CHARS = 6000;

export interface TraitRelationDraft {
  /** 对方角色名（必须是素材里出现过的名字） */
  target: string;
  description: string;
}

/** 一个角色的特点草稿：字段与人物档案一一对应，空字段表示素材里没有依据 */
export interface CharacterTraitDraft {
  name: string;
  appearance?: string;
  personality?: string;
  goals?: string;
  background?: string;
  abilities?: string;
  arc?: string;
  notes?: string;
  relationships?: TraitRelationDraft[];
  evidence?: Record<string, string>;
}

export interface TraitExtractParams {
  project: Project;
  /** 档案里已有的角色：当"已知信息"喂给模型，避免它把已有设定原样再总结一遍 */
  characters: Character[];
  /** 素材原文（对白稿、章节正文，或作者粘贴的任何片段） */
  source: string;
  /** 素材来源标签，只用于 prompt 里说明这是什么（如「对白演练」「第 3 章 正文」） */
  sourceLabel?: string;
  instruction?: string;
  onChunk?: (c: string) => void;
  signal?: AbortSignal;
}

const ROLE_LABEL: Record<Character['role'], string> = {
  protagonist: '主角',
  antagonist: '反派',
  supporting: '配角',
  minor: '次要角色',
};

export function buildTraitExtractSystem(project: Project): string {
  return `你是小说的人物设定编辑，正在为《${project.title}》（${project.genre}类）整理人物档案。

任务：读一段素材，把里面每个角色的特点提炼成档案字段。

铁律：
1. 只写素材里**有依据**的推断。素材没体现的字段给空字符串，宁可空着也不许编造。
2. 这些字段会直接影响后面几章怎么写这个人（他做什么、怎么说、为什么这么做）。所以写"他是怎样的人"，不要复述剧情、不要写"本段中""作者想表达"这类话。
3. 每个字段 30–120 字，用短句、分号分隔；不要堆砌形容词。
4. 素材里没出现的角色不要输出。
5. 关系只写素材里明确体现的（谁对谁是什么关系、什么态度）；\`target\` 必须是素材里出现过的角色名。
6. 聊天是创作探索，不能把假设当成已经发生的小说经历；与已知档案冲突时在 notes 标记「待核对」，不要擅自改掉原设定。每个非空字段在 evidence 中给一段逐字引用的素材依据。

输出严格 JSON 数组（无 markdown 代码块、无注释）：
[{"name":"角色名",
 "appearance":"外貌印象（素材没写就空字符串）",
 "personality":"性格：行为模式、处事风格、在意什么、底线在哪",
 "goals":"他想要什么（动机）",
 "background":"经历与关键事件，以及性格的成因",
 "abilities":"能力、技能、资源",
 "arc":"这段素材显示出的变化或命运走向",
 "notes":"口癖、习惯、恐惧、癖好等零碎特点，用；分隔",
 "relationships":[{"target":"角色名","description":"什么关系、什么态度"}],
 "evidence":{"personality":"素材中逐字引用的依据"}}]`;
}

export function buildTraitExtractUser(p: TraitExtractParams): string {
  const known = p.characters
    .slice(0, 10)
    .map(c => `${characterProfile(c, p.characters, 160)}\n角色定位：${ROLE_LABEL[c.role] ?? '配角'}`)
    .join('\n');
  return `作品：《${p.project.title}》（${p.project.genre}类）
简介：${trunc(p.project.synopsis ?? '', 120) || '（未填）'}

素材来源：${p.sourceLabel || '作者提供的片段'}

档案里已有的角色（这些是已知信息，不要原样重复，只补充素材里新体现的部分）：
${known || '（暂无）'}

素材：
${trunc(p.source, MAX_TRAIT_SOURCE_CHARS)}${p.instruction ? `\n\n额外要求：${p.instruction}` : ''}

请按 JSON 数组输出素材里每个角色的特点草稿。`;
}

/**
 * 从素材里提炼人物特点草稿。
 *
 * 返回值只是**候选**：字段可能为空、关系可能对不上档案里的人，都要由 UI 让作者改完再存。
 */
export async function extractCharacterTraits(p: TraitExtractParams): Promise<CharacterTraitDraft[]> {
  const system = buildTraitExtractSystem(p.project);
  const user = buildTraitExtractUser(p);
  // 素材里出现的人越多，需要的输出越长（每人 7 个字段 + 关系）
  const appeared = p.characters.filter(c => c.name && (p.source.includes(c.name) || (c.aliases ?? []).some(a => a && p.source.includes(a)))).length;
  const maxTokens = Math.min(600 + Math.max(appeared, 1) * 1200, 8000);
  const raw = await streamChat(system, user, p.onChunk, maxTokens, { signal: p.signal, jsonMode: true, temperature: 0.3 });
  const drafts = parseJsonFromAI<CharacterTraitDraft[]>(raw);
  if (!Array.isArray(drafts)) throw new Error('模型没有返回人物列表，请重试');
  return drafts.filter(d => d && typeof d.name === 'string' && d.name.trim()).map(d => {
    const safe: CharacterTraitDraft = { name: d.name.trim(), evidence: {} };
    for (const key of ['appearance', 'personality', 'goals', 'background', 'abilities', 'arc', 'notes'] as const) {
      if (typeof d[key] === 'string') safe[key] = d[key].trim();
      const quote = d.evidence?.[key];
      if (typeof quote === 'string' && quote.trim() && p.source.includes(quote.trim())) safe.evidence![key] = quote.trim();
    }
    safe.relationships = Array.isArray(d.relationships) ? d.relationships.filter(r => r && typeof r.target === 'string' && typeof r.description === 'string') : [];
    return safe;
  });
}
