/** 设置页托管请求状态；通过 API 读取持久账本，避免把预占误报为最终扣费。 */
import { useCallback, useEffect, useState } from 'react';
import { apiClient, unwrap } from '@/api/client';

export interface ManagedRequest {
  id: string; model: string; status: 'reserved' | 'ready' | 'pending' | 'settled' | 'refunded';
  reservedCny: string; reason?: string; createdAt: string;
}
export function useManagedRequests(onRefreshBalance: () => Promise<void>) {
  const [requests, setRequests] = useState<ManagedRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(unwrap<ManagedRequest[]>(await apiClient.get('/billing/requests')));
      await onRefreshBalance();
      setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [onRefreshBalance]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { requests, loading, error, refresh };
}
