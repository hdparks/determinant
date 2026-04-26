import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SSEClient, SSEConnectionState } from '../lib/sse-client';
import type { SSEEvent, SSEEventType } from '@determinant/types';

interface SSEContextValue {
  state: SSEConnectionState;
  subscribe: (eventType: SSEEventType, handler: (event: SSEEvent) => void) => () => void;
  reconnect: () => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

const API_URL = import.meta.env.VITE_DETERMINANT_SERVER_URL || 
  (import.meta.env.DEV && typeof window !== 'undefined' 
    ? window.location.origin 
    : 'http://localhost:10110');
const API_KEY = import.meta.env.VITE_DETERMINANT_API_KEY;

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SSEConnectionState>('disconnected');
  const queryClient = useQueryClient();
  const clientRef = useRef<SSEClient | null>(null);
  const handlersRef = useRef<Map<SSEEventType, Set<(event: SSEEvent) => void>>>(new Map());
  const previousStateRef = useRef<SSEConnectionState>('disconnected');

  // Initialize SSE client
  useEffect(() => {
    const handleEvent = (event: SSEEvent) => {
      const handlers = handlersRef.current.get(event.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event);
          } catch (error) {
            console.error(`SSEContext: Error in event handler for ${event.type}`, error);
          }
        });
      }
    };

    const handleStateChange = (newState: SSEConnectionState) => {
      const previousState = previousStateRef.current;
      previousStateRef.current = newState;
      setState(newState);
      
      // If we just reconnected after being disconnected/error, invalidate all queries
      // to ensure we have the latest data (in case we missed events)
      if (newState === 'connected' && (previousState === 'disconnected' || previousState === 'error')) {
        console.log('SSEContext: Reconnected, invalidating all queries to sync missed events');
        queryClient.invalidateQueries();
      }
    };

    const client = new SSEClient({
      url: `${API_URL}/api/events`,
      apiKey: API_KEY,
      onEvent: handleEvent,
      onStateChange: handleStateChange,
    });

    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [queryClient]);

  const subscribe = useCallback((eventType: SSEEventType, handler: (event: SSEEvent) => void) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set());
    }

    const handlers = handlersRef.current.get(eventType)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        handlersRef.current.delete(eventType);
      }
    };
  }, []);

  const reconnect = useCallback(() => {
    clientRef.current?.reconnect();
  }, []);

  const contextValue: SSEContextValue = {
    state,
    subscribe,
    reconnect,
  };

  return <SSEContext.Provider value={contextValue}>{children}</SSEContext.Provider>;
}

export function useSSEContext() {
  const context = useContext(SSEContext);
  if (!context) {
    throw new Error('useSSEContext must be used within SSEProvider');
  }
  return context;
}
