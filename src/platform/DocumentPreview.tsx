import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentView, Resource } from '../contracts';
import { command, asAppError } from '../shared/lib/bridge';
import { ErrorMessage } from '../shared/ui/ErrorMessage';

export function canReadDocument(resource: Resource) {
  return resource.kind === 'file' && /\.(md|markdown|docx|xlsx|csv|tsv)$/i.test(resource.originalName ?? '');
}
export function columnName(index: number): string {
  let label = '';let value = index+1;
  while (value>0) {label = String.fromCharCode(65+(value-1)%26)+label;value = Math.floor((value-1)/26);}
  return label;
}
export function DocumentPreview({resource}: {resource: Resource}) {
  const [view,setView] = useState<DocumentView | null>(null);
  const [error,setError] = useState<ReturnType<typeof asAppError> | null>(null);
  const [loading,setLoading] = useState(true);
  const [offset,setOffset] = useState(0);const [column,setColumn] = useState(0);const [sheet,setSheet] = useState(0);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;setLoading(true);setError(null);
    try {
      const result = await command('read_document',{id:resource.id,baseRevision:resource.revision,offset,limit:50,sheetIndex:sheet,columnOffset:column,columnLimit:10});
      if (result.resourceId !== resource.id || result.sourceRevision !== resource.revision) throw new Error('Invalid document receipt');
      if (generation.current === current) setView(result);
    } catch (error) {if (generation.current === current) setError(asAppError(error));}
    finally {if (generation.current === current) setLoading(false);}
  },[resource.id,resource.revision,offset,column,sheet]);
  useEffect(() => {void reload();return () => {generation.current+=1;};},[reload]);
  return <section className="document-preview" aria-label="文档阅读">
    <p className="muted">这里展示资料库的已保存内容；点击“编辑文档”修改并提交新版本。</p>
    <ErrorMessage error={error} retry={() => {void reload();}} />
    {loading ? <p role="status">正在读取文档…</p> : !error && view && <>
      {view.warnings.map(warning => <p key={warning} className="muted">{warning}</p>)}
      {view.format === 'xlsx' && <label>工作表<select value={sheet} onChange={event => {setSheet(Number(event.target.value));setOffset(0);setColumn(0);}}>{view.sheets.map((name,index) => <option value={index} key={index}>{name}</option>)}</select></label>}
      {/* html is generated exclusively by the Rust CommonMark renderer, which escapes raw HTML and removes link/image destinations. */}
      {view.html !== null && <div className="markdown-preview" dangerouslySetInnerHTML={{__html:view.html}} />}
      {view.blocks.map((block,index) => block.kind === 'paragraph' ? block.level ? <div role="heading" aria-level={block.level} className={`word-heading level-${block.level}`} key={offset+index}>{block.text}</div> : <p className="word-paragraph" key={offset+index}>{block.text || '\u00a0'}</p> : <div className="document-table-scroll" key={offset+index}><table><tbody>{block.rows.map((row,r) => <tr key={r}>{row.map((text,c) => <td key={c}>{text}</td>)}</tr>)}</tbody></table></div>)}
      {view.table && <>
        <p className="metadata">{view.table.rowCount.toLocaleString()} 行 · {view.table.columnCount.toLocaleString()} 列 · 保留原始行列位置</p>
        <div className="document-table-scroll" tabIndex={0} aria-label="表格单元格"><table><thead><tr><th scope="col">行</th>{Array.from({length:Math.max(0,Math.min(10,view.table.columnCount-column))},(_,index) => <th scope="col" key={index}>{columnName(column+index)}</th>)}</tr></thead><tbody>{view.table.rows.map((row,index) => <tr key={offset+index}><th scope="row">{offset+index+1}</th>{row.map((cell,c) => <td key={c} className={`cell-${cell.valueType}`}><span>{cell.text || (cell.formula ? '无缓存结果' : '')}</span>{cell.formula && <details><summary>公式</summary><code>{cell.formula}</code></details>}</td>)}</tr>)}</tbody></table></div>
        {!view.table.rowCount && <p className="empty-state">此工作表没有单元格数据。</p>}
        <div className="pagination"><button disabled={!column} onClick={() => setColumn(column-10)}>上一组列</button><span>{columnName(column)}–{columnName(Math.max(column,Math.min(column+9,view.table.columnCount-1)))}</span><button disabled={column+10>=view.table.columnCount} onClick={() => setColumn(column+10)}>下一组列</button></div>
      </>}
      {(view.table || view.format === 'docx') && <div className="pagination"><button disabled={!offset} onClick={() => setOffset(offset-50)}>上一页内容</button><span>第 {offset/50+1} 页</span><button disabled={offset+50>=(view.table?.rowCount ?? view.blockCount)} onClick={() => setOffset(offset+50)}>下一页内容</button></div>}
      {view.format === 'docx' && !view.blockCount && <p className="empty-state">文档没有可读取的正文段落或表格。</p>}
    </>}
  </section>;
}
