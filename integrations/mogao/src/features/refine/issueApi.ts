/** 各专项检查共享持久化台账；检查范围只覆盖实际读取的来源，旧结果不替作者宣告已修复。 */
import { apiClient, unwrap } from '@/api/client';
import { chapterMemoryHash } from '@/shared/lib/characterMemory';
import type { Chapter } from '@/shared/types';
import type { IssueSource, RevisionIssue } from '@/shared/types/revisionIssue';
export interface IssueSnapshot { basisHash: string; issues: RevisionIssue[] }
export async function getIssueSnapshot(projectId: string): Promise<IssueSnapshot> {
  return unwrap(await apiClient.get(`/projects/${projectId}/issues`));
}
export async function replaceIssues(projectId: string, source: IssueSource, chapters: Chapter[], issues: Array<Partial<RevisionIssue>>, coverage: string, basisHash?: string): Promise<IssueSnapshot> {
  const scope = Object.fromEntries(await Promise.all(chapters.map(async c => [c.id, await chapterMemoryHash(source === 'pacing'
    ? JSON.stringify([c.order, c.title, c.pacingTag ?? null, c.conflictType ?? null]) : c.content ?? '')])));
  return unwrap(await apiClient.post(`/projects/${projectId}/issues`, { action: 'replace', source, scope, issues, coverage, basisHash }));
}
export async function markIssue(projectId: string, issue: RevisionIssue, state: 'open' | 'handled' | 'dismissed'): Promise<IssueSnapshot> {
  return unwrap(await apiClient.post(`/projects/${projectId}/issues`, { action: 'state', id: issue.id, state }));
}
