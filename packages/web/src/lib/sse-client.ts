import type { SSEEvent, SSEEventType } from '@determinant/types';

export type SSEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSEClientConfig {
  url: string;
  apiKey?: string;
  onEvent: (event: SSEEvent) => void;
  onStateChange: (state: SSEConnectionState) => void;
  maxReconnectAttempts?: number;
  baseReconnectIntervalMs?: number;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private state: SSEConnectionState = 'disconnected';
  private config: Required<SSEClientConfig>;
  private isClosed = false;

  constructor(config: SSEClientConfig) {
    this.config = {
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      baseReconnectIntervalMs: config.baseReconnectIntervalMs ?? 1000,
      url: config.url,
      apiKey: config.apiKey ?? '',
      onEvent: config.onEvent,
      onStateChange: config.onStateChange,
    };
  }

  connect(): void {
    if (this.isClosed) {
      console.warn('SSEClient: Cannot connect after close() was called');
      return;
    }

    if (this.eventSource?.readyState === EventSource.OPEN) {
      console.warn('SSEClient: Already connected');
      return;
    }

    this.setState('connecting');

    // Build URL with API key as query parameter
    const url = new URL(this.config.url);
    if (this.config.apiKey) {
      url.searchParams.set('apiKey', this.config.apiKey);
    }

    try {
      this.eventSource = new EventSource(url.toString());

      this.eventSource.onopen = () => {
        console.log('SSEClient: Connection established');
        this.reconnectAttempts = 0;
        this.setState('connected');
      };

      this.eventSource.onerror = (error) => {
        console.error('SSEClient: Connection error', error);
        
        // Check if it's an authentication error (EventSource doesn't expose status codes directly)
        // We'll rely on the error state and manual reconnection
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.setState('error');
          this.scheduleReconnect();
        }
      };

      // Listen for all SSE event types
      const eventTypes: SSEEventType[] = [
        'task:created',
        'task:updated',
        'task:deleted',
        'node:created',
        'node:updated',
        'node:processed',
        'queue:updated',
      ];

      eventTypes.forEach((eventType) => {
        this.eventSource!.addEventListener(eventType, (event) => {
          try {
            const data = JSON.parse((event as MessageEvent).data);
            const sseEvent: SSEEvent = {
              type: eventType,
              data,
            } as SSEEvent;
            this.config.onEvent(sseEvent);
          } catch (error) {
            console.error(`SSEClient: Failed to parse event ${eventType}`, error);
          }
        });
      });
    } catch (error) {
      console.error('SSEClient: Failed to create EventSource', error);
      this.setState('error');
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.setState('disconnected');
  }

  close(): void {
    this.isClosed = true;
    
    // Clear reconnect timer FIRST (before disconnect) to prevent any race conditions
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.disconnect();
  }

  reconnect(): void {
    this.disconnect();
    this.reconnectAttempts = 0;
    this.connect();
  }

  getState(): SSEConnectionState {
    return this.state;
  }

  private setState(state: SSEConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.config.onStateChange(state);
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('SSEClient: Max reconnection attempts reached');
      this.setState('error');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    const delay = Math.min(
      this.config.baseReconnectIntervalMs * Math.pow(2, this.reconnectAttempts),
      32000
    );

    console.log(`SSEClient: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.config.maxReconnectAttempts})`);

    this.reconnectAttempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
