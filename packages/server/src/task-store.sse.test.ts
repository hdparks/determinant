import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initDb, closeDb } from './db.js';
import {
  createTask,
  updateTaskState,
  updateTaskPriority,
  updateTaskVibe,
  createNode,
  updateNode,
  markNodeProcessed,
  completeNodeProcessing,
  updateTaskDependency,
} from './task-store.js';
import { getEventBus, resetEventBus } from './events.js';
import type { Task, Node, QueueItem } from '@determinant/types';

/**
 * Integration tests for SSE event emission from task-store operations
 * 
 * These tests verify that CRUD operations on tasks and nodes properly
 * emit SSE events with correct payloads.
 */
describe('Task Store SSE Integration', () => {
  beforeAll(() => {
    initDb(':memory:');
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    resetEventBus();
  });

  describe('Task Operations', () => {
    test('createTask emits task:created event', () => {
      const eventBus = getEventBus();
      let emittedTask: Task | null = null;
      
      eventBus.on('task:created', (task) => {
        emittedTask = task;
      });
      
      const task = createTask('Test task vibe', [], [], 3);
      
      expect(emittedTask).not.toBeNull();
      expect(emittedTask?.id).toBe(task.id);
      expect(emittedTask?.vibe).toBe('Test task vibe');
      expect(emittedTask?.state).toBe('Proposal');
      expect(emittedTask?.priority).toBe(3);
    });

    test('createTask emits event with all task fields', () => {
      const eventBus = getEventBus();
      let emittedTask: Task | null = null;
      
      eventBus.on('task:created', (task) => {
        emittedTask = task;
      });
      
      const task = createTask(
        'Complex task',
        ['pin1', 'pin2'],
        ['hint1'],
        5,
        '/test/dir'
      );
      
      expect(emittedTask).not.toBeNull();
      expect(emittedTask?.vibe).toBe('Complex task');
      expect(emittedTask?.pins).toEqual(['pin1', 'pin2']);
      expect(emittedTask?.hints).toEqual(['hint1']);
      expect(emittedTask?.priority).toBe(5);
      expect(emittedTask?.workingDir).toBe('/test/dir');
      expect(emittedTask?.createdAt).toBeInstanceOf(Date);
      expect(emittedTask?.updatedAt).toBeInstanceOf(Date);
    });

    test('updateTaskState emits task:updated event', () => {
      const eventBus = getEventBus();
      const task = createTask('Update state test');
      
      let emittedTask: Task | null = null;
      eventBus.on('task:updated', (t) => {
        emittedTask = t;
      });
      
      const updated = updateTaskState(task.id, 'Questions');
      
      expect(emittedTask).not.toBeNull();
      expect(emittedTask?.id).toBe(task.id);
      expect(emittedTask?.state).toBe('Questions');
    });

    test('updateTaskPriority emits task:updated and queue:updated events', async () => {
      const eventBus = getEventBus();
      const task = createTask('Priority test');
      
      let taskUpdated = false;
      let queueUpdated = false;
      
      eventBus.on('task:updated', (t) => {
        if (t.id === task.id && t.priority === 5) {
          taskUpdated = true;
        }
      });
      
      eventBus.on('queue:updated', () => {
        queueUpdated = true;
      });
      
      await updateTaskPriority(task.id, 5);
      
      expect(taskUpdated).toBe(true);
      expect(queueUpdated).toBe(true);
    });

    test('updateTaskVibe emits task:updated event', () => {
      const eventBus = getEventBus();
      const task = createTask('Original vibe');
      
      let emittedTask: Task | null = null;
      eventBus.on('task:updated', (t) => {
        emittedTask = t;
      });
      
      const updated = updateTaskVibe(task.id, 'New vibe');
      
      expect(emittedTask).not.toBeNull();
      expect(emittedTask?.vibe).toBe('New vibe');
    });

    test('updateTaskDependency emits task:updated and queue:updated events', async () => {
      const eventBus = getEventBus();
      const parentTask = createTask('Parent task');
      const childTask = createTask('Child task');
      
      let taskUpdated = false;
      let queueUpdated = false;
      
      eventBus.on('task:updated', (t) => {
        if (t.id === childTask.id && t.dependsOnTaskId === parentTask.id) {
          taskUpdated = true;
        }
      });
      
      eventBus.on('queue:updated', () => {
        queueUpdated = true;
      });
      
      await updateTaskDependency(childTask.id, parentTask.id);
      
      expect(taskUpdated).toBe(true);
      expect(queueUpdated).toBe(true);
    });
  });

  describe('Node Operations', () => {
    test('createNode emits node:created with task and node', async () => {
      const eventBus = getEventBus();
      const task = createTask('Node test');
      
      let emittedData: { task: Task; node: Node } | null = null;
      eventBus.on('node:created', (data) => {
        emittedData = data;
      });
      
      const node = await createNode(
        task.id,
        'Questions',
        'Node content',
        null,
        'Proposal',
        5,
        8
      );
      
      expect(emittedData).not.toBeNull();
      expect(emittedData?.task.id).toBe(task.id);
      expect(emittedData?.node.id).toBe(node.id);
      expect(emittedData?.node.content).toBe('Node content');
      expect(emittedData?.node.toStage).toBe('Questions');
      expect(emittedData?.node.confidenceBefore).toBe(5);
      expect(emittedData?.node.confidenceAfter).toBe(8);
    });

    test('createNode emits task:updated event (state change)', async () => {
      const eventBus = getEventBus();
      const task = createTask('State change test');
      
      let taskUpdated = false;
      eventBus.on('task:updated', (t) => {
        if (t.id === task.id && t.state === 'Questions') {
          taskUpdated = true;
        }
      });
      
      await createNode(task.id, 'Questions', 'Content');
      
      expect(taskUpdated).toBe(true);
    });

    test('createNode emits queue:updated event', async () => {
      const eventBus = getEventBus();
      const task = createTask('Queue test');
      
      let queueUpdated = false;
      eventBus.on('queue:updated', (queue) => {
        queueUpdated = true;
      });
      
      await createNode(task.id, 'Questions', 'Content');
      
      expect(queueUpdated).toBe(true);
    });

    test('updateNode emits node:updated event', async () => {
      const eventBus = getEventBus();
      const task = createTask('Update node test');
      
      // Create a node first (async)
      const node = await createNode(task.id, 'Questions', 'Original content');
      
      let emittedNode: Node | null = null;
      eventBus.on('node:updated', (n) => {
        emittedNode = n;
      });
      
      const updated = updateNode(node.id, {
        content: 'Updated content',
        confidenceBefore: 6,
      });
      
      expect(emittedNode).not.toBeNull();
      expect(emittedNode?.content).toBe('Updated content');
      expect(emittedNode?.confidenceBefore).toBe(6);
    });

    test('markNodeProcessed emits node:processed event', async () => {
      const eventBus = getEventBus();
      const task = createTask('Process node test');
      const node = await createNode(task.id, 'Questions', 'Content to process');
      
      let emittedNode: Node | null = null;
      eventBus.on('node:processed', (n) => {
        emittedNode = n;
      });
      
      const processed = await markNodeProcessed(node.id);
      
      expect(emittedNode).not.toBeNull();
      expect(emittedNode?.id).toBe(node.id);
      expect(emittedNode?.processedAt).toBeInstanceOf(Date);
    });

    test('markNodeProcessed emits queue:updated event', async () => {
      const eventBus = getEventBus();
      const task = createTask('Queue removal test');
      const node = await createNode(task.id, 'Questions', 'Content');
      
      let queueUpdated = false;
      eventBus.on('queue:updated', () => {
        queueUpdated = true;
      });
      
      await markNodeProcessed(node.id);
      
      expect(queueUpdated).toBe(true);
    });

    test('completeNodeProcessing emits node:created, node:processed, task:updated, and queue:updated', async () => {
      const eventBus = getEventBus();
      const task = createTask('Complete processing test');
      const parentNode = await createNode(task.id, 'Questions', 'Parent content');
      
      let nodeCreated = false;
      let nodeProcessed = false;
      let taskUpdated = false;
      let queueUpdated = false;
      
      eventBus.on('node:created', (data) => {
        if (data.node.parentNodeId === parentNode.id) {
          nodeCreated = true;
        }
      });
      
      eventBus.on('node:processed', (n) => {
        if (n.id === parentNode.id) {
          nodeProcessed = true;
        }
      });
      
      eventBus.on('task:updated', (t) => {
        if (t.id === task.id && t.state === 'Research') {
          taskUpdated = true;
        }
      });
      
      eventBus.on('queue:updated', () => {
        queueUpdated = true;
      });
      
      const result = await completeNodeProcessing(parentNode.id, {
        toStage: 'Research',
        content: 'Child content',
        confidenceBefore: 7,
        confidenceAfter: 9,
      });
      
      expect(nodeCreated).toBe(true);
      expect(nodeProcessed).toBe(true);
      expect(taskUpdated).toBe(true);
      expect(queueUpdated).toBe(true);
      expect(result.childNode.parentNodeId).toBe(parentNode.id);
      expect(result.parentNode.processedAt).toBeInstanceOf(Date);
    });
  });

  describe('Event Payload Integrity', () => {
    test('task:created payload contains all required fields', () => {
      const eventBus = getEventBus();
      let payload: Task | null = null;
      
      eventBus.on('task:created', (task) => {
        payload = task;
      });
      
      createTask('Payload test', ['pin'], ['hint'], 4, '/dir');
      
      expect(payload).toMatchObject({
        id: expect.any(String),
        vibe: 'Payload test',
        pins: ['pin'],
        hints: ['hint'],
        state: 'Proposal',
        priority: 4,
        manualWeight: 0,
        workingDir: '/dir',
        dependsOnTaskId: null,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    test('node:created payload contains task and node objects', async () => {
      const eventBus = getEventBus();
      const task = createTask('Node payload test');
      
      let payload: { task: Task; node: Node } | null = null;
      eventBus.on('node:created', (data) => {
        payload = data;
      });
      
      await createNode(task.id, 'Questions', 'Content', null, 'Proposal', 5, 7);
      
      expect(payload).not.toBeNull();
      expect(payload?.task).toMatchObject({
        id: task.id,
        vibe: 'Node payload test',
        state: 'Questions', // Updated by createNode
      });
      expect(payload?.node).toMatchObject({
        id: expect.any(String),
        taskId: task.id,
        content: 'Content',
        toStage: 'Questions',
        fromStage: 'Proposal',
        confidenceBefore: 5,
        confidenceAfter: 7,
        processedAt: null,
        createdAt: expect.any(Date),
      });
    });

    test('queue:updated payload is array of QueueItem', async () => {
      const eventBus = getEventBus();
      const task = createTask('Queue payload test');
      
      let payload: QueueItem[] | null = null;
      eventBus.on('queue:updated', (queue) => {
        payload = queue;
      });
      
      await updateTaskPriority(task.id, 4);
      
      expect(Array.isArray(payload)).toBe(true);
      // Queue items should have task, node, score, and confidence
      if (payload && payload.length > 0) {
        expect(payload[0]).toHaveProperty('task');
        expect(payload[0]).toHaveProperty('node');
        expect(payload[0]).toHaveProperty('score');
        expect(payload[0]).toHaveProperty('confidence');
      }
    });
  });

  describe('Event Ordering', () => {
    test('createNode emits events in correct order: node:created, task:updated, queue:updated', async () => {
      const eventBus = getEventBus();
      const task = createTask('Event order test');
      const events: string[] = [];
      
      eventBus.on('node:created', () => {
        events.push('node:created');
      });
      
      eventBus.on('task:updated', () => {
        events.push('task:updated');
      });
      
      eventBus.on('queue:updated', () => {
        events.push('queue:updated');
      });
      
      await createNode(task.id, 'Questions', 'Content');
      
      // Note: createTask also emits task:created, so filter that out
      const relevantEvents = events.filter(e => e !== 'task:created');
      
      expect(relevantEvents).toEqual([
        'node:created',
        'task:updated',
        'queue:updated',
      ]);
    });

    test('completeNodeProcessing emits all events', async () => {
      const eventBus = getEventBus();
      const task = createTask('Complete order test');
      const parentNode = await createNode(task.id, 'Questions', 'Parent');
      
      const events: string[] = [];
      
      eventBus.on('node:created', () => {
        events.push('node:created');
      });
      
      eventBus.on('node:processed', () => {
        events.push('node:processed');
      });
      
      eventBus.on('task:updated', () => {
        events.push('task:updated');
      });
      
      eventBus.on('queue:updated', () => {
        events.push('queue:updated');
      });
      
      await completeNodeProcessing(parentNode.id, {
        toStage: 'Research',
        content: 'Child',
      });
      
      // Should have all 4 event types
      expect(events).toContain('node:created');
      expect(events).toContain('node:processed');
      expect(events).toContain('task:updated');
      expect(events).toContain('queue:updated');
    });
  });

  describe('Multiple Event Listeners', () => {
    test('task:created event reaches multiple listeners', () => {
      const eventBus = getEventBus();
      
      let listener1Called = false;
      let listener2Called = false;
      let listener3Called = false;
      
      eventBus.on('task:created', () => {
        listener1Called = true;
      });
      
      eventBus.on('task:created', () => {
        listener2Called = true;
      });
      
      eventBus.on('task:created', () => {
        listener3Called = true;
      });
      
      createTask('Multi-listener test');
      
      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
      expect(listener3Called).toBe(true);
    });

    test('different event types can be listened to independently', async () => {
      const eventBus = getEventBus();
      
      let taskCreated = false;
      let taskUpdated = false;
      let nodeCreated = false;
      let queueUpdated = false;
      
      eventBus.on('task:created', () => {
        taskCreated = true;
      });
      
      eventBus.on('task:updated', () => {
        taskUpdated = true;
      });
      
      eventBus.on('node:created', () => {
        nodeCreated = true;
      });
      
      eventBus.on('queue:updated', () => {
        queueUpdated = true;
      });
      
      // Create task (emits task:created)
      const task = createTask('Independent listeners test');
      expect(taskCreated).toBe(true);
      
      // Create a node (should emit node:created, task:updated, queue:updated)
      await createNode(task.id, 'Questions', 'Content');
      
      expect(nodeCreated).toBe(true);
      expect(taskUpdated).toBe(true);
      expect(queueUpdated).toBe(true);
    });
  });

  describe('Error Cases', () => {
    test('events not emitted when operation fails', () => {
      const eventBus = getEventBus();
      
      let taskUpdated = false;
      eventBus.on('task:updated', () => {
        taskUpdated = true;
      });
      
      // Try to update non-existent task
      updateTaskState('non-existent-id', 'Working');
      
      // Event should not be emitted for failed operation
      expect(taskUpdated).toBe(false);
    });

    test('updateNode returns null for non-existent node and does not emit event', () => {
      const eventBus = getEventBus();
      
      let nodeUpdated = false;
      eventBus.on('node:updated', () => {
        nodeUpdated = true;
      });
      
      const result = updateNode('non-existent-node', { content: 'New content' });
      
      expect(result).toBeNull();
      expect(nodeUpdated).toBe(false);
    });
  });
});
