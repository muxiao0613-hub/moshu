/** 作品备份的本机附录：只收角色会话与创作偏好，不读取账号密钥、令牌或其他作品。 */
import type { RoleplayMessage } from '@/shared/lib/roleplay';
interface Session { castIds: string[]; mode: 'author' | 'scene'; writerRoleId: string; throughOrder: string; messages: RoleplayMessage[] }
export interface LocalBackup { version: 1; contextPrefs?: unknown; characterSync?: unknown; sessions: Session[] }
type IdMap = Record<string, string>;
export function collectLocalBackup(projectId: string, userId: string): LocalBackup {
  const read = (key: string): unknown => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : undefined; };
  const sessions: Session[] = [], prefix = `mogao_chat:${userId}:${projectId}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const [cast, mode, writerRoleId, throughOrder] = key.slice(prefix.length).split(':');
    if (!['author', 'scene'].includes(mode)) continue;
    const messages = read(key);
    if (!Array.isArray(messages)) throw new Error('角色会话备份格式错误，请先修复本机会话');
    sessions.push({ castIds: cast.split(',').filter(Boolean), mode: mode as Session['mode'], writerRoleId, throughOrder, messages });
  }
  return validateLocalBackup({ version: 1, contextPrefs: read(`mogao_context_prefs:${projectId}`), characterSync: read(`mogao_character_sync:${projectId}`), sessions });
}
export function validateLocalBackup(input: unknown): LocalBackup {
  if (!input || typeof input !== 'object') throw new Error('本机备份附录格式错误');
  const v = input as LocalBackup;
  if (v.version !== 1 || !Array.isArray(v.sessions)) throw new Error('不支持的本机备份附录');
  for (const s of v.sessions) {
    if (!s || !Array.isArray(s.castIds) || !s.castIds.length || s.castIds.length > 3 || s.castIds.some(id => typeof id !== 'string')
      || !['author', 'scene'].includes(s.mode) || typeof s.writerRoleId !== 'string' || typeof s.throughOrder !== 'string'
      || (s.throughOrder !== 'latest' && !/^\d+$/.test(s.throughOrder)) || !Array.isArray(s.messages)
      || s.messages.some(m => !m || !['author', 'character'].includes(m.role) || typeof m.text !== 'string' || (m.speaker !== undefined && typeof m.speaker !== 'string'))) throw new Error('角色会话附录格式错误');
  }
  for (const value of [v.contextPrefs, v.characterSync]) if (value !== undefined && (!value || typeof value !== 'object' || Array.isArray(value))) throw new Error('偏好附录格式错误');
  return { version: 1, contextPrefs: v.contextPrefs, characterSync: v.characterSync, sessions: v.sessions };
}
export function restoreLocalBackup(input: LocalBackup, projectId: string, userId: string, ids: IdMap): { restored: number; skipped: number } {
  const pending = new Map<string, string>();
  // 只替换偏好的语义 ID 字段与条目 ID，不触碰消息正文中的文字。
  const remap = (v: unknown): unknown => {
    if (typeof v === 'string') return v.split(':').map(part => ids[part] ?? part).join(':');
    if (Array.isArray(v)) return v.map(remap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, value]) => [ids[k] ?? k, remap(value)]));
    return v;
  };
  if (input.contextPrefs) pending.set(`mogao_context_prefs:${projectId}`, JSON.stringify(remap(input.contextPrefs)));
  if (input.characterSync) pending.set(`mogao_character_sync:${projectId}`, JSON.stringify(remap(input.characterSync)));
  let skipped = 0;
  for (const s of input.sessions) {
    if (s.castIds.some(id => !ids[id]) || (s.writerRoleId && !ids[s.writerRoleId])) { skipped++; continue; }
    const key = `mogao_chat:${userId}:${projectId}:${s.castIds.map(id => ids[id]).sort().join(',')}:${s.mode}:${ids[s.writerRoleId] ?? ''}:${s.throughOrder}`;
    pending.set(key, JSON.stringify(s.messages));
  }
  const previous = new Map([...pending.keys()].map(k => [k, localStorage.getItem(k)]));
  try { for (const [k, v] of pending) localStorage.setItem(k, v); }
  catch (error) {
    for (const [k, old] of previous) { try { if (old === null) localStorage.removeItem(k); else localStorage.setItem(k, old); } catch { /* 存储额度不足时仍尽力清理新键；原文件可重试恢复附录。 */ } }
    throw error;
  }
  return { restored: input.sessions.length - skipped, skipped };
}
