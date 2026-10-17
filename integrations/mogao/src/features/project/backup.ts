/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
/** 两个作品入口共用的服务端备份/恢复；失败不创建半本作品，未保存草稿明确排除。 */
import { saveAs } from 'file-saver';
import { apiClient, unwrap } from '@/api/client';
import { normalize } from '@/api/utils';
import { flushProjectDrafts } from '@/shared/lib/draftFlush';
import { toast } from '@/shared/ui/toast';
import type { Project } from '@/shared/types';
import { collectLocalBackup, restoreLocalBackup, validateLocalBackup } from './localBackup';
export async function downloadProjectBackup(projectId: string): Promise<void> {
  await flushProjectDrafts(projectId);
  const user = unwrap<{ id: string }>(await apiClient.get('/users/me'));
  const localState = collectLocalBackup(projectId, user.id);
  const data = unwrap<{ project: Project }>(await apiClient.get(`/projects/${projectId}/backup`));
  await saveAs(new Blob([JSON.stringify({ ...data, localState }, null, 2)], { type: 'application/json' }),
    `${data.project.title}_${new Date().toISOString().slice(0, 10)}.mgao`);
}
export async function restoreProjectBackup(data: unknown): Promise<Project> {
  const state = (data as { localState?: unknown })?.localState;
  const local = state ? validateLocalBackup(state) : undefined;
  const user = local ? unwrap<{ id: string }>(await apiClient.get('/users/me')) : undefined;
  const project = normalize<Project & { restoredIds?: Record<string, string> }>(unwrap(await apiClient.post('/projects/import', data)));
  if (local && user) {
    try { const result = restoreLocalBackup(local, project.id, user.id, project.restoredIds ?? {});
      if (result.skipped) toast.info(`${result.skipped} 个已删除角色的会话仅保留在原备份中`);
    } catch { toast.error('作品数据已恢复，本机会话和偏好恢复失败（存储空间不足），请保留原备份'); }
  }
  return project;
}
