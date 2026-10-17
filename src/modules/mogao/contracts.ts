import type {Note,NoteDraft,SaveNote,SaveReceipt} from '../../contracts';
export interface WorkFields {name:string;synopsis:string;goal:string;genre:string;favorite:boolean;archived:boolean;projectId:string|null;coverResourceId:string|null}
export interface Work {id:string;fields:WorkFields;revision:number;settingsRevision:number;treeRevision:number;createdAt:string;updatedAt:string;deletedAt:string|null}
export interface Volume {id:string;title:string;position:number;revision:number;deletedAt:string|null}
export interface ChapterSummary {id:string;workId:string;volumeId:string|null;title:string;position:number;status:string;revision:number;wordCount:number;deletedAt:string|null}
export interface Chapter extends Note {workId:string;volumeId:string|null;position:number;status:string;wordCount:number}
export interface Tree {work:Work;volumes:Volume[];chapters:ChapterSummary[]}
export interface Version {id:string;chapterId:string;sourceRevision:number;title:string;body:Note['body'];plainText:string;schemaVersion:number;createdAt:string}
export interface Draft {draft:NoteDraft;updatedAt:string}
export type SettingKind='character'|'world'|'outline';
export interface SettingFields {aliases:string;description:string;goal:string;relationships:string;fixed:string;category:string;body:string;relatedCharacters:string[];resourceIds:string[]}
export interface Setting {id:string;workId:string;kind:SettingKind;title:string;fields:SettingFields;parentId:string|null;chapterId:string|null;position:number;revision:number;updatedAt:string;deletedAt:string|null}
export interface ImportChapter {title:string;text:string}
type Scope={workId:string};type Entity=Scope&{id:string};type Mutation=Entity&{baseRevision:number;deleted:boolean};
export interface MogaoCommands {
 mogao_location:{input:Record<string,never>;output:{workId:string|null;chapterId:string|null}};
 mogao_save_location:{input:{location:{workId:string|null;chapterId:string|null}};output:null};
 mogao_works:{input:{keyword:string;deleted:boolean;offset:number;limit:number};output:Work[]};
 mogao_save_work:{input:{id:string|null;baseRevision:number|null;fields:WorkFields};output:Work};
 mogao_delete_work:{input:Mutation;output:Work};
 mogao_tree:{input:Scope;output:Tree};
 mogao_create_node:{input:Scope&{kind:'chapter'|'volume';title:string;volumeId:string|null;treeRevision:number};output:Tree};
 mogao_move_node:{input:Entity&{kind:'chapter'|'volume';title:string;volumeId:string|null;position:number;status:string;treeRevision:number;baseRevision:number};output:Tree};
 mogao_delete_volume:{input:Mutation;output:Tree};
 mogao_copy_draft:{input:Entity;output:Chapter};
 mogao_delete_chapter:{input:Mutation;output:Tree};
 mogao_chapter:{input:Entity;output:Chapter};
 mogao_save_chapter:{input:Scope&{save:SaveNote&{requestId:string}};output:SaveReceipt};
 mogao_versions:{input:Entity;output:Version[]};
 mogao_restore:{input:Entity&{versionId:string;baseRevision:number};output:Chapter};
 mogao_draft:{input:Entity;output:Draft|null};
 mogao_write_draft:{input:Scope&{draft:NoteDraft};output:null};
 mogao_clear_draft:{input:Entity&{sessionId:string;throughSequence:number};output:null};
 mogao_settings:{input:Scope;output:Setting[]};
 mogao_save_setting:{input:Scope&{id:string|null;baseRevision:number|null;kind:SettingKind;title:string;fields:SettingFields;parentId:string|null;chapterId:string|null;position:number};output:Setting};
 mogao_delete_setting:{input:Mutation;output:null};
 mogao_preview_txt:{input:Record<string,never>;output:ImportChapter[]};
 mogao_import:{input:{name:string;chapters:ImportChapter[]};output:Work};
 mogao_export:{input:Scope&{chapterIds:string[];format:'txt'|'markdown'|'json'};output:null};
}
export const emptyWork:WorkFields={name:'',synopsis:'',goal:'',genre:'',favorite:false,archived:false,projectId:null,coverResourceId:null};
export const emptySetting:SettingFields={aliases:'',description:'',goal:'',relationships:'',fixed:'',category:'',body:'',relatedCharacters:[],resourceIds:[]};
