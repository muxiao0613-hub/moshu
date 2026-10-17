import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import type { DraftSaveOptions } from '@/shared/lib/useDraftSaver';
import { serializeSave } from '@/shared/lib/saveQueue';
import type { ShortStory } from '@/shared/types';

export async function getShortStories(): Promise<ShortStory[]> {
  const result: ShortStory[] = [];
  for (let page = 1; ; page++) {
    const data = unwrap<ShortStory[] | { list?: ShortStory[]; total?: number }>(await apiClient.get('/short-stories', { params: { page, pageSize: 200 } }));
    if (Array.isArray(data)) return normalizeList(data);
    const list = data.list ?? []; result.push(...list);
    if (!list.length || (typeof data.total === 'number' ? result.length >= data.total : list.length < 200)) return normalizeList(result);
  }
}

export async function getShortStory(id: string): Promise<ShortStory | undefined> {
  try {
    const res = await apiClient.get(`/short-stories/${id}`);
    const saved = normalize<ShortStory>(unwrap(res));
    BODY_BASES.set(saved.id, saved.content ?? '');
    return saved;
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return undefined;
    throw e;
  }
}

const BODY_BASES = new Map<string, string>();

export async function saveShortStory(s: Partial<ShortStory> & DraftSaveOptions): Promise<ShortStory> {
  if (s.id && s.content !== undefined && s.baseContent === undefined && !s.expectedSourceHash) {
    const base = BODY_BASES.get(s.id);
    if (base === undefined) throw new Error('请先读取正文后再保存');
    s = { ...s, expectedSourceHash: await chapterMemoryHash(base) };
  }
  if (s.id) {
    const res = await serializeSave(`story:${s.id}`, () => apiClient.patch(`/short-stories/${s.id}`, s));
    const saved = normalize<ShortStory>(unwrap(res));
    if (s.content !== undefined) BODY_BASES.set(saved.id, saved.content ?? '');
    return saved;
  }
  const res = await apiClient.post('/short-stories', s);
  return normalize<ShortStory>(unwrap(res));
}

export async function deleteShortStory(id: string): Promise<void> {
  await apiClient.delete(`/short-stories/${id}`);
}

export async function toggleShortStoryPublish(id: string): Promise<{ isPublic: boolean }> {
  const res = await apiClient.patch(`/short-stories/${id}/publish`);
  return unwrap(res);
}
