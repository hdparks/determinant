export type TaskState = 'Proposed' | 'Planned' | 'Executed' | 'Verified' | 'Released';

export const TASK_STATES: TaskState[] = ['Proposed', 'Planned', 'Executed', 'Verified', 'Released'];

export interface Task {
  id: string;
  title: string;
  description: string;
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
}

export interface TaskWithNodes extends Task {
  nodes: Node[];
}

export interface QueueItem {
  taskId: string;
  score: number;
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
};

export interface AgentClaim {
  id: string;
  nodeId: string;
  claimedAt: Date;
  expiresAt: Date;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority?: number;
}

export interface UpdateTaskStateRequest {
  state: TaskState;
}

export interface UpdateTaskPriorityRequest {
  priority: number;
}

export interface ClaimTaskRequest {
  taskId: string;
  ttlMinutes?: number;
}

export interface TaskFilter {
  state?: TaskState;
}

export interface HeapPeekItem {
  task: Task;
  score: number;
  confidence: number | null;
}