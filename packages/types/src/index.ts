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
  workingDir: string | null;
  dependsOnTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  score?: number | null;
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
  manualWeight: 1.0,
}

export interface CreateTaskRequest {
  vibe: string;
  pins?: string[];
  hints?: string[];
  priority?: number;
  workingDir?: string;
  dependsOnTaskId?: string;
}

export interface UpdateTaskStateRequest {
  state: TaskState;
}

export interface UpdateTaskPriorityRequest {
  priority: number;
}

export interface UpdateTaskManualWeightRequest {
  manualWeight: number;
}

export interface UpdateTaskDependencyRequest {
  dependsOnTaskId: string | null;
}

export interface UpdateTaskVibeRequest {
  vibe: string;
}

export interface TaskFilter {
  state?: TaskState;
}

export interface TaskDependencyInfo {
  parent: Task | null;        // Task this depends on (blocking)
  dependents: Task[];          // Tasks that depend on this (blocked)
  chainLength: number;         // Depth in dependency tree
  isBlocked: boolean;          // True if parent exists and not Released
  isBlocking: boolean;         // True if dependents exist
}

export interface GetDependentsResponse {
  dependents: Task[];
}

export interface GetDependencyChainResponse {
  chain: Task[];
}

// SSE Event Type Definitions
export type SSEEventType = 
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'node:created'
  | 'node:updated'
  | 'node:processed'
  | 'queue:updated';

export interface TaskCreatedEvent {
  type: 'task:created';
  data: Task;
}

export interface TaskUpdatedEvent {
  type: 'task:updated';
  data: Task;
}

export interface TaskDeletedEvent {
  type: 'task:deleted';
  data: string; // task ID
}

export interface NodeCreatedEvent {
  type: 'node:created';
  data: {
    task: Task;
    node: Node;
  };
}

export interface NodeUpdatedEvent {
  type: 'node:updated';
  data: Node;
}

export interface NodeProcessedEvent {
  type: 'node:processed';
  data: Node;
}

export interface QueueUpdatedEvent {
  type: 'queue:updated';
  data: QueueItem[];
}

export type SSEEvent =
  | TaskCreatedEvent
  | TaskUpdatedEvent
  | TaskDeletedEvent
  | NodeCreatedEvent
  | NodeUpdatedEvent
  | NodeProcessedEvent
  | QueueUpdatedEvent;