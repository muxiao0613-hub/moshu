/**
 * 对白演练（角色扮演聊天）的纯逻辑：把「角色逐条发言」的文本切成气泡、按角色汇总。
 *
 * 为什么放 shared：切气泡的规则是纯函数 —— 面板要边流式接收边切（最后一个气泡要实时长），
 * 存语气样本时要按角色取出「他说过的全部台词」，人设提炼要把整段聊天当素材。
 * 三处都依赖同一套解析，所以它必须能被单测、且不依赖 React 与网络。
 */
import type { Character } from '@/shared/types';

/** 一条发言：作者（旁白/扮演某个角色）或某个角色（AI） */
export interface RoleplayMessage {
  role: 'author' | 'character';
  /** 作者扮演角色时填角色名，旁白留空 */
  speaker?: string;
  text: string;
}

/** 从 AI 输出里切出的一条角色发言 */
export interface RoleplayTurn {
  /** 角色名（和档案对不上时就是原文里的名字，姓名可能为空 = 未标注的旁白） */
  name: string;
  characterId?: string;
  text: string;
}

/** 按姓名或别名找角色（对白里作者常写别名，必须认） */
export function matchCharacterByName(name: string, characters: Character[]): Character | undefined {
  const target = (name ?? '').trim().toLowerCase();
  if (!target) return undefined;
  return characters.find(c =>
    (c.name ?? '').trim().toLowerCase() === target
    || (c.aliases ?? []).some(a => (a ?? '').trim().toLowerCase() === target)
  );
}

/**
 * 一行发言的开头：`【名字】台词` 或 `名字：台词`。
 * 只认 12 字以内的名字，避免把「他说：……」这种正文误判成发言。
 */
const MARKER = /^\s*(?:【\s*([^】]{1,12})\s*】|([^：:\n]{1,12})\s*[：:])\s*(.*)$/;

/**
 * 把一段 AI 输出切成气泡。规则刻意宽容：
 * - 认得出档案里的名字才开新气泡（对不上就当上一句的续行，避免把台词劈碎）；
 * - 还没出现任何气泡时，前面的行归到一条无名旁白，原样显示给作者看；
 * - 流式生成到一半也能调（最后一条会一直长）。
 */
export function parseRoleplay(text: string, characters: Character[]): RoleplayTurn[] {
  const turns: RoleplayTurn[] = [];
  let current: RoleplayTurn | null = null;
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    const m = line.match(MARKER);
    const name = m ? (m[1] ?? m[2] ?? '').trim() : '';
    const matched = name ? matchCharacterByName(name, characters) : undefined;
    if (m && matched) {
      current = { name: matched.name, characterId: matched.id, text: (m[3] ?? '').trim() };
      turns.push(current);
      continue;
    }
    if (!current) {
      current = { name: '', text: line };
      turns.push(current);
    } else {
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }
  return turns.filter(t => t.name || t.text);
}

/** 一段对话里所有角色发言（多轮合并），气泡与汇总都从这里来 */
export function turnsOf(messages: RoleplayMessage[], characters: Character[]): RoleplayTurn[] {
  return messages
    .filter(m => m.role === 'character')
    .flatMap(m => parseRoleplay(m.text, characters));
}

/** 某个角色在这一段对话里说过的全部台词（存语气样本的原始素材） */
export function characterTurnsText(turns: RoleplayTurn[], character: Character): string {
  return turns
    .filter(t => t.characterId === character.id)
    .map(t => t.text.trim())
    .filter(Boolean)
    .join('\n');
}

/** 整段对话的剧本稿（人设提炼的素材 + 让模型接着说的上下文） */
export function transcriptOf(messages: RoleplayMessage[], characters: Character[], authorLabel = '作者'): string {
  return messages
    .map(m => {
      if (m.role === 'author') return `${m.speaker || authorLabel}：${m.text.trim()}`;
      const turns = parseRoleplay(m.text, characters);
      if (turns.length === 0) return m.text.trim();
      return turns.map(t => `【${t.name || '旁白'}】${t.text}`).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}
