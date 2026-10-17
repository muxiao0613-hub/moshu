import {useContext,useEffect,useImperativeHandle,useRef,useState} from 'react';
import type {Ref} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type {EditorHandle} from '../../platform/NoteEditor';
import {SaveSession} from '../../shared/editor/save-session';
import type {SaveState} from '../../shared/editor/save-session';
import {ShortcutContext} from '../../shared/editor/shortcuts';
import {command,asAppError} from '../../shared/lib/bridge';
import {ErrorMessage} from '../../shared/ui/ErrorMessage';
import type {Chapter,Draft,Version} from './contracts';
const labels={saved:'已保存',dirty:'未保存',saving:'保存中',failed:'保存失败',conflict:'版本冲突'};
export function ChapterEditor({chapter,recovery,editorRef,onSaved}:{chapter:Chapter;recovery:Draft|null;editorRef:Ref<EditorHandle|null>;onSaved:()=>void}) {
 const shortcuts=useContext(ShortcutContext);const [sessionId]=useState(()=>recovery?.draft.sessionId??crypto.randomUUID());
 const [title,setTitle]=useState(recovery?.draft.title??chapter.title);const titleRef=useRef(title);const [find,setFind]=useState('');const [lineHeight,setLineHeight]=useState('1.9');const [focus,setFocus]=useState(false);
 const [state,setState]=useState<SaveState>({status:'saved',dirty:false,revision:chapter.revision,sequence:0,error:null,draftError:null});
 const [error,setError]=useState<ReturnType<typeof asAppError>|null>(null);const [current,setCurrent]=useState<Chapter|null>(null);const [versions,setVersions]=useState<Version[]|null>(null);const [selected,setSelected]=useState<Version|null>(null);const [busy,setBusy]=useState(false);const action=useRef(false);const recovered=useRef(false);
 const onSavedRef=useRef(onSaved);onSavedRef.current=onSaved;const scope={workId:chapter.workId,id:chapter.id};
 const [session]=useState(()=>new SaveSession(chapter,input=>command('mogao_save_chapter',{workId:chapter.workId,save:{...input,requestId:crypto.randomUUID()}}),next=>{setState(next);if(next.status==='saved')onSavedRef.current();},{
  write:s=>command('mogao_write_draft',{workId:chapter.workId,draft:{sessionId,noteId:chapter.id,title:s.title,body:s.body,schemaVersion:s.schemaVersion,baseRevision:s.baseRevision,clientEditSequence:s.clientEditSequence}}),
  clear:throughSequence=>command('mogao_clear_draft',{workId:chapter.workId,id:chapter.id,sessionId,throughSequence}),
 }));
 const editor=useEditor({extensions:[StarterKit.configure({code:false,codeBlock:false,link:false})],content:recovery?.draft.body??chapter.body,editorProps:{attributes:{'aria-label':'章节正文',role:'textbox','aria-multiline':'true'}},onUpdate:({editor})=>session.edit(titleRef.current,editor.getJSON())});
 useImperativeHandle(editorRef,()=>({flush:()=>action.current?Promise.resolve(false):session.flush(),checkpoint:()=>session.checkpoint()}),[session]);
 useEffect(()=>{if(recovery&&!recovered.current){recovered.current=true;session.recover(recovery.draft);}},[recovery,session]);
 useEffect(()=>{editor?.setEditable(!busy,false);},[editor,busy]);
 useEffect(()=>{const t=window.setInterval(()=>{void session.checkpoint();},2000);return()=>window.clearInterval(t);},[session]);
 useEffect(()=>{if(busy||!state.dirty||['conflict','failed'].includes(state.status))return;const t=window.setTimeout(()=>{void session.save();},1000);return()=>window.clearTimeout(t);},[session,state.sequence,state.dirty,state.status,busy]);
 useEffect(()=>{const t=window.setInterval(()=>{if(!action.current&&session.state.dirty&&!['failed','conflict'].includes(session.state.status))void session.save();},5000);return()=>window.clearInterval(t);},[session]);
 useEffect(()=>{const listener=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toUpperCase()===shortcuts.save){e.preventDefault();if(!action.current&&!e.isComposing&&!session.composing)void session.save(true);}if(e.key==='Escape')setFocus(false);};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[session,shortcuts.save]);
 useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(session.state.dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);},[session]);
 async function run(work:()=>Promise<void>){if(action.current)return;action.current=true;setBusy(true);setError(null);try{await work();}catch(e){setError(asAppError(e));}finally{action.current=false;setBusy(false);}}
 function findNext(){if(!editor||!find)return;const found:{from:number;to:number}[]=[];editor.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return true;const text=node.textBetween(0,node.content.size,'','\n');let offset=text.indexOf(find);while(offset>=0){found.push({from:pos+1+offset,to:pos+1+offset+find.length});offset=text.indexOf(find,offset+find.length);}return false;});const next=found.find(m=>m.from>=editor.state.selection.to)??found[0];if(next)editor.chain().focus().setTextSelection(next).scrollIntoView().run();}
 const text=editor?.getText()??chapter.plainText;const count=Array.from(text).filter(c=>!c.match(/\s/u)).length;
 return <section className={`note-editor mogao-editor${focus?' focus-mode':''}`} aria-label="章节编辑器" onCompositionStart={()=>{session.composing=true;}} onCompositionEnd={()=>{session.composing=false;if(editor)session.edit(titleRef.current,editor.getJSON());}}>
  <div className="editor-header"><span role="status" className={`save-indicator ${state.status}`}>{labels[state.status]}{state.status==='saving'&&state.dirty?' · 仍有新输入':''}</span><span className="muted">版本 {state.revision} · {count} 字</span><button disabled={busy||state.status==='conflict'} onClick={()=>{void session.save(true);}}>保存并建立版本</button><button disabled={busy} onClick={()=>{void run(async()=>{if(versions){setVersions(null);return;}setVersions(await command('mogao_versions',scope));});}}>历史版本</button><button onClick={()=>setFocus(!focus)}>{focus?'退出专注':'专注写作'}</button></div>
  <ErrorMessage error={error}/><ErrorMessage error={state.error} retry={state.status==='failed'?()=>{void session.save();}:undefined}/><ErrorMessage error={state.draftError} retry={()=>{void session.checkpoint();}}/>
  {recovery&&<p className="muted">恢复稿时间：{new Date(recovery.updatedAt).toLocaleString()}。对照数据库稿后再合并保存。</p>}
  {state.status==='conflict'&&<div className="conflict-panel"><p>本地编辑稿保留在下方。请查看数据库稿，手动合并后提交。</p><button disabled={busy} onClick={()=>{void run(async()=>{setCurrent(await command('mogao_chapter',scope));});}}>查看数据库稿</button>{current&&<><strong>{current.title} · 数据库版本 {current.revision}</strong><pre>{current.plainText}</pre><button disabled={busy||session.composing} onClick={()=>{void run(async()=>{session.rebase(current.revision);await session.save(true);setCurrent(null);});}}>保存合并稿</button></>}</div>}
  <label>章节标题<input value={title} maxLength={200} disabled={busy} onChange={e=>{setTitle(e.target.value);titleRef.current=e.target.value;if(editor)session.edit(e.target.value,editor.getJSON());}}/></label>
  <fieldset className="editor-toolbar" disabled={busy}><legend className="sr-only">正文格式</legend><button onClick={()=>editor?.chain().focus().toggleBold().run()}>粗体</button><button onClick={()=>editor?.chain().focus().toggleItalic().run()}>斜体</button><button onClick={()=>editor?.chain().focus().toggleHeading({level:2}).run()}>标题</button><button onClick={()=>editor?.chain().focus().toggleBlockquote().run()}>引用</button><button onClick={()=>editor?.chain().focus().undo().run()}>撤销</button><button onClick={()=>editor?.chain().focus().redo().run()}>重做</button><label>行距<select value={lineHeight} onChange={e=>setLineHeight(e.target.value)}><option>1.5</option><option>1.9</option><option>2.3</option></select></label></fieldset>
  <div className="mogao-find"><label>段落查找<input value={find} onChange={e=>setFind(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();findNext();}}}/></label><button disabled={!find} onClick={findNext}>下一个匹配</button>{find&&!text.includes(find)&&<span role="status">未找到匹配文字</span>}</div>
  {versions&&<section className="note-history"><h3>章节历史版本</h3>{versions.map(v=><button key={v.id} disabled={busy} onClick={()=>setSelected(v)}>版本 {v.sourceRevision} · {v.title}</button>)}{!versions.length&&<p>还没有手动建立的历史版本。</p>}{selected&&<><pre>{selected.plainText}</pre><button disabled={busy||state.status==='conflict'} onClick={()=>{void run(async()=>{if(!await session.flush())return;const next=await command('mogao_restore',{...scope,versionId:selected.id,baseRevision:session.state.revision});session.load(next);setTitle(next.title);titleRef.current=next.title;editor?.commands.setContent(next.body,{emitUpdate:false});setVersions(null);setSelected(null);onSavedRef.current();});}}>恢复此版本</button></>}</section>}
  <div style={{lineHeight}}><EditorContent editor={editor}/></div><p className="editor-footer">字数按非空白 Unicode 字符计数，包含标点。停止输入后自动保存；每两秒保留未保存内容的恢复稿。</p>
 </section>;
}
