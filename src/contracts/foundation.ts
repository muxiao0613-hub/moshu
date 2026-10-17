import type { Project,NoteSummary,Task,ErrorCode } from './index';
export type Page = 'home'|'projects'|'resources'|'notes'|'tasks'|'search'|'modules'|'trash'|'settings'|'help'|'document'|'module'|'pet';
export interface Preferences {revision:number;theme:'light'|'dark'|'system';fontSize:number;nickname:string;avatarResourceId:string|null;navigation:Page[];pinned:Page[];homeSections:string[];shortcuts:Record<string,string>;onboardingComplete:boolean}
export const defaultPreferences:Preferences={revision:1,theme:'system',fontSize:15,nickname:'我的空间',avatarResourceId:null,navigation:['home','projects','resources','notes','tasks','search','modules','trash','settings','help'],pinned:[],homeSections:['projects','notes','tasks','modules'],shortcuts:{search:'K',newNote:'N',save:'S'},onboardingComplete:false};
export const pageLabels:Record<Page,string>={home:'首页',projects:'项目',resources:'资料',notes:'笔记',tasks:'任务',search:'搜索',modules:'模块',trash:'回收站',settings:'设置',help:'帮助',document:'文档',module:'模块工作区',pet:'桌宠'};
export const kindLabels:Record<string,string>={project:'项目',file:'文件',link:'链接',note:'笔记',task:'任务'};
export interface SearchHit {moduleId?:string|null;workId?:string|null;disabled?:boolean;kind:string;id:string;title:string;snippet:string;source:string;revision:number;updatedAt:string}
export interface Job {id:string;operation:string;status:string;progress:number;errorCode:ErrorCode|null;updatedAt:string}
export interface BackupRecord {id:string;createdAt:string;size:number;automatic:boolean}
export interface RestorePreview {id:string;createdAt:string;workspaceId:string;schemaVersion:number;projects:number;resources:number;tasks:number;fileCount:number}
export interface StorageInfo {location:string;databaseBytes:number;attachmentBytes:number;editingBytes:number;backupBytes:number;schemaVersion:number;appVersion:string}
export interface ModuleInfo {id:string;name:string;description:string;version:string;apiVersion:number;dataSchemaVersion:number;requestedServices:string[];state:string;enabled:boolean;errorCode:ErrorCode|null;dataBytes:number}
export interface TrashItem {kind:string;id:string;name:string;deletedAt:string;revision:number}
type Mutation={kind:string;id:string;baseRevision:number};
export interface FoundationCommands {
 module_access:{input:{id:string};output:ModuleInfo};
 startup_workspace:{input:Record<string,never>;output:{preferences:Preferences;location:{page:Page;entityId:string|null};notice:string|null}};
 get_preferences:{input:Record<string,never>;output:Preferences};
 save_preferences:{input:{baseRevision:number;preferences:Preferences};output:Preferences};
 reset_preferences:{input:Record<string,never>;output:Preferences};
 save_location:{input:{location:{page:Page;entityId:string|null}};output:null};
 search_workspace:{input:{keyword:string;kind:string|null;projectId:string|null;tag:string|null;offset:number;limit:number};output:{items:SearchHit[];hasMore:boolean;indexedAt:string}};
 rebuild_search:{input:Record<string,never>;output:null};
 dashboard:{input:Record<string,never>;output:{projects:Project[];notes:NoteSummary[];todayTasks:Task[];overdueTasks:Task[];today:string}};
 list_trash:{input:{offset:number;limit:number;kind:string|null};output:TrashItem[]};
 delete_impact:{input:Mutation;output:{item:TrashItem;moduleLinks?:number;resourceLinks:number;tasks:number;versions:number;sessions:number;sharedBlobs:number}};
 restore_trash:{input:Mutation;output:null};
 purge_trash:{input:Mutation;output:null};
 storage_info:{input:Record<string,never>;output:StorageInfo};
 open_data_directory:{input:Record<string,never>;output:null};
 export_diagnostics:{input:Record<string,never>;output:null};
 list_backups:{input:Record<string,never>;output:BackupRecord[]};
 start_backup:{input:Record<string,never>;output:Job};
 automatic_backup:{input:Record<string,never>;output:Job|null};
 export_backup:{input:{id:string};output:null};
 inspect_restore:{input:Record<string,never>;output:RestorePreview};
 start_restore:{input:{id:string};output:Job};
 list_jobs:{input:Record<string,never>;output:Job[]};
 cancel_job:{input:{id:string};output:null};
 list_modules:{input:Record<string,never>;output:ModuleInfo[]};
 set_module:{input:{id:string;enabled:boolean};output:ModuleInfo};
}
