/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import { clearProjectIndex } from '@/features/ai/ragService';
import type { Project } from '@/shared/types';

export async function getProjects(): Promise<Project[]> {
  const result: Project[] = [];
  for (let page = 1; ; page++) {
    const data = unwrap<Project[] | { list?: Project[]; total?: number }>(await apiClient.get('/projects', { params: { page, pageSize: 200 } }));
    if (Array.isArray(data)) return normalizeList(data);
    const list = data.list ?? []; result.push(...list);
    if (!list.length || (typeof data.total === 'number' ? result.length >= data.total : list.length < 200)) return normalizeList(result);
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  try {
    const res = await apiClient.get(`/projects/${id}`);
    return normalize<Project>(unwrap(res));
  } catch(e) {if((e as {response?:{status?:number}}).response?.status===404)return undefined;throw e;}
}

export async function saveProject(project: Partial<Project> & { id?: string }): Promise<Project> {
  const { factLedger: _facts, revisionIssues: _issues, ...patch } = project;
  if (project.id) {
    const res = await apiClient.patch(`/projects/${project.id}`, patch);
    return normalize<Project>(unwrap(res));
  }
  const res = await apiClient.post('/projects', patch);
  return normalize<Project>(unwrap(res));
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
  clearProjectIndex(id);
}

export async function toggleProjectPublish(id: string): Promise<{ isPublic: boolean }> {
  const res = await apiClient.patch(`/projects/${id}/publish`);
  return unwrap(res);
}
