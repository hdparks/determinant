import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/api-client';
import { useSSE } from './use-sse';
import type { SSEEvent, QueueItem } from '@determinant/types';

/**
 * Fetch human queue items (non-claimable nodes requiring human input)
 */
export function useHumanQueue(limit?: number) {
  return useQuery({
    queryKey: ['humanQueue', limit],
    queryFn: () => apiClient.getHumanQueue(limit),
    select: (data) => data.items,
  });
}

/**
 * SSE sync for real-time human queue updates
 * Call this in your Layout component to keep the queue updated
 */
export function useHumanQueueSSESync() {
  const queryClient = useQueryClient();
  
  // When new non-claimable node created (human checkpoint)
  useSSE('node:created', (event: SSEEvent) => {
    if (event.type !== 'node:created') return;
    
    const { task, node } = event.data;
    
    // Only add non-claimable nodes (human checkpoints)
    if (node.claimable) return;
    
    // Add new item to all relevant human queue caches
    queryClient.setQueriesData(
      { queryKey: ['humanQueue'] },
      (old: { items: QueueItem[] } | undefined) => {
        if (!old) return old;
        
        // Create new queue item with default score/confidence
        const newItem: QueueItem = {
          node,
          task,
          score: 0, // Default score, will be corrected on next refetch if needed
          confidence: null,
        };
        
        // Prepend to show new items at top
        return { items: [newItem, ...old.items] };
      }
    );
  });
  
  // When node processed (approval completed) - remove from queue
  useSSE('node:processed', (event: SSEEvent) => {
    if (event.type !== 'node:processed') return;
    
    const node = event.data; // Node object
    
    // Remove processed item from queue
    queryClient.setQueriesData(
      { queryKey: ['humanQueue'] },
      (old: { items: QueueItem[] } | undefined) => {
        if (!old) return old;
        return {
          items: old.items.filter(item => item.node.id !== node.id)
        };
      }
    );
  });
  
  // When task updated - update task data in queue items
  useSSE('task:updated', (event: SSEEvent) => {
    if (event.type !== 'task:updated') return;
    
    const task = event.data; // Task object
    
    // Update task in any queue items referencing it
    queryClient.setQueriesData(
      { queryKey: ['humanQueue'] },
      (old: { items: QueueItem[] } | undefined) => {
        if (!old) return old;
        return {
          items: old.items.map(item =>
            item.task.id === task.id
              ? { ...item, task } // Update task while keeping node/score/confidence
              : item
          )
        };
      }
    );
  });
}
