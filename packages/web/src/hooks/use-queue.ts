import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useSSE } from './use-sse';
import type { SSEEvent, QueueItem } from '@determinant/types';

export function useQueue(limit = 10) {
  return useQuery({
    queryKey: ['queue', limit],
    queryFn: () => apiClient.getQueue(limit),
    select: (data) => data.items,
  });
}

export function useQueueSSESync() {
  const queryClient = useQueryClient();
  
  useSSE('queue:updated', (event: SSEEvent) => {
    if (event.type !== 'queue:updated') return;
    
    // Queue event contains full queue (see types/index.ts:129)
    const queueItems = event.data;
    
    // Update all queue caches (different limit params)
    queryClient.setQueriesData(
      { queryKey: ['queue'] },
      (old: { items: QueueItem[] } | undefined) => {
        if (!old) return old;
        
        // Respect the limit from the original query
        const limit = old.items.length;
        return {
          items: queueItems.slice(0, limit)
        };
      }
    );
  });
}

