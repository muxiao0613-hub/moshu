import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import type { TimelineEvent } from '@/shared/types';

export async function getTimelineEvents(projectId: string): Promise<TimelineEvent[]> {
  const res = await apiClient.get(`/projects/${projectId}/timeline-events`);
  return normalizeList<TimelineEvent>(unwrap(res));
}

export async function saveTimelineEvent(event: Partial<TimelineEvent> & { projectId: string }): Promise<TimelineEvent> {
  const res = await apiClient.post(`/projects/${event.projectId}/timeline-events`, event);
  return normalize<TimelineEvent>(unwrap(res));
}

export async function deleteTimelineEvent(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/timeline-events/${id}`);
}
