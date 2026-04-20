import { getDb } from './db.js';
import { Task, TaskState, HeapConfig, DEFAULT_HEAP_CONFIG, QueueItem, HeapPeekItem } from '@determinant/types';
import { getLatestNode, getTask } from './task-store.js';

export class PriorityHeap {
  private config: HeapConfig;

  constructor(config: Partial<HeapConfig> = {}) {
    this.config = { ...DEFAULT_HEAP_CONFIG, ...config };
  }

  setConfig(config: Partial<HeapConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): HeapConfig {
    return { ...this.config };
  }

  calculateScore(task: Task, confidence: number | null): number {
    const priority = task.priority;
    const confScore = confidence ?? 5;
    const manual = task.manualWeight;

    const score =
      this.config.priorityWeight * (6 - priority) +
      this.config.confidenceWeight * confScore +
      this.config.manualWeight * manual;

    return score;
  }

  getQueueForState(state: TaskState, limit: number = 10): QueueItem[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, title, description, state, priority, manual_weight as manualWeight, created_at as createdAt, updated_at as updatedAt
      FROM tasks WHERE state = ?
      ORDER BY created_at DESC
    `).all(state) as any[];

    const queue: QueueItem[] = rows
      .map(row => {
        const task: Task = {
          ...row,
          state: row.state as TaskState,
          priority: row.priority,
          manualWeight: row.manualWeight,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        };

        const node = getLatestNode(task.id);
        const confidence = node?.confidenceAfter ?? 5;

        return {
          taskId: task.id,
          score: this.calculateScore(task, confidence),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return queue;
  }

  getNextTask(state: TaskState): string | null {
    const queue = this.getQueueForState(state, 1);
    return queue.length > 0 ? queue[0].taskId : null;
  }

  peek(state: TaskState, limit: number = 10): HeapPeekItem[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, title, description, state, priority, manual_weight as manualWeight, created_at as createdAt, updated_at as updatedAt
      FROM tasks WHERE state = ?
      ORDER BY created_at DESC
    `).all(state) as any[];

    return rows
      .map(row => {
        const task: Task = {
          ...row,
          state: row.state as TaskState,
          priority: row.priority,
          manualWeight: row.manualWeight,
          createdAt: new Date(row.createdAt),
          updatedAt: new Date(row.updatedAt),
        };

        const node = getLatestNode(task.id);
        const confidence = node?.confidenceAfter ?? null;

        return {
          task,
          score: this.calculateScore(task, confidence),
          confidence,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

let heapInstance: PriorityHeap | null = null;

export function getHeap(config?: Partial<HeapConfig>): PriorityHeap {
  if (!heapInstance) {
    heapInstance = new PriorityHeap(config);
  } else if (config) {
    heapInstance.setConfig(config);
  }
  return heapInstance;
}

export function initHeap(config?: Partial<HeapConfig>): PriorityHeap {
  heapInstance = new PriorityHeap(config);
  return heapInstance;
}