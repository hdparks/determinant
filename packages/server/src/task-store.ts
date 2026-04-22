import { getDb, newId } from './db.js';
import { Task, TaskState, Node, TASK_STATES } from '@determinant/types';

export function createTask(vibe: string, pins: string[] = [], hints: string[] = [], priority: number = 3): Task {
  const db = getDb();
  const id = newId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO tasks (id, vibe, pins, hints, state, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Proposed', ?, ?, ?)
  `).run(id, vibe, JSON.stringify(pins), JSON.stringify(hints), priority, now, now);

  return {
    id,
    vibe,
    pins,
    hints,
    state: 'Proposed',
    priority,
    manualWeight: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function getTask(id: string): Task | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight, created_at as createdAt, updated_at as updatedAt
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
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight, created_at as createdAt, updated_at as updatedAt
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
    SELECT id, vibe, pins, hints, state, priority, manual_weight as manualWeight, created_at as createdAt, updated_at as updatedAt
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
    INSERT INTO nodes (id, task_id, parent_node_id, from_stage, to_stage, content, confidence_before, confidence_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  };
}

export function getNode(id: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, created_at as createdAt
    FROM nodes WHERE id = ?
  `).get(id) as any;

  if (!row) return null;

  return {
    ...row,
    createdAt: new Date(row.createdAt),
  };
}

export function getNodesByTask(taskId: string): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, created_at as createdAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at ASC
  `).all(taskId) as any[];

  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
  }));
}

export function getLatestNode(taskId: string): Node | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, created_at as createdAt
    FROM nodes WHERE task_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as any;

  if (!row) return null;

  return {
    ...row,
    createdAt: new Date(row.createdAt),
  };
}

export function getNodesByStage(taskId: string, stage: TaskState): Node[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, task_id as taskId, parent_node_id as parentNodeId, from_stage as fromStage, to_stage as toStage,
           content, confidence_before as confidenceBefore, confidence_after as confidenceAfter, created_at as createdAt
    FROM nodes WHERE task_id = ? AND to_stage = ?
    ORDER BY created_at ASC
  `).all(taskId, stage) as any[];

  return rows.map(row => ({
    ...row,
    createdAt: new Date(row.createdAt),
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

export function getTaskWithNodes(taskId: string): { task: Task; nodes: Node[] } | null {
  const task = getTask(taskId);
  if (!task) return null;

  const nodes = getNodesByTask(taskId);
  return { task, nodes };
}