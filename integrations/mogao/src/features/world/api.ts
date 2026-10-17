import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import type { WorldSetting } from '@/shared/types';

export async function getWorldSettings(projectId: string): Promise<WorldSetting[]> {
  const res = await apiClient.get(`/projects/${projectId}/world-settings`);
  return normalizeList<WorldSetting>(unwrap(res));
}

export async function saveWorldSetting(setting: Partial<WorldSetting> & { projectId: string }): Promise<WorldSetting> {
  const res = await apiClient.post(`/projects/${setting.projectId}/world-settings`, setting);
  return normalize<WorldSetting>(unwrap(res));
}

export async function deleteWorldSetting(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/world-settings/${id}`);
}
