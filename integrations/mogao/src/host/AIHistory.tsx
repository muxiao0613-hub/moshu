/* 墨枢适配：已修改原始版本，2026-10-17。原许可与版权见 integrations/mogao/LICENSE。 */
import {useEffect,useState} from 'react';
import {host} from './bridge';
interface Run {id:string;model:string;output:string;status:string;createdAt:string}
const labels:Record<string,string>={running:'生成中',completed:'已完成',cancelled:'已停止',failed:'未完整生成',interrupted:'上次中断'};
export function AIHistory(){
 const [runs,setRuns]=useState<Run[]>([]);const [error,setError]=useState('');
 useEffect(()=>{void host<Run[]>('api',{method:'GET',path:'/ai-runs'}).then(setRuns).catch(e=>setError(e.message));},[]);
 return <div className="space-y-3"><h2 className="font-semibold">最近生成记录</h2><p className="text-zinc-500">生成与中断的候选保存在本地。请审阅后复制需要的部分，记录不会自动覆盖正文。</p>{error&&<p role="alert">{error}</p>}{!runs.length&&!error&&<p className="text-zinc-500">尚无生成记录。</p>}{runs.map(run=><details key={run.id} className="border rounded p-3"><summary>{new Date(run.createdAt).toLocaleString()} · {run.model} · {labels[run.status] ?? run.status}</summary><textarea aria-label="已生成候选" readOnly value={run.output} className="mt-3 p-3 w-full min-h-48 bg-white dark:bg-zinc-800 border rounded"/></details>)}</div>;
}
