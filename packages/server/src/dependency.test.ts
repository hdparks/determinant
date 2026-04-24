import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { initDb, closeDb, getDb } from './db.js';
import { createTask, getTask, updateTaskState, updateTaskDependency, wouldCreateCycle } from './task-store.js';
import { initHeap } from './heap.js';

describe('Task dependency system', () => {
  beforeEach(() => {
    initDb(':memory:');
  });
  
  afterEach(() => {
    closeDb();
  });

  describe('Database schema', () => {
    test('depends_on_task_id column exists', () => {
      const db = getDb();
      const result = db.prepare(`
        SELECT COUNT(*) as count 
        FROM pragma_table_info('tasks') 
        WHERE name = 'depends_on_task_id'
      `).get() as { count: number };
      
      expect(result.count).toBe(1);
    });

    test('index on depends_on_task_id exists', () => {
      const db = getDb();
      const result = db.prepare(`
        SELECT COUNT(*) as count 
        FROM pragma_index_list('tasks') 
        WHERE name = 'idx_tasks_depends_on'
      `).get() as { count: number };
      
      expect(result.count).toBe(1);
    });

    test('foreign keys are enabled', () => {
      const db = getDb();
      const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);
    });
  });

  describe('Task creation with dependencies', () => {
    test('create task without dependency', () => {
      const task = createTask('Test task');
      expect(task.dependsOnTaskId).toBe(null);
    });

    test('create task with valid dependency', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      expect(child.dependsOnTaskId).toBe(parent.id);
    });

    test('error when creating task with invalid dependency', () => {
      expect(() => {
        createTask('Child task', [], [], 3, null, 'invalid-id');
      }).toThrow('Invalid dependsOnTaskId: task invalid-id not found');
    });
  });

  describe('Circular dependency detection', () => {
    test('detects self-dependency', () => {
      const task = createTask('Task');
      expect(wouldCreateCycle(task.id, task.id)).toBe(true);
    });

    test('detects simple cycle (A -> B -> A)', () => {
      const taskA = createTask('Task A');
      const taskB = createTask('Task B', [], [], 3, null, taskA.id);
      
      // Try to make A depend on B (would create cycle)
      expect(wouldCreateCycle(taskA.id, taskB.id)).toBe(true);
    });

    test('detects complex cycle (A -> B -> C -> A)', () => {
      const taskA = createTask('Task A');
      const taskB = createTask('Task B', [], [], 3, null, taskA.id);
      const taskC = createTask('Task C', [], [], 3, null, taskB.id);
      
      // Try to make A depend on C (would create cycle)
      expect(wouldCreateCycle(taskA.id, taskC.id)).toBe(true);
    });

    test('allows valid dependency chain', () => {
      const taskA = createTask('Task A');
      const taskB = createTask('Task B', [], [], 3, null, taskA.id);
      const taskC = createTask('Task C', [], [], 3, null, taskB.id);
      
      // Make D depend on C (no cycle)
      expect(wouldCreateCycle('new-task-id', taskC.id)).toBe(false);
    });
  });

  describe('Update task dependency', () => {
    test('update dependency on existing task', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task');
      
      const updated = updateTaskDependency(child.id, parent.id);
      expect(updated?.dependsOnTaskId).toBe(parent.id);
    });

    test('clear dependency by setting to null', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      const updated = updateTaskDependency(child.id, null);
      expect(updated?.dependsOnTaskId).toBe(null);
    });

    test('error when updating with invalid dependency', () => {
      const task = createTask('Task');
      
      expect(() => {
        updateTaskDependency(task.id, 'invalid-id');
      }).toThrow('Invalid dependsOnTaskId: task invalid-id not found');
    });

    test('error when creating circular dependency via update', () => {
      const taskA = createTask('Task A');
      const taskB = createTask('Task B', [], [], 3, null, taskA.id);
      
      expect(() => {
        updateTaskDependency(taskA.id, taskB.id);
      }).toThrow('Circular dependency detected');
    });
  });

  describe('Priority heap with dependencies', () => {
    test('nodes from tasks without dependencies appear in queue', () => {
      const task = createTask('Independent task');
      const heap = initHeap();
      
      const queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(task.id);
    });

    test('nodes from dependent tasks excluded when parent not Released', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      const heap = initHeap();
      
      const queue = heap.getQueue();
      // Only parent's node should be in queue
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(parent.id);
    });

    test('nodes from dependent tasks included once parent Released', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      // Release parent
      updateTaskState(parent.id, 'Released');
      
      const heap = initHeap();
      const queue = heap.getQueue();
      
      // Only child's node should be in queue now
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(child.id);
    });

    test('multiple independent tasks unaffected by dependency filtering', () => {
      const task1 = createTask('Task 1');
      const task2 = createTask('Task 2');
      const task3 = createTask('Task 3');
      const heap = initHeap();
      
      const queue = heap.getQueue();
      expect(queue.length).toBe(3);
    });

    test('dependency chain works correctly', () => {
      const taskA = createTask('Task A');
      const taskB = createTask('Task B', [], [], 3, null, taskA.id);
      const taskC = createTask('Task C', [], [], 3, null, taskB.id);
      
      const heap = initHeap();
      
      // Initially, only A in queue
      let queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(taskA.id);
      
      // Release A, now B appears
      updateTaskState(taskA.id, 'Released');
      queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(taskB.id);
      
      // Release B, now C appears
      updateTaskState(taskB.id, 'Released');
      queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(taskC.id);
    });

    test('re-opening released parent re-blocks children', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      // Release parent
      updateTaskState(parent.id, 'Released');
      
      const heap = initHeap();
      let queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(child.id);
      
      // Re-open parent
      updateTaskState(parent.id, 'Plan');
      queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(parent.id);
    });

    test('removing dependency unblocks immediately', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      const heap = initHeap();
      let queue = heap.getQueue();
      expect(queue.length).toBe(1);
      expect(queue[0].task.id).toBe(parent.id);
      
      // Remove dependency
      updateTaskDependency(child.id, null);
      queue = heap.getQueue();
      expect(queue.length).toBe(2);
    });
  });

  describe('Parent task deletion', () => {
    test('deleting parent task clears dependency', () => {
      const parent = createTask('Parent task');
      const child = createTask('Child task', [], [], 3, null, parent.id);
      
      // Delete parent
      const db = getDb();
      db.prepare('DELETE FROM tasks WHERE id = ?').run(parent.id);
      
      // Check child's dependency was cleared
      const updatedChild = getTask(child.id);
      expect(updatedChild?.dependsOnTaskId).toBe(null);
    });
  });
});
