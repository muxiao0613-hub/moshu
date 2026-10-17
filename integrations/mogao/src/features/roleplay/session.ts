/** 作者与角色的对话草稿：按账号/作品/角色/章节范围隔离，刷新可继续；与已确认的人设分开存放。 */
import type { RoleplayMessage } from '@/shared/lib/roleplay';

export function readChatSession(key: string): RoleplayMessage[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((m): m is RoleplayMessage => m && (m.role === 'author' || m.role === 'character') && typeof m.text === 'string')
      .map(m => ({ role: m.role, text: m.text, speaker: typeof m.speaker === 'string' ? m.speaker : undefined }));
  } catch { return []; }
}
export function writeChatSession(key: string, messages: RoleplayMessage[]): boolean {
  try { localStorage.setItem(key, JSON.stringify(messages)); return true; }
  catch { return false; }
}
