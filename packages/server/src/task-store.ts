import { getDb, newId } from './db.js';
import { Task, TaskState, Node, TASK_STATES } from '@determinant/types';

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

export function createTask(vibe: string, pins: string[] = [], hints: string[] = [], priority: number = 3, workingDir: string | null = null, dependsOnTaskId: string | null = null): Task {
  const db = getDb();
  const taskId = newId();
  const now = new Date().toISOString();

  // Validate dependency
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

  return {
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

export function updateTaskState(id: string, newState: TaskState): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
  `).run(newState, now, id);

  return getTask(id);
}

export function updateTaskPriority(id: string, priority: number): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET priority = ?, updated_at = ? WHERE id = ?
  `).run(priority, now, id);

  return getTask(id);
}

export function updateTaskManualWeight(id: string, manualWeight: number): Task | null {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE tasks SET manual_weight = ?, updated_at = ? WHERE id = ?
  `).run(manualWeight, now, id);

  return getTask(id);
}

export function createNode(
  taskId: string,
  toStage: TaskState,
  content: string,
  parentNodeId: string | null = null,
  fromStage: TaskState | null = null,
  confidenceBefore: number | null = null,
  confidenceAfter: number | null = null
): Node {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, created_at, processed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(id, taskId, parentNodeId, fromStage, toStage, content, confidenceBefore, confidenceAfter, now);

  db.prepare(`
    UPDATE tasks SET state = ?, updated_at = ? WHERE id = ?
  `).run(toStage, now, taskId);

  return {
    id,
    taskId,
    parentNodeId,
    fromStage,
    toStage,
    content,
    confidenceBefore,
    confidenceAfter,
    createdAt: new Date(now),
    processedAt: null,
  };
}

export function getNode(id: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    ...row,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  };
}

export function getNodesByTask(taskId: string): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(taskId) as any[];

  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  }));
}

export function getLatestNode(taskId: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as any;

  if (!row) return null;

  return {
    ...row,
    createdAt: new Date(row.createdAt),
    processedAt: row.processedAt ? new Date(row.processedAt) : null,
  };
}

export function getNodesByStage(taskId: string, stage: TaskState): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, 
           created_at as createdAt, processed_at as processedAt
    FROM nodes WHERE task_id = ? AND to_stage = ?
    ORDER BY created_at ASC
  `).all(taskId, stage) as any[];

  return rows.map(row => ({
    ...row,
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
  return getNode(nodeId);
}

/**
 * Mark a node as processed
 */
export function markNodeProcessed(nodeId: string): Node | null {
  const db = getDb();
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE nodes
    SET processed_at = ?
    WHERE id = ?
  `).run(now, nodeId);
  
  return getNode(nodeId);
}

export function getTaskWithNodes(taskId: string): { task: Task; nodes: Node[] } | null {
  const task = getTask(taskId);
  if (!task) return null;

  const nodes = getNodesByTask(taskId);
  return { task, nodes };
}

export function updateTaskDependency(id: string, dependsOnTaskId: string | null): Task | null {
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

  return getTask(id);
}
