import { getDb, newId, createTransaction } from './db.js';
import { Task, TaskState, Node, TASK_STATES } from '@determinant/types';
import { getEventBus } from './events.js';
import { getHeap } from './heap.js';

/**
 * Determines if a node at a given stage can be claimed by agent workers.
 * Human checkpoint nodes (QuestionAnswers, DesignApproval) cannot be claimed by agents.
 */
function isStageClaimable(stage: TaskState): boolean {
  return stage !== 'QuestionAnswers' && stage !== 'DesignApproval';
}

/**
 * Check if setting a dependency would create a circular reference
 * Uses iterative traversal (more efficient than recursive for shallow graphs)
 * 
 * @param childId - Task that will have the dependency
 * @param parentId - Task that will be depended upon
 * @returns true if cycle would be created
 */
export function wouldCreateCycle(childId: string, parentId: string): boolean {
  const db = getDb();
  
  // Self-dependency check
  if (childId === parentId) {
    return true;
  }
  
  // Traverse up the dependency chain from proposed parent
  // If we reach childId, it's a cycle
  let currentId: string | null = parentId;
  const visited = new Set<string>();
  const maxDepth = 100; // Prevent infinite loops from existing corrupt data
  
  while (currentId && visited.size < maxDepth) {
    // If we reached the child, cycle detected
    if (currentId === childId) {
      return true;
    }
    
    visited.add(currentId);
    
    // Get next parent in chain
    const row = db.prepare(`
      SELECT depends_on_task_id 
      FROM tasks 
      WHERE id = ?
    `).get(currentId) as { depends_on_task_id: string | null } | undefined;
    
    if (!row) {
      break; // Task not found, stop traversal
    }
    
    currentId = row.depends_on_task_id;
  }
  
  return false; // No cycle detected
}

/**
 * Get all tasks that depend on the given task
 * @param taskId - Parent task ID
 * @returns Array of tasks that have this task as their dependency
 */
export function getTaskDependents(taskId: string): Task[] {
  const db = getDb();
  
  const rows = db.prepare(`
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight,
           working_dir as workingDir, depends_on_task_id as dependsOnTaskId,
           created_at as createdAt, updated_at as updatedAt
    FROM tasks 
    WHERE depends_on_task_id = ?
    ORDER BY priority DESC, created_at ASC
  `).all(taskId) as any[];
  
  return rows.map(row => ({
    ...row,
    pins: JSON.parse(row.pins),
    hints: JSON.parse(row.hints),
    state: row.state as TaskState,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

/**
 * Get the full dependency chain from a task up to the root
 * @param taskId - Starting task ID
 * @returns Array of tasks in dependency order (child to parent)
 */
export function getDependencyChain(taskId: string): Task[] {
  const db = getDb();
  const chain: Task[] = [];
  const visited = new Set<string>();
  let currentId: string | null = taskId;
  const maxDepth = 100;
  
  while (currentId && visited.size < maxDepth) {
    if (visited.has(currentId)) {
      break; // Cycle detected (shouldn't happen with validation)
    }
    
    const task = getTask(currentId);
    if (!task) break;
    
    chain.push(task);
    visited.add(currentId);
    currentId = task.dependsOnTaskId;
  }
  
  return chain;
}

/**
 * Delete a task and all its associated nodes
 * Database CASCADE rules automatically handle:
 * - Deleting all nodes associated with the task
 * - Setting depends_on_task_id to NULL for dependent tasks
 * 
 * @param taskId - Task ID to delete
 * @returns true if task was deleted, false if not found
 */
export function deleteTask(taskId: string): boolean {
  const db = getDb();
  
  // Check if task exists first
  const task = getTask(taskId);
  if (!task) {
    return false;
  }
  
  // Delete the task (CASCADE handles nodes and dependent task cleanup)
  const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
  const result = stmt.run(taskId);
  
  // Emit deletion event
  if (result.changes > 0) {
    getEventBus().emit('task:deleted', taskId);
  }
  
  return result.changes > 0;
}

export function createTask(vibe: string, pins: string[] = [], hints: string[] = [], priority: number = 3, workingDir: string | null = null, dependsOnTaskId: string | null = null): Task {
  const db = getDb();
  const taskId = newId();
  const now = new Date().toISOString();

  // Validate dependency (before transaction)
  if (dependsOnTaskId) {
    const parent = getTask(dependsOnTaskId);
    if (!parent) {
      throw new Error(`Invalid dependsOnTaskId: task ${dependsOnTaskId} not found`);
    }
    
    // Check for circular dependency
    if (wouldCreateCycle(taskId, dependsOnTaskId)) {
      throw new Error('Circular dependency detected');
    }
  }

  // Atomic operation: Insert task + create initial Proposal node
  const createTaskAtomic = createTransaction(() => {
    // Insert task
    db.prepare(`
      INSERT INTO tasks (id, vibe, pins, hints, state, priority, working_dir, depends_on_task_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'Proposal', ?, ?, ?, ?, ?)
    `).run(taskId, vibe, JSON.stringify(pins), JSON.stringify(hints), priority, workingDir, dependsOnTaskId, now, now);

    // Auto-create initial Proposal node
    const proposalNodeId = newId();
    const proposalContent = `# Vibe\n\n${vibe}\n\n` +
      (pins.length > 0 ? `## Pins\n\n${pins.map(p => `- ${p}`).join('\n')}\n\n` : '') +
      (hints.length > 0 ? `## Hints\n\n${hints.map(h => `- ${h}`).join('\n')}\n\n` : '');

    db.prepare(`
      INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, created_at, processed_at)
      VALUES (?, ?, NULL, NULL, 'Proposal', ?, NULL, NULL, ?, NULL)
    `).run(proposalNodeId, taskId, proposalContent.trim(), now);
  });

  // Execute transaction
  createTaskAtomic();

  const task: Task = {
    id: taskId,
    vibe,
    pins,
    hints,
    state: 'Proposal',
    priority,
    manualWeight: 0,
    workingDir,
    dependsOnTaskId,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  
  // Emit event after successful creation
  const taskWithScore = {
    ...task,
    score: calculateTaskScore(task)
  };
  getEventBus().emit('task:created', taskWithScore);
  
  return task;
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight, 
           working_dir as workingDir, depends_on_task_id as dependsOnTaskId,
           created_at as createdAt, updated_at as updatedAt
    FROM tasks WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    ...row,
    pins: JSON.parse(row.pins),
    hints: JSON.parse(row.hints),
    state: row.state as TaskState,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export function getTasksByState(state: TaskState): Task[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight,
           working_dir as workingDir, depends_on_task_id as dependsOnTaskId,
           created_at as createdAt, updated_at as updatedAt
    FROM tasks WHERE state = ?
    ORDER BY created_at DESC
  `).all(state) as any[];

  return rows.map(row => ({
    ...row,
    pins: JSON.parse(row.pins),
    hints: JSON.parse(row.hints),
    state: row.state as TaskState,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

export function getAllTasks(): Task[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight,
           working_dir as workingDir, depends_on_task_id as dependsOnTaskId,
           created_at as createdAt, updated_at as updatedAt
    FROM tasks ORDER BY created_at DESC
  `).all() as any[];

  return rows.map(row => ({
    ...row,
    pins: JSON.parse(row.pins),
    hints: JSON.parse(row.hints),
    state: row.state as TaskState,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }));
}

/**
 * Calculate the priority score for a task using its latest unprocessed node.
 * Returns null for Released tasks or if calculation is not applicable.
 * 
 * @param task - The task to calculate score for
 * @returns The calculated score or null
 */
export function calculateTaskScore(task: Task): number | null {
  // Released tasks don't need scores
  if (task.state === 'Released') {
    return null;
  }
  
  const db = getDb();
  
  // Get the latest unprocessed node for this task
  const node = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, 
           from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, 
           confidence_after as confidenceAfter,
           claimable, created_at as createdAt, processed_at as processedAt
    FROM nodes 
    WHERE task_id = ? AND processed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).get(task.id) as any;
  
  if (node) {
    // Convert to Node object
    const nodeObj: Node = {
      ...node,
      claimable: node.claimable === 1,
      createdAt: new Date(node.createdAt),
      processedAt: node.processedAt ? new Date(node.processedAt) : null,
    };
    
    // Use heap's calculation method
    return getHeap().calculateScore(nodeObj);
  }
  
  // Fallback: calculate score without confidence (no unprocessed nodes)
  // This happens when all nodes are processed but task isn't Released
  const config = getHeap().getConfig();
  return (
    config.priorityWeight * (6 - task.priority) +
    config.manualWeight * task.manualWeight
  );
}

/**
 * Get all tasks with calculated priority scores
 */
export function getAllTasksWithScores(): Array<Task & { score: number | null }> {
  const tasks = getAllTasks();
  return tasks.map(task => ({
    ...task,
    score: calculateTaskScore(task)
  }));
}

/**
 * Get tasks by state with calculated priority scores
 */
export function getTasksByStateWithScores(state: TaskState): Array<Task & { score: number | null }> {
  const tasks = getTasksByState(state);
  return tasks.map(task => ({
    ...task,
    score: calculateTaskScore(task)
  }));
}

export function updateTaskState(id: string, newState: TaskState): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
  `).run(newState, now, id);

  const task = getTask(id);
  
  // Emit event after successful update
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('task:updated', taskWithScore);
  }
  
  return task;
}

export async function updateTaskPriority(id: string, priority: number): Promise<Task | null> {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?
  `).run(priority, now, id);

  const task = getTask(id);
  
  // Emit events after successful update
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('task:updated', taskWithScore);
    
    // Priority change affects queue order
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }
  
  return task;
}

export function updateTaskVibe(id: string, vibe: string): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET vibe = ?, updated_at = ? WHERE id = ?
  `).run(vibe, now, id);

  const task = getTask(id);
  
  // Emit event after successful update
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('task:updated', taskWithScore);
  }
  
  return task;
}

export async function updateTaskManualWeight(id: string, manualWeight: number): Promise<Task | null> {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET manual_weight = ?, updated_at = ? WHERE id = ?
  `).run(manualWeight, now, id);

  const task = getTask(id);
  
  // Emit events after successful update
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('task:updated', taskWithScore);
    
    // Manual weight change affects queue order
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }

  return task;
}

export async function createNode(
  taskId: string,
  toStage: TaskState,
  content: string,
  parentNodeId: string | null = null,
  fromStage: TaskState | null = null,
  confidenceBefore: number | null = null,
  confidenceAfter: number | null = null
): Promise<Node> {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();
  const claimable = isStageClaimable(toStage);

  // Atomic transaction: Create node and update task state
  const createNodeAtomic = createTransaction(() => {
    db.prepare(`
      INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, claimable, created_at, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(id, taskId, parentNodeId, fromStage, toStage, content, confidenceBefore, confidenceAfter, claimable ? 1 : 0, now);

    db.prepare(`
      UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
    `).run(toStage, now, taskId);
  });

  // Execute transaction
  createNodeAtomic();

  const node: Node = {
    id,
    taskId,
    parentNodeId,
    fromStage,
    toStage,
    content,
    confidenceBefore,
    confidenceAfter,
    claimable,
    createdAt: new Date(now),
    processedAt: null,
  };
  
  const task = getTask(taskId);
  
  // Emit both node and task events
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('node:created', { task: taskWithScore, node });
    getEventBus().emit('task:updated', taskWithScore); // State changed
    
    // New node may enter queue
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }
  
  return node;
}

export function getNode(id: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           claimable, created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    ...row,
    claimable: row.claimable === 1,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  };
}

export function getNodesByTask(taskId: string): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           claimable, created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(taskId) as any[];

  return rows.map(row => ({
    ...row,
    claimable: row.claimable === 1,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  }));
}

export function getLatestNode(taskId: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           claimable, created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as any;

  if (!row) return null;

  return {
    ...row,
    claimable: row.claimable === 1,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  };
}

export function getNodesByStage(taskId: string, stage: TaskState): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           claimable, created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ? AND to_stage = ?
    ORDER BY created_at ASC
  `).all(taskId, stage) as any[];

  return rows.map(row => ({
    ...row,
    claimable: row.claimable === 1,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  }));
}

/**
 * Update an existing node
 */
export function updateNode(nodeId: string, updates: Partial<Node>): Node | null {
  const node = getNode(nodeId);
  if (!node) {
    return null;
  }
  
  const db = getDb();
  const allowedFields = ['content', 'confidenceBefore', 'confidenceAfter'];
  const updateFields: string[] = [];
  const values: any[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      // Convert camelCase to snake_case for SQL
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      updateFields.push(`${snakeKey} = ?`);
      values.push(value);
    }
  }
  
  if (updateFields.length === 0) {
    return node; // No valid updates
  }
  
  values.push(nodeId);
  
  db.prepare(`
    UPDATE nodes
    SET ${updateFields.join(', ')}
    WHERE id = ?
  `).run(...values);
  
  // Return updated node
  const updatedNode = getNode(nodeId);
  
  // Emit event after successful update
  if (updatedNode) {
    getEventBus().emit('node:updated', updatedNode);
    // Don't emit task:updated (task itself didn't change)
  }
  
  return updatedNode;
}

/**
 * Mark a node as processed
 */
export async function markNodeProcessed(nodeId: string): Promise<Node | null> {
  const db = getDb();
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE nodes
    SET processed_at = ?
    WHERE id = ?
  `).run(now, nodeId);
  
  const node = getNode(nodeId);
  
  // Emit events after successful update
  if (node) {
    getEventBus().emit('node:processed', node);
    
    // Processed node removed from queue
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }
  
  return node;
}

/**
 * Atomically complete node processing by creating a child node and marking the parent as processed.
 * This ensures both operations succeed together or fail together, preventing orphaned nodes.
 * 
 * @param parentNodeId - The ID of the node being processed
 * @param childNodeData - Data for the child node to create
 * @returns Both the created child node and the processed parent node
 */
export async function completeNodeProcessing(
  parentNodeId: string,
  childNodeData: {
    toStage: TaskState;
    content: string;
    confidenceBefore?: number | null;
    confidenceAfter?: number | null;
  }
): Promise<{ childNode: Node; parentNode: Node }> {
  const db = getDb();
  
  // Get parent node to extract task info
  const parentNode = getNode(parentNodeId);
  if (!parentNode) {
    throw new Error(`Parent node ${parentNodeId} not found`);
  }

  const childId = newId();
  const now = new Date().toISOString();
  const claimable = isStageClaimable(childNodeData.toStage);

  // Atomic operation: Create child node + mark parent as processed + update task state
  const completeProcessingAtomic = createTransaction(() => {
    // 1. Insert child node
    db.prepare(`
      INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, claimable, created_at, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      childId,
      parentNode.taskId,
      parentNodeId,
      parentNode.toStage,  // Child's fromStage is parent's toStage
      childNodeData.toStage,
      childNodeData.content,
      childNodeData.confidenceBefore ?? null,
      childNodeData.confidenceAfter ?? null,
      claimable ? 1 : 0,
      now
    );

    // 2. Update task state to child's stage
    db.prepare(`
      UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
    `).run(childNodeData.toStage, now, parentNode.taskId);

    // 3. Mark parent node as processed
    db.prepare(`
      UPDATE nodes SET processed_at = ? WHERE id = ?
    `).run(now, parentNodeId);
  });

  // Execute transaction - all operations commit together
  completeProcessingAtomic();

  // Construct result objects
  const childNode: Node = {
    id: childId,
    taskId: parentNode.taskId,
    parentNodeId,
    fromStage: parentNode.toStage,
    toStage: childNodeData.toStage,
    content: childNodeData.content,
    confidenceBefore: childNodeData.confidenceBefore ?? null,
    confidenceAfter: childNodeData.confidenceAfter ?? null,
    claimable,
    createdAt: new Date(now),
    processedAt: null,
  };

  const updatedParentNode: Node = {
    ...parentNode,
    processedAt: new Date(now),
  };

  // Emit events after successful completion
  const task = getTask(parentNode.taskId);
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('node:created', { task: taskWithScore, node: childNode });
    getEventBus().emit('node:processed', updatedParentNode);
    getEventBus().emit('task:updated', taskWithScore);
    
    // Queue updated - parent removed, child added
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }

  return { childNode, parentNode: updatedParentNode };
}

/**
 * Process human approval for a node (QuestionAnswers or DesignApproval).
 * This formats the approval content, creates a child node, and marks parent as processed.
 */
export async function processHumanApproval(
  nodeId: string,
  approvalContent: string,
  childToStage: TaskState
): Promise<{ childNode: Node; parentNode: Node }> {
  const db = getDb();
  
  // Get parent node
  const parentNode = getNode(nodeId);
  if (!parentNode) {
    throw new Error(`Node ${nodeId} not found`);
  }

  // Verify it's a human checkpoint node
  if (parentNode.claimable) {
    throw new Error('This node does not require human approval');
  }

  const childId = newId();
  const now = new Date().toISOString();
  const claimable = isStageClaimable(childToStage);

  // Atomic operation: Update parent content + Create child node + mark parent as processed + update task state
  const processApprovalAtomic = createTransaction(() => {
    // 1. Update parent node content with approval
    db.prepare(`
      UPDATE nodes SET content = ? WHERE id = ?
    `).run(approvalContent, nodeId);

    // 2. Insert child node
    db.prepare(`
      INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, claimable, created_at, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      childId,
      parentNode.taskId,
      nodeId,
      parentNode.toStage,  // Child's fromStage is parent's toStage
      childToStage,
      '',  // Child node starts with empty content (will be filled by agent processing)
      10,  // Human input = high confidence before
      10,  // Human input = high confidence after
      claimable ? 1 : 0,
      now
    );

    // 3. Update task state to child's stage
    db.prepare(`
      UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
    `).run(childToStage, now, parentNode.taskId);

    // 4. Mark parent node as processed
    db.prepare(`
      UPDATE nodes SET processed_at = ? WHERE id = ?
    `).run(now, nodeId);
  });

  // Execute transaction - all operations commit together
  processApprovalAtomic();

  // Construct result objects
  const childNode: Node = {
    id: childId,
    taskId: parentNode.taskId,
    parentNodeId: nodeId,
    fromStage: parentNode.toStage,
    toStage: childToStage,
    content: '',
    confidenceBefore: 10,
    confidenceAfter: 10,
    claimable,
    createdAt: new Date(now),
    processedAt: null,
  };

  const updatedParentNode: Node = {
    ...parentNode,
    content: approvalContent,
    processedAt: new Date(now),
  };

  // Emit events after successful completion
  const task = getTask(parentNode.taskId);
  if (task) {
    const taskWithScore = {
      ...task,
      score: calculateTaskScore(task)
    };
    getEventBus().emit('node:created', { task: taskWithScore, node: childNode });
    getEventBus().emit('node:processed', updatedParentNode);
    getEventBus().emit('task:updated', taskWithScore);
    
    // Queue updated - parent removed, child added
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }

  return { childNode, parentNode: updatedParentNode };
}

export function getTaskWithNodes(taskId: string): { task: Task; nodes: Node[] } | null {
  const task = getTask(taskId);
  if (!task) return null;

  const nodes = getNodesByTask(taskId);
  return { task, nodes };
}

export async function updateTaskDependency(id: string, dependsOnTaskId: string | null): Promise<Task | null> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Validate task exists
  const task = getTask(id);
  if (!task) {
    return null;
  }
  
  // Validate parent exists (if setting dependency)
  if (dependsOnTaskId !== null) {
    const parent = getTask(dependsOnTaskId);
    if (!parent) {
      throw new Error(`Invalid dependsOnTaskId: task ${dependsOnTaskId} not found`);
    }
    
    // Prevent self-dependency
    if (dependsOnTaskId === id) {
      throw new Error('Task cannot depend on itself');
    }
    
    // Check for circular dependency
    if (wouldCreateCycle(id, dependsOnTaskId)) {
      throw new Error('Circular dependency detected');
    }
  }

  db.prepare(`
    UPDATE tasks SET depends_on_task_id = ?, updated_at = ? WHERE id = ?
  `).run(dependsOnTaskId, now, id);

  const updatedTask = getTask(id);
  
  // Emit events after successful update
  if (updatedTask) {
    getEventBus().emit('task:updated', updatedTask);
    
    // Dependency change may affect queue eligibility
    const { getHeap } = await import('./heap.js');
    getEventBus().emit('queue:updated', getHeap().getQueue());
  }
  
  return updatedTask;
}

/**
 * Detect orphaned nodes: nodes that have children but are still marked as unprocessed.
 * This can happen if the worker crashes between creating a child and marking the parent as processed.
 * 
 * @returns Array of orphaned node IDs with their task info
 */
export function detectOrphanedNodes(): Array<{ nodeId: string; taskId: string; toStage: TaskState }> {
  const db = getDb();
  
  const rows = db.prepare(`
    SELECT DISTINCT parent.id as nodeId, parent.task_id as taskId, parent.to_stage as toStage
    FROM nodes parent
    INNER JOIN nodes child ON child.parent_node_id = parent.id
    WHERE parent.processed_at IS NULL
    ORDER BY parent.created_at DESC
  `).all() as any[];
  
  return rows.map(row => ({
    nodeId: row.nodeId,
    taskId: row.taskId,
    toStage: row.toStage as TaskState,
  }));
}

/**
 * Detect duplicate children: multiple nodes with the same parent and same target stage.
 * This indicates the same work was processed multiple times due to atomicity failures.
 * 
 * @returns Array of duplicate groups
 */
export function detectDuplicateChildren(): Array<{
  parentNodeId: string;
  taskId: string;
  toStage: TaskState;
  count: number;
  nodeIds: string[];
}> {
  const db = getDb();
  
  const rows = db.prepare(`
    SELECT 
      parent_node_id as parentNodeId,
      task_id as taskId,
      to_stage as toStage,
      COUNT(*) as count,
      GROUP_CONCAT(id) as nodeIds
    FROM nodes
    WHERE parent_node_id IS NOT NULL
    GROUP BY parent_node_id, to_stage
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `).all() as any[];
  
  return rows.map(row => ({
    parentNodeId: row.parentNodeId,
    taskId: row.taskId,
    toStage: row.toStage as TaskState,
    count: row.count,
    nodeIds: row.nodeIds.split(','),
  }));
}

/**
 * Fix orphaned nodes by marking them as processed.
 * This should only be run after verifying the children exist and are valid.
 * 
 * @param nodeIds - Array of node IDs to mark as processed
 * @returns Number of nodes fixed
 */
export function fixOrphanedNodes(nodeIds: string[]): number {
  const db = getDb();
  const now = new Date().toISOString();
  
  let fixed = 0;
  for (const nodeId of nodeIds) {
    const result = db.prepare(`
      UPDATE nodes SET processed_at = ? WHERE id = ? AND processed_at IS NULL
    `).run(now, nodeId);
    
    if (result.changes > 0) {
      fixed++;
    }
  }
  
  return fixed;
}
