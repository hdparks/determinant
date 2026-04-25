import { EventEmitter } from 'events';
import { Task, Node, QueueItem } from '@determinant/types';
import { Response } from 'express';

// Define event payload types (internal mapping)
export interface EventMap {
  'task:created': Task;
  'task:updated': Task;
  'task:deleted': string; // Just the ID
  'node:created': { task: Task; node: Node };
  'node:updated': Node;
  'node:processed': Node;
  'queue:updated': QueueItem[];
}

// Type-safe event names
export type EventType = keyof EventMap;

// Connection limit (configurable via env var)
export const MAX_SSE_CONNECTIONS = parseInt(
  process.env.MAX_SSE_CONNECTIONS ?? '1000',
  10
);

/**
 * Typed EventEmitter wrapper for SSE infrastructure
 * Manages both event emission and client connection tracking
 */
class TypedEventEmitter {
  private emitter = new EventEmitter();
  private clients = new Map<string, Response>();

  constructor() {
    // Catch unhandled emitter errors to prevent crashes
    this.emitter.on('error', (error) => {
      console.error('[SSE] EventEmitter error:', error);
    });
  }

  // Type-safe emit
  emit<K extends EventType>(event: K, payload: EventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  // Type-safe on
  on<K extends EventType>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.on(event, handler);
  }

  // Type-safe once
  once<K extends EventType>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.once(event, handler);
  }

  // Type-safe off
  off<K extends EventType>(event: K, handler: (payload: EventMap[K]) => void): void {
    this.emitter.off(event, handler);
  }

  // Client management
  hasCapacity(): boolean {
    return this.clients.size < MAX_SSE_CONNECTIONS;
  }

  addClient(clientId: string, res: Response): boolean {
    if (this.clients.size >= MAX_SSE_CONNECTIONS) {
      console.error(`[SSE] Connection limit reached: ${MAX_SSE_CONNECTIONS}`);
      return false; // Reject connection
    }
    this.clients.set(clientId, res);
    return true;
  }

  removeClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  getClients(): Map<string, Response> {
    return this.clients;
  }

  /**
   * Broadcast an event to all connected SSE clients
   * Handles serialization errors and dead connections gracefully
   */
  broadcastEvent<K extends EventType>(eventType: K, payload: EventMap[K]): void {
    let eventData: string;
    
    // Serialize payload
    try {
      eventData = JSON.stringify(payload, this.jsonReplacer);
    } catch (error) {
      console.error(`[SSE] Error serializing event ${eventType}:`, error);
      return; // Don't broadcast invalid data
    }
    
    const message = `event: ${eventType}\ndata: ${eventData}\n\n`;
    
    // Send to all connected clients
    const deadClients: string[] = [];
    
    this.clients.forEach((res, clientId) => {
      try {
        res.write(message);
      } catch (error) {
        console.error(`[SSE] Error sending event to client ${clientId}:`, error);
        deadClients.push(clientId); // Mark for removal
      }
    });
    
    // Clean up dead connections
    deadClients.forEach(clientId => this.clients.delete(clientId));
  }

  /**
   * JSON replacer to handle Date serialization
   */
  private jsonReplacer(_key: string, value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }
}

// Singleton instance (following heap.ts pattern)
let eventBusInstance: TypedEventEmitter | null = null;

export function getEventBus(): TypedEventEmitter {
  if (!eventBusInstance) {
    eventBusInstance = new TypedEventEmitter();
  }
  return eventBusInstance;
}

// For testing: allow reset
export function resetEventBus(): void {
  if (eventBusInstance) {
    // Clear all listeners
    const clients = eventBusInstance.getClients();
    clients.forEach((res, clientId) => {
      try {
        res.end();
      } catch (e) {
        // Client already disconnected
      }
    });
  }
  eventBusInstance = null;
}
