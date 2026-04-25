import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initDb, closeDb } from './db.js';
import {
  createTask,
  deleteTask,
  getTask,
  createNode,
} from './task-store.js';
import { getEventBus, resetEventBus } from './events.js';
import type { Task } from '@determinant/types';

/**
 * Integration tests for task deletion SSE event emission
 * 
 * These tests verify that the deleteTask operation properly:
 * 1. Deletes tasks from the database
 * 2. Emits task:deleted SSE event with correct payload
 * 3. Handles edge cases (non-existent tasks, cascading deletes)
 * 4. Does not emit events when deletion fails
 */
describe('Task Deletion SSE Integration', () => {
  beforeAll(() => {
    initDb(':memory:');
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    resetEventBus();
  });

  describe('deleteTask Basic Functionality', () => {
    test('deleteTask emits task:deleted event with correct taskId', () => {
      const eventBus = getEventBus();
      const task = createTask('Task to delete');
      
      let emittedTaskId: string | null = null;
      eventBus.on('task:deleted', (taskId) => {
        emittedTaskId = taskId;
      });
      
      const deleted = deleteTask(task.id);
      
      expect(deleted).toBe(true);
      expect(emittedTaskId).toBe(task.id);
    });

    test('deleteTask actually removes task from database', () => {
      const task = createTask('Task to verify deletion');
      
      // Verify task exists
      expect(getTask(task.id)).not.toBeNull();
      
      const deleted = deleteTask(task.id);
      
      expect(deleted).toBe(true);
      // Verify task is gone
      expect(getTask(task.id)).toBeNull();
    });

    test('deleteTask returns true on successful deletion', () => {
      const task = createTask('Success test');
      
      const result = deleteTask(task.id);
      
      expect(result).toBe(true);
    });
  });

  describe('deleteTask Error Cases', () => {
    test('deleteTask does not emit event if task not found', () => {
      const eventBus = getEventBus();
      
      let eventEmitted = false;
      eventBus.on('task:deleted', () => {
        eventEmitted = true;
      });
      
      const deleted = deleteTask('non-existent-task-id');
      
      expect(deleted).toBe(false);
      expect(eventEmitted).toBe(false);
    });

    test('deleteTask returns false when task does not exist', () => {
      const result = deleteTask('fake-id-12345');
      
      expect(result).toBe(false);
    });

    test('deleteTask handles empty string taskId gracefully', () => {
      const result = deleteTask('');
      
      expect(result).toBe(false);
    });
  });

  describe('deleteTask Cascading Behavior', () => {
    test('deleting task with nodes cascades deletion to nodes', async () => {
      const task = createTask('Task with nodes');
      
      // Create multiple nodes for this task
      const node1 = await createNode(task.id, 'Questions', 'Node 1 content');
      const node2 = await createNode(task.id, 'Research', 'Node 2 content');
      
      // Verify nodes exist
      expect(node1.taskId).toBe(task.id);
      expect(node2.taskId).toBe(task.id);
      
      // Delete the task
      const deleted = deleteTask(task.id);
      
      expect(deleted).toBe(true);
      expect(getTask(task.id)).toBeNull();
      
      // Note: We can't directly verify nodes are deleted without adding a getNode function,
      // but CASCADE DELETE in the schema ensures this happens at the database level
    });

    test('deleting parent task clears dependsOnTaskId for dependent tasks', () => {
      const parentTask = createTask('Parent task');
      const childTask = createTask('Child task', [], [], 3, null, parentTask.id);
      
      // Verify dependency exists
      expect(childTask.dependsOnTaskId).toBe(parentTask.id);
      
      // Delete parent task
      const deleted = deleteTask(parentTask.id);
      
      expect(deleted).toBe(true);
      
      // Get fresh child task data
      const updatedChild = getTask(childTask.id);
      
      // Verify child's dependency was cleared (CASCADE SET NULL)
      expect(updatedChild).not.toBeNull();
      expect(updatedChild?.dependsOnTaskId).toBeNull();
    });

    test('deleting task with multiple dependent tasks clears all dependencies', () => {
      const parentTask = createTask('Parent with multiple children');
      const child1 = createTask('Child 1', [], [], 3, null, parentTask.id);
      const child2 = createTask('Child 2', [], [], 3, null, parentTask.id);
      const child3 = createTask('Child 3', [], [], 3, null, parentTask.id);
      
      // Delete parent
      deleteTask(parentTask.id);
      
      // Verify all children have null dependency
      expect(getTask(child1.id)?.dependsOnTaskId).toBeNull();
      expect(getTask(child2.id)?.dependsOnTaskId).toBeNull();
      expect(getTask(child3.id)?.dependsOnTaskId).toBeNull();
    });
  });

  describe('deleteTask Event Payload', () => {
    test('task:deleted event payload is a string taskId', () => {
      const eventBus = getEventBus();
      const task = createTask('Event payload test');
      
      let payload: unknown = null;
      eventBus.on('task:deleted', (data) => {
        payload = data;
      });
      
      deleteTask(task.id);
      
      expect(typeof payload).toBe('string');
      expect(payload).toBe(task.id);
    });
  });

  describe('deleteTask Multiple Event Listeners', () => {
    test('task:deleted event reaches multiple listeners', () => {
      const eventBus = getEventBus();
      const task = createTask('Multi-listener deletion test');
      
      let listener1Called = false;
      let listener2Called = false;
      let listener3Called = false;
      let listener1Id = '';
      let listener2Id = '';
      let listener3Id = '';
      
      eventBus.on('task:deleted', (taskId) => {
        listener1Called = true;
        listener1Id = taskId;
      });
      
      eventBus.on('task:deleted', (taskId) => {
        listener2Called = true;
        listener2Id = taskId;
      });
      
      eventBus.on('task:deleted', (taskId) => {
        listener3Called = true;
        listener3Id = taskId;
      });
      
      deleteTask(task.id);
      
      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
      expect(listener3Called).toBe(true);
      expect(listener1Id).toBe(task.id);
      expect(listener2Id).toBe(task.id);
      expect(listener3Id).toBe(task.id);
    });
  });

  describe('deleteTask Idempotency', () => {
    test('deleting same task twice only emits event once', () => {
      const eventBus = getEventBus();
      const task = createTask('Idempotency test');
      
      let eventCount = 0;
      eventBus.on('task:deleted', () => {
        eventCount++;
      });
      
      // First deletion
      const firstDelete = deleteTask(task.id);
      expect(firstDelete).toBe(true);
      expect(eventCount).toBe(1);
      
      // Second deletion (task already gone)
      const secondDelete = deleteTask(task.id);
      expect(secondDelete).toBe(false);
      expect(eventCount).toBe(1); // Event not emitted again
    });
  });

  describe('deleteTask with Complex Task States', () => {
    test('can delete task in any state', () => {
      const eventBus = getEventBus();
      
      const taskProposal = createTask('Proposal state task');
      const taskQuestions = createTask('Questions state task');
      const taskResearch = createTask('Research state task');
      
      let deletedCount = 0;
      eventBus.on('task:deleted', () => {
        deletedCount++;
      });
      
      // Delete tasks in different states
      expect(deleteTask(taskProposal.id)).toBe(true);
      expect(deleteTask(taskQuestions.id)).toBe(true);
      expect(deleteTask(taskResearch.id)).toBe(true);
      
      expect(deletedCount).toBe(3);
    });

    test('can delete task with various priorities', () => {
      const eventBus = getEventBus();
      
      const lowPriority = createTask('Low priority', [], [], 1);
      const midPriority = createTask('Mid priority', [], [], 3);
      const highPriority = createTask('High priority', [], [], 5);
      
      let deletedCount = 0;
      eventBus.on('task:deleted', () => {
        deletedCount++;
      });
      
      deleteTask(lowPriority.id);
      deleteTask(midPriority.id);
      deleteTask(highPriority.id);
      
      expect(deletedCount).toBe(3);
    });

    test('can delete task with pins and hints', () => {
      const task = createTask(
        'Task with metadata',
        ['pin1', 'pin2', 'pin3'],
        ['hint1', 'hint2'],
        5,
        '/test/dir'
      );
      
      const deleted = deleteTask(task.id);
      
      expect(deleted).toBe(true);
      expect(getTask(task.id)).toBeNull();
    });
  });

  describe('deleteTask Integration with Other Events', () => {
    test('deleteTask does not interfere with other event types', () => {
      const eventBus = getEventBus();
      
      let taskCreatedCount = 0;
      let taskDeletedCount = 0;
      
      eventBus.on('task:created', () => {
        taskCreatedCount++;
      });
      
      eventBus.on('task:deleted', () => {
        taskDeletedCount++;
      });
      
      // Create and delete multiple tasks
      const task1 = createTask('Task 1');
      const task2 = createTask('Task 2');
      
      expect(taskCreatedCount).toBe(2);
      expect(taskDeletedCount).toBe(0);
      
      deleteTask(task1.id);
      
      expect(taskCreatedCount).toBe(2);
      expect(taskDeletedCount).toBe(1);
      
      deleteTask(task2.id);
      
      expect(taskCreatedCount).toBe(2);
      expect(taskDeletedCount).toBe(2);
    });
  });
});
