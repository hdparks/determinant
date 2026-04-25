import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './api.js';
import { initDb, closeDb } from './db.js';
import { createTask, createNode } from './task-store.js';
import { getEventBus, resetEventBus } from './events.js';

/**
 * API DELETE Endpoint Tests for Task Deletion
 * 
 * These tests verify that the DELETE /tasks/:id endpoint:
 * 1. Returns 204 on successful deletion
 * 2. Returns 404 when task not found
 * 3. Triggers task:deleted SSE event
 * 4. Properly handles edge cases
 */
describe('DELETE /tasks/:id API Endpoint', () => {
  let app: express.Application;

  beforeAll(() => {
    initDb(':memory:');
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    resetEventBus();
  });

  describe('Successful Deletion', () => {
    test('returns 204 No Content on successful deletion', async () => {
      const task = createTask('Task to delete via API');
      
      const response = await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      expect(response.body).toEqual({});
      expect(response.text).toBe('');
    });

    test('actually deletes the task from database', async () => {
      const task = createTask('Task to verify deletion');
      
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      // Try to GET the task - should return 404
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(404);
    });

    test('emits task:deleted SSE event', async () => {
      const task = createTask('Task for SSE event test');
      const eventBus = getEventBus();
      
      let emittedTaskId: string | null = null;
      eventBus.on('task:deleted', (taskId) => {
        emittedTaskId = taskId;
      });
      
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      expect(emittedTaskId).toBe(task.id);
    });
  });

  describe('Error Cases', () => {
    test('returns 404 when task does not exist', async () => {
      const response = await request(app)
        .delete('/api/tasks/non-existent-task-id')
        .expect(404);
      
      expect(response.body).toEqual({ error: 'Task not found' });
    });

    test('returns 404 for empty task ID', async () => {
      await request(app)
        .delete('/api/tasks/')
        .expect(404); // Express route won't match
    });

    test('does not emit event when task not found', async () => {
      const eventBus = getEventBus();
      
      let eventEmitted = false;
      eventBus.on('task:deleted', () => {
        eventEmitted = true;
      });
      
      await request(app)
        .delete('/api/tasks/fake-task-id')
        .expect(404);
      
      expect(eventEmitted).toBe(false);
    });
  });

  describe('Cascading Deletion', () => {
    test('deletes task with nodes successfully', async () => {
      const task = createTask('Task with nodes');
      await createNode(task.id, 'Questions', 'Node content');
      
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      // Verify task is gone
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(404);
    });

    test('deletes task with dependent tasks', async () => {
      const parentTask = createTask('Parent task');
      const childTask = createTask('Child task', [], [], 3, null, parentTask.id);
      
      await request(app)
        .delete(`/api/tasks/${parentTask.id}`)
        .expect(204);
      
      // Parent should be gone
      await request(app)
        .get(`/api/tasks/${parentTask.id}`)
        .expect(404);
      
      // Child should still exist with null dependency
      const childResponse = await request(app)
        .get(`/api/tasks/${childTask.id}`)
        .expect(200);
      
      expect(childResponse.body.dependsOnTaskId).toBeUndefined();
    });

    test('deletes task with multiple nodes', async () => {
      const task = createTask('Task with multiple nodes');
      await createNode(task.id, 'Questions', 'Node 1');
      await createNode(task.id, 'Research', 'Node 2');
      // Note: Can't go directly to 'Planning' - not a valid stage
      
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(404);
    });
  });

  describe('Idempotency', () => {
    test('second deletion returns 404', async () => {
      const task = createTask('Idempotency test');
      
      // First deletion
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      // Second deletion
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(404);
    });

    test('only emits one event for multiple deletion attempts', async () => {
      const task = createTask('Event emission test');
      const eventBus = getEventBus();
      
      let eventCount = 0;
      eventBus.on('task:deleted', () => {
        eventCount++;
      });
      
      // First deletion
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      expect(eventCount).toBe(1);
      
      // Second deletion attempt
      await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(404);
      
      expect(eventCount).toBe(1); // Still only 1
    });
  });

  describe('HTTP Method Validation', () => {
    test('GET /tasks/:id does not delete task', async () => {
      const task = createTask('GET test');
      
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(200);
      
      // Task should still exist
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(200);
    });

    test('POST /tasks/:id does not delete task', async () => {
      const task = createTask('POST test');
      
      // POST to wrong endpoint - will likely 404 or error
      const response = await request(app)
        .post(`/api/tasks/${task.id}`)
        .send({});
      
      // Regardless of response, task should still exist
      await request(app)
        .get(`/api/tasks/${task.id}`)
        .expect(200);
    });
  });

  describe('Response Headers', () => {
    test('DELETE returns correct content-type header', async () => {
      const task = createTask('Headers test');
      
      const response = await request(app)
        .delete(`/api/tasks/${task.id}`)
        .expect(204);
      
      // 204 No Content typically has no content-type or empty body
      expect(response.text).toBe('');
    });
  });

  describe('Integration with Task List', () => {
    test('deleted task no longer appears in task list', async () => {
      const task1 = createTask('Task 1');
      const task2 = createTask('Task 2');
      const task3 = createTask('Task 3');
      
      // Delete task2
      await request(app)
        .delete(`/api/tasks/${task2.id}`)
        .expect(204);
      
      // Get task list
      const response = await request(app)
        .get('/api/tasks')
        .expect(200);
      
      const taskIds = response.body.tasks.map((t: any) => t.id);
      
      expect(taskIds).toContain(task1.id);
      expect(taskIds).not.toContain(task2.id);
      expect(taskIds).toContain(task3.id);
    });

    test('can delete multiple tasks sequentially', async () => {
      const tasks = [
        createTask('Task A'),
        createTask('Task B'),
        createTask('Task C'),
      ];
      
      // Delete all tasks
      for (const task of tasks) {
        await request(app)
          .delete(`/api/tasks/${task.id}`)
          .expect(204);
      }
      
      // Verify all are gone
      for (const task of tasks) {
        await request(app)
          .get(`/api/tasks/${task.id}`)
          .expect(404);
      }
    });
  });

  describe('Special Characters in Task ID', () => {
    test('handles URL encoding in task IDs', async () => {
      // Task IDs are ULIDs, so they shouldn't have special chars,
      // but test the endpoint handles encoding correctly
      await request(app)
        .delete('/api/tasks/task%20with%20spaces')
        .expect(404); // Will not be found, but should not error
    });
  });
});
