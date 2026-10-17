import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import type { Material } from '@/shared/types';

export async function getMaterials(): Promise<Material[]> {
  const res = await apiClient.get('/materials');
  return normalizeList<Material>(unwrap(res)).map(m => ({ ...m, rawContent: m.rawContent ?? '', expandedContent: m.expandedContent ?? '', tags: m.tags ?? [] }));
}

export async function saveMaterial(m: Partial<Material>): Promise<Material> {
  const res = await apiClient.post('/materials', m);
  return normalize<Material>(unwrap(res));
}

export async function deleteMaterial(id: string): Promise<void> {
  await apiClient.delete(`/materials/${id}`);
}

export async function importMaterialBackup(data: unknown): Promise<{ count: number }> {
  return unwrap(await apiClient.post('/materials/import', data));
}
