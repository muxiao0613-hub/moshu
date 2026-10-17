import { apiClient, unwrap } from '@/api/client';
import { normalize, normalizeList } from '@/api/utils';
import { emitLibraryChanged } from '@/shared/lib/libraryEvents';
import { normalizeCharacter } from '@/shared/lib/normalizeCharacter';
import type { Character, CharacterLifeMemory } from '@/shared/types';

export async function getCharacters(projectId: string): Promise<Character[]> {
  const res = await apiClient.get(`/projects/${projectId}/characters`);
  return normalizeList<Character>(unwrap(res)).map(normalizeCharacter);
}

export async function getCharacter(id: string, projectId?: string): Promise<Character | undefined> {
  if (!projectId) return undefined;
  try {
    const res = await apiClient.get(`/projects/${projectId}/characters/${id}`);
    return normalizeCharacter(normalize<Character>(unwrap(res)));
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status === 404) return undefined;
    throw error;
  }
}

export async function saveCharacter(char: Partial<Character> & { projectId: string }): Promise<Character> {
  const res = await apiClient.post(`/projects/${char.projectId}/characters`, char);
  emitLibraryChanged();
  return normalizeCharacter(normalize<Character>(unwrap(res)));
}

export async function deleteCharacter(id: string, projectId: string): Promise<void> {
  await apiClient.delete(`/projects/${projectId}/characters/${id}`);
}

/** 经历单独合并，避免打开中的旧档案覆盖定稿后产生的新经历。 */
export async function saveCharacterMemory(projectId: string, characterId: string,
  action: 'stage' | 'sync' | 'confirm' | 'remove' | 'confirmProfile' | 'dismissProfile', memory: CharacterLifeMemory): Promise<Character> {
  const res = await apiClient.post(`/projects/${projectId}/characters/${characterId}/memories`, { action, memory });
  emitLibraryChanged();
  return normalizeCharacter(normalize<Character>(unwrap(res)));
}

export async function getCharacterContext(projectId: string, ids: string[]): Promise<{
  characters: Array<Pick<Character, 'id' | 'name'>>; cast: Character[];
}> {
  const res = await apiClient.get(`/projects/${projectId}/characters/context`, { params: { ids: ids.join(',') } });
  const data = unwrap<{ characters: Array<Pick<Character, 'id' | 'name'>>; cast: Character[] }>(res);
  return { characters: data.characters, cast: normalizeList(data.cast).map(normalizeCharacter) };
}
