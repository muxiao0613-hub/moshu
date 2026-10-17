import type { Folder, Project } from '../../contracts';
import { command } from './bridge';

async function pages<T>(read: (offset: number) => Promise<T[]>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; offset <= 1_000_000; offset += 100) {
    const page = await read(offset); result.push(...page);
    if (page.length < 100) return result;
  }
  throw new Error('目录超过分页上限。');
}
export function loadFolders(): Promise<Folder[]> { return pages(offset => command('list_folders', { offset, limit: 100 })); }
export function loadProjects(): Promise<Project[]> { return pages(offset => command('list_projects', { offset, limit: 100 })); }
export const splitTags = (value: string) => value.split(/[,，]/u).map(value => value.trim()).filter(Boolean);
export function folderLabel(folder: Folder, folders: Folder[]) {
  const parts = [folder.name]; const seen = new Set([folder.id]); let parent = folder.parentId;
  while (parent) {
    const item = folders.find(folder => folder.id === parent);
    if (!item || seen.has(item.id)) break;
    parts.unshift(item.name); seen.add(item.id); parent = item.parentId;
  }
  return parts.join(' / ');
}
