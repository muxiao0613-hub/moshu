import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import type { PlotThread } from '@/shared/types';

export async function getThreads(projectId: string): Promise<PlotThread[]> {
  const res = await apiClient.get(`/projects/${projectId}/plot-threads`);
  return normalizeList<PlotThread>(unwrap(res));
}

export async function saveThread(thread: Partial<PlotThread> & { projectId: string }): Promise<PlotThread> {
  const res = await apiClient.post(`/projects/${thread.projectId}/plot-threads`, thread);
  return normalize<PlotThread>(unwrap(res));
}

export async function deleteThread(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/plot-threads/${id}`);
}
