/** 托管请求的预占/待核对反馈；数据读取在 managedRequests hook。 */
import { Button } from '@/shared/ui/button';
import { useManagedRequests } from './managedRequests';

const STATUS = { reserved: '生成中，额度已预留', ready: '等待结算重试', pending: '等待用量核对', settled: '已按实际用量结算', refunded: '已释放预占' };
export function ManagedRequestsPanel({ onRefreshBalance }: { onRefreshBalance: () => Promise<void> }) {
  const { requests, loading, error, refresh } = useManagedRequests(onRefreshBalance);
  const pending = requests.filter(r => ['reserved', 'ready', 'pending'].includes(r.status));
  const held = pending.reduce((n, r) => n + Number(r.reservedCny), 0);
  return <div className="space-y-2 text-xs text-zinc-500">
    <div className="flex items-center justify-between gap-2">
      <span>可用余额已扣除预留额度；待处理预留 ¥{held.toFixed(4)}</span>
      <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>{loading ? '查询中' : '刷新账单'}</Button>
    </div>
    {error && <p className="text-red-500">账单查询失败：{error}</p>}
    {pending.map(r => <div key={r.id} className="rounded border border-zinc-200 dark:border-zinc-700 p-2 space-y-1">
      <p>{r.model} · {STATUS[r.status]} · ¥{Number(r.reservedCny).toFixed(4)}</p>
      <p className="break-all">请求编号：{r.id}</p>
      {r.reason && <p>{r.reason}</p>}
    </div>)}
    <p>预留额度在确认实际用量后释放并结算。用量缺失时保留待核对记录，可凭请求编号联系管理员处理。</p>
  </div>;
}
