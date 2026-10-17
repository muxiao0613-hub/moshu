import type {ComponentType,Ref} from 'react';
import type {EditorHandle} from '../platform/NoteEditor';
import {lazy} from 'react';
import type {SearchHit} from '../contracts';
const MogaoWorkspace=lazy(()=>import('./mogao/IntegratedWorkspace').then(m=>({default:m.IntegratedWorkspace})));
export interface BuiltInModulePage {id:string;Component:ComponentType<{editorRef:Ref<EditorHandle|null>;target?:SearchHit|null}>;contentLabels?:Record<string,string>}
// Trusted, compiled-in pages only. Add delivered modules here; test pages stay in tests.
export const builtInModulePages:readonly BuiltInModulePage[]=[{id:'mogao',Component:MogaoWorkspace,contentLabels:{'mogao-studio-projects':'作品（写作台）','mogao-studio-chapters':'章节（写作台）','mogao-studio-characters':'人物（写作台）','mogao-studio-world-settings':'世界观（写作台）','mogao-studio-outlines':'大纲（写作台）','mogao-studio-plot-threads':'伏笔','mogao-studio-timeline-events':'时间线','mogao-studio-materials':'素材','mogao-studio-short-stories':'短篇','mogao-work':'作品','mogao-chapter':'章节','mogao-character':'人物','mogao-world':'世界观','mogao-outline':'大纲计划'}}];

export const moduleContentLabels:Record<string,string>=Object.assign({},...builtInModulePages.map(p=>p.contentLabels??{}));
