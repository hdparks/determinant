import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEClient } from './sse-client';

describe('SSEClient', () => {
  let mockEventSource: any;
  let mockES: any;
  
  beforeEach(() => {
    // Set up EventSource mock class
    mockES = class MockEventSource {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      
      readyState = 0;
      url: string;
      onopen: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      
      constructor(url: string) {
        this.url = url;
        mockEventSource = this;
      }
      
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
      close = vi.fn();
      dispatchEvent = vi.fn();
    };
    
    (global as any).EventSource = mockES;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Connection Lifecycle', () => {
    test('connects and sets connecting state', () => {
      const onStateChange = vi.fn();
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange,
      });

      client.connect();

      expect(onStateChange).toHaveBeenCalledWith('connecting');
      expect(client.getState()).toBe('connecting');
      expect(mockEventSource.url).toBe('http://localhost:10110/api/events');
    });

    test('includes API key as query parameter', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        apiKey: 'test-key-123',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();

      expect(mockEventSource.url).toBe('http://localhost:10110/api/events?apiKey=test-key-123');
    });

    test('transitions to connected when connection opens', () => {
      const onStateChange = vi.fn();
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange,
      });

      client.connect();
      
      // Simulate connection success
      mockEventSource.readyState = 1; // OPEN
      mockEventSource.onopen!({} as Event);

      expect(onStateChange).toHaveBeenCalledWith('connected');
      expect(client.getState()).toBe('connected');
    });

    test('disconnect closes connection and clears state', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();
      client.disconnect();

      expect(mockEventSource.close).toHaveBeenCalled();
      expect(client.getState()).toBe('disconnected');
    });

    test('close() prevents reconnection', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();
      const firstSource = mockEventSource;
      
      // Trigger error
      mockEventSource.readyState = 2; // CLOSED
      mockEventSource.onerror!({} as Event);
      
      // Close client before reconnect timer fires
      client.close();
      
      // Advance timers
      vi.advanceTimersByTime(60000);

      // Should not create new EventSource
      expect(mockEventSource).toBe(firstSource);
    });

    test('close() clears reconnect timer', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();
      
      // Trigger error to start reconnect timer
      mockEventSource.readyState = 2; // CLOSED
      mockEventSource.onerror!({} as Event);
      
      // Close should clear the timer
      client.close();
      
      // Advancing time should not create new connection
      const closedSource = mockEventSource;
      vi.advanceTimersByTime(5000);
      
      expect(mockEventSource).toBe(closedSource);
    });
  });

  describe('Reconnection', () => {
    test('schedules reconnection after error with exponential backoff', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();
      const firstSource = mockEventSource;

      // First failure -> 1s delay
      mockEventSource.readyState = 2; // CLOSED
      mockEventSource.onerror!({} as Event);
      
      vi.advanceTimersByTime(999);
      expect(mockEventSource).toBe(firstSource);
      
      vi.advanceTimersByTime(1);
      expect(mockEventSource).not.toBe(firstSource);
      
      const secondSource = mockEventSource;

      // Second failure -> 2s delay
      mockEventSource.readyState = 2;
      mockEventSource.onerror!({} as Event);
      
      vi.advanceTimersByTime(1999);
      expect(mockEventSource).toBe(secondSource);
      
      vi.advanceTimersByTime(1);
      expect(mockEventSource).not.toBe(secondSource);
    });

    test('stops reconnecting after max attempts', () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const onStateChange = vi.fn();
      
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange,
        maxReconnectAttempts: 3,
      });

      client.connect();

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        mockEventSource.readyState = 2;
        mockEventSource.onerror!({} as Event);
        vi.advanceTimersByTime(Math.pow(2, i) * 1000);
      }

      // Should have stopped reconnecting (state: error)
      expect(onStateChange).toHaveBeenCalledWith('error');
      
      const lastSource = mockEventSource;
      // No more reconnections
      vi.advanceTimersByTime(60000);
      expect(mockEventSource).toBe(lastSource);

      consoleLogSpy.mockRestore();
    });

    test('resets reconnect attempts after successful connection', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();

      // Fail once
      mockEventSource.readyState = 2;
      mockEventSource.onerror!({} as Event);
      vi.advanceTimersByTime(1000);

      // Succeed
      mockEventSource.readyState = 1; // OPEN
      mockEventSource.onopen!({} as Event);

      // Fail again - should use 1s delay (reset)
      mockEventSource.readyState = 2;
      mockEventSource.onerror!({} as Event);
      
      const source = mockEventSource;
      vi.advanceTimersByTime(999);
      expect(mockEventSource).toBe(source);
      
      vi.advanceTimersByTime(1);
      expect(mockEventSource).not.toBe(source);
    });
  });

  describe('Event Handling', () => {
    test('registers event listeners for all event types', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
      });

      client.connect();

      const eventTypes = [
        'task:created',
        'task:updated',
        'task:deleted',
        'node:created',
        'node:updated',
        'node:processed',
        'queue:updated',
      ];

      eventTypes.forEach(eventType => {
        expect(mockEventSource.addEventListener).toHaveBeenCalledWith(
          eventType,
          expect.any(Function)
        );
      });
    });

    test('parses and dispatches events correctly', () => {
      const onEvent = vi.fn();
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent,
        onStateChange: vi.fn(),
      });

      client.connect();

      // Find the listener for task:created
      const calls = mockEventSource.addEventListener.mock.calls;
      const taskCreatedCall = calls.find((call: any) => call[0] === 'task:created');
      const listener = taskCreatedCall![1];

      // Simulate event
      listener({
        data: JSON.stringify({ id: 'task-123', vibe: 'Test Task' }),
      });

      expect(onEvent).toHaveBeenCalledWith({
        type: 'task:created',
        data: { id: 'task-123', vibe: 'Test Task' },
      });
    });

    test('handles JSON parse errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onEvent = vi.fn();
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent,
        onStateChange: vi.fn(),
      });

      client.connect();

      const calls = mockEventSource.addEventListener.mock.calls;
      const taskCreatedCall = calls.find((call: any) => call[0] === 'task:created');
      const listener = taskCreatedCall![1];

      // Simulate invalid JSON
      listener({ data: 'invalid json' });

      expect(consoleSpy).toHaveBeenCalled();
      expect(onEvent).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Configuration', () => {
    test('uses custom reconnect interval', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
        baseReconnectIntervalMs: 500,
      });

      client.connect();
      const firstSource = mockEventSource;

      mockEventSource.readyState = 2;
      mockEventSource.onerror!({} as Event);

      // Should reconnect after 500ms
      vi.advanceTimersByTime(500);
      expect(mockEventSource).not.toBe(firstSource);
    });

    test('caps exponential backoff at 32 seconds', () => {
      const client = new SSEClient({
        url: 'http://localhost:10110/api/events',
        onEvent: vi.fn(),
        onStateChange: vi.fn(),
        maxReconnectAttempts: 20,
      });

      client.connect();

      // Trigger many failures to test cap
      for (let i = 0; i < 10; i++) {
        const source = mockEventSource;
        mockEventSource.readyState = 2;
        mockEventSource.onerror!({} as Event);
        
        const expectedDelay = Math.min(Math.pow(2, i) * 1000, 32000);
        vi.advanceTimersByTime(expectedDelay);
        expect(mockEventSource).not.toBe(source);
      }
    });
  });
});
