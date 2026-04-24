import { getDb } from './db.js';
import { Task, Node, TaskState, HeapConfig, DEFAULT_HEAP_CONFIG, QueueItem } from '@determinant/types';
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

  calculateScore(node: Node): number {
    const task = getTask(node.taskId)
    const priority = task?.priority ?? 0;
    const confScore = node.confidenceBefore ?? 5;
    const manual = task?.manualWeight ?? 0;

    const score =
      this.config.priorityWeight * (6 - priority) +
      this.config.confidenceWeight * confScore +
      this.config.manualWeight * manual;

    return score;
  }

  getQueue(limit?: number): QueueItem[] {
    const db = getDb();
    
    // Fetch all unprocessed nodes with their parent tasks
    const rows = db.prepare(`
      SELECT 
        n.id as nodeId,
        n.task_id as taskId,
        n.parent_node_id as parentNodeId,
        n.from_stage as fromStage,
        n.to_stage as toStage,
        n.content,
        n.confidence_before as confidenceBefore,
        n.confidence_after as confidenceAfter,
        n.created_at as nodeCreatedAt,
        n.processed_at as processedAt,
        t.id as taskIdFull,
        t.vibe,
        t.pins,
        t.hints,
        t.state,
        t.priority,
        t.manual_weight as manualWeight,
        t.working_dir as workingDir,
        t.created_at as taskCreatedAt,
        t.updated_at as taskUpdatedAt,
        t.depends_on_task_id as dependsOnTaskId
      FROM nodes n
      INNER JOIN tasks t ON n.task_id = t.id
      LEFT JOIN tasks parent_task ON t.depends_on_task_id = parent_task.id
      WHERE t.state != 'Released'
        AND n.processed_at IS NULL
        AND (
          t.depends_on_task_id IS NULL 
          OR parent_task.state = 'Released'
        )
      ORDER BY n.created_at DESC
      ${limit ? `LIMIT ${limit}` : ''}
    `).all() as any[];

    // Map rows to QueueItems with scores
    const items: QueueItem[] = rows.map(row => {
      const node: Node = {
        id: row.nodeId,
        taskId: row.taskId,
        parentNodeId: row.parentNodeId,
        fromStage: row.fromStage as TaskState | null,
        toStage: row.toStage as TaskState,
        content: row.content,
        confidenceBefore: row.confidenceBefore,
        confidenceAfter: row.confidenceAfter,
        createdAt: new Date(row.nodeCreatedAt),
        processedAt: row.processedAt ? new Date(row.processedAt) : null,
      };

      const task: Task = {
        id: row.taskIdFull,
        vibe: row.vibe,
        pins: JSON.parse(row.pins),
        hints: JSON.parse(row.hints),
        state: row.state as TaskState,
        priority: row.priority,
        manualWeight: row.manualWeight,
        workingDir: row.workingDir,
        dependsOnTaskId: row.dependsOnTaskId,
        createdAt: new Date(row.taskCreatedAt),
        updatedAt: new Date(row.taskUpdatedAt),
      };

      const score = this.calculateScore(node);

      return {
        node,
        task,
        score,
        confidence: node.confidenceBefore,
      };
    });

    // Sort by score descending (higher score = higher priority)
    items.sort((a, b) => b.score - a.score);

    // Apply limit if specified (only if not already applied in SQL)
    if (limit !== undefined && limit > 0 && !limit) {
      return items.slice(0, limit);
    }

    return items;
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