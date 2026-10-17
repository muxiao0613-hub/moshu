import type {PetCommands} from './pet';
import type { JSONContent } from '@tiptap/react';

export type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'MODULE_DISABLED' | 'IO_ERROR' | 'DB_ERROR'
  | 'CANCELLED' | 'AI_UNAVAILABLE' | 'BACKUP_INVALID' | 'WORKSPACE_LOCKED' | 'DB_BUSY' | 'MIGRATION_FAILED';
export interface AppError {
  code: ErrorCode; message: string; retryable: boolean; requestId: string;
  details?: { currentRevision?: number };
}
export type ProjectStatus = 'active' | 'archived';
export interface Project {
  id: string; name: string; description: string; status: ProjectStatus; revision: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
  favorite: boolean; tags: string[]; coverBlobId: string | null;
}
export interface Note {
  id: string; title: string; body: JSONContent; plainText: string; schemaVersion: number;
  revision: number; createdAt: string; updatedAt: string;
}
export interface NoteSummary { id: string; title: string; revision: number; updatedAt: string }
export interface SaveReceipt { entityId: string; savedRevision: number; clientEditSequence: number; savedAt: string }
export interface SaveNote {
  id: string; title: string; body: JSONContent; schemaVersion: number; baseRevision: number;
  clientEditSequence: number; createVersion: boolean;
}
export interface WorkspaceStatus {
  workspaceId: string; schemaVersion: number; appVersion: string; projectCount: number; noteCount: number;
}
export type ResourceKind = 'file' | 'link' | 'note';
export interface Resource {
  id: string; kind: ResourceKind; name: string; description: string; source: string;
  folderId: string | null; originalName: string | null; url: string | null;
  favorite: boolean; tags: string[]; projectIds: string[]; size: number | null;
  mimeType: string | null; sha256: string | null; revision: number;
  createdAt: string; updatedAt: string; deletedAt: string | null;
}
export interface Folder { id: string; parentId: string | null; name: string; revision: number }
export interface FilePreview { kind: 'text' | 'image' | 'unsupported'; text: string | null; dataUrl: string | null; message: string | null }
export type DocumentBlock = { kind: 'paragraph'; text: string; level: number } | { kind: 'table'; rows: string[][] };
export interface DocumentCell { text: string; valueType: string; formula: string | null }
export interface TablePage { rowCount: number; columnCount: number; rowOffset: number; columnOffset: number; rows: DocumentCell[][] }
export interface DocumentView { resourceId: string; sourceRevision: number; format: string; html: string | null; blocks: DocumentBlock[]; blockCount: number; sheets: string[]; table: TablePage | null; warnings: string[] }
export interface ResourceQuery {
  offset: number; limit: number; keyword: string; kind: ResourceKind | null; folderId: string | null;
  rootOnly: boolean; projectId: string | null; favoriteOnly: boolean; tag: string | null;
}
export interface ProjectQuery { offset: number; limit: number; keyword: string; status: ProjectStatus | null; favoriteOnly: boolean; tag: string | null }
export interface SaveResource {
  id: string; baseRevision: number; name: string; description: string; source: string;
  folderId: string | null; url: string | null; favorite: boolean; tags: string[];
}
export interface NoteVersionSummary { id: string; noteId: string; title: string; sourceRevision: number; createdAt: string }
export interface NoteVersion { summary: NoteVersionSummary; body: JSONContent; plainText: string; schemaVersion: number }
export interface NoteDraft { sessionId: string; noteId: string; baseRevision: number; clientEditSequence: number; title: string; body: JSONContent; schemaVersion: number }
export interface DraftEntry { sessionId: string; noteId: string | null; title: string | null; issue: string | null }
export type TaskStatus = 'notStarted' | 'inProgress' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high';
export type TaskView = 'all' | 'today' | 'overdue' | 'completed';
export interface TaskFields { title: string; description: string; status: TaskStatus; priority: TaskPriority; dueDate: string | null; projectId: string | null }
export interface Task extends TaskFields { id: string; revision: number; createdAt: string; updatedAt: string; deletedAt: string | null; overdue: boolean }
export interface TaskPage { items: Task[]; today: string; hasMore: boolean }
export interface TaskQuery { offset: number; limit: number; view: TaskView; status: TaskStatus | null; dueDate: string | null; projectId: string | null; keyword: string }
export interface DocumentSession { id: string; resourceId: string; baseRevision: number; filename: string; format: string; markdown: string | null; editSequence: number; updatedAt: string; changed: boolean }
export interface DocumentSave { resource: Resource; session: DocumentSession; receipt: SaveReceipt }
export interface FileVersion { id: string; resourceId: string; sourceRevision: number; sha256: string; size: number; createdAt: string }
export interface OfficeEditor { id: string; name: string; formats: string[] }
export * from './foundation';
import type { FoundationCommands } from './foundation';
import type { MogaoCommands } from '../modules/mogao/contracts';
export interface LibraryEntry { moduleId:string; moduleName:string; kind:string; id:string; title:string; description:string; wordCount:number; sectionCount:number; revision:number; updatedAt:string; disabled:boolean }
export interface LibraryPage { items:LibraryEntry[]; hasMore:boolean; warnings:string[] }
export interface LibrarySection { id:string; title:string; revision:number; wordCount:number }
export interface LibraryReading { editTarget:import('./foundation').SearchHit; entry:LibraryEntry; sections:LibrarySection[]; selectedId:string|null; title:string; text:string; revision:number }
export interface ReadLibrary { moduleId:string; kind:string; id:string; sectionId:string|null }
export interface Commands extends PetCommands, FoundationCommands, MogaoCommands {
  list_module_library: { input:{keyword:string;offset:number;limit:number}; output:LibraryPage };
  read_module_library: { input:ReadLibrary; output:LibraryReading };
  begin_document_edit: { input: { id: string; baseRevision: number }; output: DocumentSession };
  get_document_session: { input: { id: string }; output: DocumentSession };
  list_document_sessions: { input: { offset: number; limit: number }; output: DocumentSession[] };
  write_markdown_draft: { input: { id: string; editSequence: number; text: string }; output: DocumentSession };
  commit_document_edit: { input: { id: string; baseRevision: number; editSequence: number }; output: DocumentSave };
  copy_document_edit: { input: { id: string }; output: Resource };
  end_document_edit: { input: { id: string; editSequence: number }; output: null };
  list_file_versions: { input: { id: string; offset: number; limit: number }; output: FileVersion[] };
  export_file_version: { input: { id: string; versionId: string }; output: null };
  restore_file_version: { input: { id: string; versionId: string; baseRevision: number }; output: Resource };
  list_office_editors: { input: Record<string, never>; output: OfficeEditor[] };
  open_document_editor: { input: { id: string; editorId: string }; output: null };
  preview_markdown: { input: { text: string }; output: string };
  create_document: { input: { name: string; format: 'md' | 'docx' | 'xlsx' | 'csv' | 'tsv'; folderId: string | null; projectId: string | null }; output: Resource };

  query_tasks: { input: TaskQuery; output: TaskPage };
  get_task: { input: { id: string }; output: Task };
  create_task: { input: TaskFields; output: Task };
  save_task: { input: TaskFields & { id: string; baseRevision: number }; output: Task };
  set_task_deleted: { input: { id: string; baseRevision: number; deleted: boolean }; output: Task };
  list_note_versions: { input: { id: string; offset: number; limit: number }; output: NoteVersionSummary[] };
  get_note_version: { input: { id: string; versionId: string }; output: NoteVersion };
  restore_note_version: { input: { id: string; versionId: string; baseRevision: number }; output: Note };
  write_note_draft: { input: { draft: NoteDraft }; output: null };
  list_note_drafts: { input: { offset: number; limit: number }; output: DraftEntry[] };
  get_note_draft: { input: { id: string }; output: NoteDraft };
  discard_note_draft: { input: { id: string; throughSequence: number | null }; output: null };
  copy_note_draft: { input: { id: string }; output: Note };
  export_note: { input: { id: string; baseRevision: number; format: 'txt' | 'markdown' }; output: null };
  workspace_status: { input: Record<string, never>; output: WorkspaceStatus };
  list_projects: { input: { offset: number; limit: number }; output: Project[] };
  create_project: { input: { name: string; description: string }; output: Project };
  update_project: { input: { id: string; name: string; description: string; status: ProjectStatus; baseRevision: number }; output: Project };
  set_project_deleted: { input: { id: string; baseRevision: number; deleted: boolean }; output: Project };
  list_notes: { input: { offset: number; limit: number }; output: NoteSummary[] };
  create_note: { input: { title: string; projectId: string | null }; output: Note };
  get_note: { input: { id: string }; output: Note };
  save_note: { input: SaveNote; output: SaveReceipt };
  query_projects: { input: ProjectQuery; output: Project[] };
  get_project: { input: { id: string }; output: Project };
  save_project_details: { input: {
    id: string; baseRevision: number; name: string; description: string; status: ProjectStatus;
    favorite: boolean; tags: string[]; changeCover: boolean; coverResourceId: string | null;
  }; output: Project };
  list_resources: { input: ResourceQuery; output: Resource[] };
  get_resource: { input: { id: string }; output: Resource };
  create_link: { input: { name: string; url: string; description: string; source: string; folderId: string | null; projectId: string | null }; output: Resource };
  import_file: { input: { folderId: string | null; projectId: string | null }; output: Resource };
  save_resource: { input: SaveResource; output: Resource };
  set_resource_project: { input: { id: string; baseRevision: number; projectId: string; linked: boolean }; output: Resource };
  set_resource_deleted: { input: { id: string; baseRevision: number; deleted: boolean }; output: Resource };
  list_folders: { input: { offset: number; limit: number }; output: Folder[] };
  create_folder: { input: { name: string; parentId: string | null }; output: Folder };
  save_folder: { input: { id: string; name: string; parentId: string | null; baseRevision: number }; output: Folder };
  delete_folder: { input: { id: string; baseRevision: number; mode: 'moveToRoot' | 'trashContents' }; output: null };
  preview_file: { input: { id: string }; output: FilePreview };
  read_document: { input: { id: string; baseRevision: number; offset: number; limit: number; sheetIndex: number; columnOffset: number; columnLimit: number }; output: DocumentView };
  preview_project_cover: { input: { id: string }; output: FilePreview };
  open_resource: { input: { id: string }; output: null };
  export_file: { input: { id: string }; output: null };
}
