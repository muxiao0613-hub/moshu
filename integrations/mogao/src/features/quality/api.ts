import { apiClient } from '@/api/client';
import type { StoryBible, FactLedger, TopicCandidate, Project } from '@/shared/types';
import { getProject } from '@/features/project/api';

const STORY_BIBLE_KEYS = [
  'coreHook', 'targetReader', 'protagonistDesire', 'mainConflict',
  'powerRules', 'hardRules', 'tone', 'taboo',
] as const;

export async function getStoryBible(projectId: string, suppliedProject?: Project): Promise<StoryBible | undefined> {
  const project = suppliedProject ?? await getProject(projectId);
  let raw: unknown = project?.storyBible;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = { hardRules: [raw] }; }
  }
  if (raw && typeof raw === 'object' && 'content' in raw && typeof raw.content === 'string'
    && !STORY_BIBLE_KEYS.some(k => Object.keys(raw as object).includes(k))) raw = { hardRules: [raw.content] };
  if (!project || !raw || typeof raw !== 'object') return undefined;

  // 兼容历史数据：早期版本可能把圣经存成 { content: '...' } 富文本壳。
  // 只认可用字段；一个都没有时返回 undefined，让下游走「（暂无）」分支，
  // 避免提示词里渲染出「核心卖点：undefined」这类静默失效。
  const rec = raw as Record<string, unknown>;
  const hasKnownField = STORY_BIBLE_KEYS.some(k => {
    const v = rec[k];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  if (!hasKnownField) return undefined;

  const str = (v: unknown) => (v == null ? '' : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const date = (v: unknown): Date | undefined =>
    v instanceof Date ? v : typeof v === 'string' && v ? new Date(v) : undefined;

  return {
    id: rec.id == null ? projectId : String(rec.id),
    projectId,
    coreHook: str(rec.coreHook),
    targetReader: str(rec.targetReader),
    protagonistDesire: str(rec.protagonistDesire),
    mainConflict: str(rec.mainConflict),
    powerRules: arr(rec.powerRules),
    hardRules: arr(rec.hardRules),
    tone: str(rec.tone),
    taboo: arr(rec.taboo),
    updatedAt: date(rec.updatedAt) ?? project.updatedAt,
  };
}

export async function saveStoryBible(
  bible: Partial<StoryBible> & { projectId: string; content?: string }
): Promise<void> {
  await apiClient.patch(`/projects/${bible.projectId}`, { storyBible: bible.content ?? bible });
}

export async function getFactLedger(projectId: string): Promise<FactLedger[]> {
  const project = await getProject(projectId);
  const list = project?.factLedger;
  return Array.isArray(list) ? list : [];
}

export async function saveFacts(facts: FactLedger[]): Promise<void> {
  if (!facts.length) return;
  for (let i = 0; i < facts.length; i += 60) await apiClient.post(`/projects/${facts[0].projectId}/facts`, { action: 'stage', facts: facts.slice(i, i + 60) });
}

export async function confirmFact(fact: FactLedger): Promise<void> {
  await apiClient.post(`/projects/${fact.projectId}/facts`, { action: 'confirm', facts: [fact] });
}

export async function deleteFact(id: string, projectId: string): Promise<void> {
  await apiClient.post(`/projects/${projectId}/facts`, { action: 'remove', id });
}

export async function getTopicCandidates(projectId: string): Promise<TopicCandidate[]> {
  const project = await getProject(projectId);
  const list = project?.topicCandidates;
  return (Array.isArray(list) ? list : []).sort((a, b) => b.score - a.score);
}

export async function saveTopicCandidates(items: TopicCandidate[]): Promise<void> {
  if (!items.length) return;
  await apiClient.patch(`/projects/${items[0].projectId}`, { topicCandidates: items });
}

export async function clearTopicCandidates(projectId: string): Promise<void> {
  await apiClient.patch(`/projects/${projectId}`, { topicCandidates: [] });
}

export async function deleteTopicCandidate(id: string, projectId: string): Promise<void> {
  const existing = await getTopicCandidates(projectId);
  await apiClient.patch(`/projects/${projectId}`, { topicCandidates: existing.filter(t => t.id !== id) });
}

export async function adoptTopicCandidate(projectId: string, topicId: string): Promise<void> {
  await apiClient.post(`/projects/${projectId}/topic`, { topicId });
}
