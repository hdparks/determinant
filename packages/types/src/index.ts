export type TaskState = 'Proposal' | 'Questions' | 'Research' | 'Plan' | 'Implement' | 'Validate' | 'Released';

export const TASK_STATES: TaskState[] = ['Proposal', 'Questions', 'Research', 'Plan', 'Implement', 'Validate', 'Released'];

export interface Task {
  id: string;
  vibe: string;
  pins: string[];
  hints: string[];
  state: TaskState;
  priority: number;
  manualWeight: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Node {
  id: string;
  taskId: string;
  parentNodeId: string | null;
  fromStage: TaskState | null;
  toStage: TaskState;
  content: string;
  confidenceBefore: number | null;
  confidenceAfter: number | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface TaskWithNodes extends Task {
  nodes: Node[];
}

export interface QueueItem {
  node: Node;
  task: Task;
  score: number;
  confidence: number | null;
}

export interface HeapConfig {
  priorityWeight: number;
  confidenceWeight: number;
  manualWeight: number;
}

export const DEFAULT_HEAP_CONFIG: HeapConfig = {
  priorityWeight: 0.5,
  confidenceWeight: 0.5,
  manualWeight: 0.0,
}

export interface CreateTaskRequest {
  vibe: string;
  pins?: string[];
  hints?: string[];
  priority?: number;
}

export interface UpdateTaskStateRequest {
  state: TaskState;
}

export interface UpdateTaskPriorityRequest {
  priority: number;
}

export interface TaskFilter {
  state?: TaskState;
}