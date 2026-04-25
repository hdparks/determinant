import { useEffect, useCallback } from 'react';
import { useSSEContext } from '../contexts/sse-context';
import type { SSEEvent, SSEEventType } from '@determinant/types';

export function useSSE(
  eventType: SSEEventType,
  handler: (event: SSEEvent) => void,
  deps: React.DependencyList = []
) {
  const { subscribe } = useSSEContext();
  
  // Stable handler reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, deps);
  
  useEffect(() => {
    return subscribe(eventType, stableHandler);
  }, [eventType, stableHandler, subscribe]);
}

// Convenience hooks for specific event types
export function useTaskEvents(handler: (event: SSEEvent) => void, deps: React.DependencyList = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, deps);
  
  useSSE('task:created', stableHandler, [stableHandler]);
  useSSE('task:updated', stableHandler, [stableHandler]);
  useSSE('task:deleted', stableHandler, [stableHandler]);
}

export function useNodeEvents(handler: (event: SSEEvent) => void, deps: React.DependencyList = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, deps);
  
  useSSE('node:created', stableHandler, [stableHandler]);
  useSSE('node:updated', stableHandler, [stableHandler]);
  useSSE('node:processed', stableHandler, [stableHandler]);
}

export function useQueueEvents(handler: (event: SSEEvent) => void, deps: React.DependencyList = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableHandler = useCallback(handler, deps);
  
  useSSE('queue:updated', stableHandler, [stableHandler]);
}
