import { Router, Request, Response, NextFunction } from 'express';
import {
  createTask,
  getTask,
  getAllTasks,
  getTasksByState,
  updateTaskState,
  updateTaskPriority,
  getTaskWithNodes,
  createNode,
  updateNode,
} from './task-store.js';
import { claimNode, releaseClaim, renewClaim, getClaim, getClaimByNode, cleanupExpiredClaims } from './queue.js';
import { getHeap } from './heap.js';
import { TaskState, TASK_STATES, CreateTaskRequest, UpdateTaskStateRequest, UpdateTaskPriorityRequest, ClaimTaskRequest, HeapPeekItem } from '@determinant/types';

const router = Router();

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedKey = process.env.DETERMINANT_API_KEY;

  if (expectedKey && !apiKey) {
    res.status(401).json({ error: 'Unauthorized: API key required' });
    return;
  }

  if (expectedKey && apiKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }

  next();
}

router.use(authMiddleware);

router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

router.get('/tasks', (req: Request, res: Response) => {
  const state = req.query.state as TaskState | undefined;

  let tasks;
  if (state) {
    if (!TASK_STATES.includes(state)) {
      res.status(400).json({ error: `Invalid state. Valid: ${TASK_STATES.join(', ')}` });
      return;
    }
    tasks = getTasksByState(state);
  } else {
    tasks = getAllTasks();
  }

  res.json({ tasks });
});

router.post('/tasks', (req: Request, res: Response) => {
  const body = req.body as CreateTaskRequest;

  if (!body.vibe) {
    res.status(400).json({ error: 'Vibe is required' });
    return;
  }

  const priority = body.priority ?? 3;
  const pins = body.pins ?? [];
  const hints = body.hints ?? [];
  const task = createTask(body.vibe, pins, hints, priority);

  res.status(201).json({ task });
});

router.get('/tasks/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const full = getTaskWithNodes(id);

  if (!full) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task: full.task, nodes: full.nodes });
});

router.patch('/tasks/:id/state', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateTaskStateRequest;

  if (!body.state) {
    res.status(400).json({ error: 'State is required' });
    return;
  }

  if (!TASK_STATES.includes(body.state)) {
    res.status(400).json({ error: `Invalid state. Valid: ${TASK_STATES.join(', ')}` });
    return;
  }

  const task = updateTaskState(id, body.state);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

router.patch('/tasks/:id/priority', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateTaskPriorityRequest;

  if (body.priority === undefined) {
    res.status(400).json({ error: 'Priority is required' });
    return;
  }

  if (body.priority < 1 || body.priority > 5) {
    res.status(400).json({ error: 'Priority must be between 1 and 5' });
    return;
  }

  const task = updateTaskPriority(id, body.priority);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

// Node routes
router.post('/tasks/:taskId/nodes', (req: Request, res: Response) => {
  const taskId = req.params.taskId as string;
  const {
    toStage,
    content,
    parentNodeId = null,
    fromStage = null,
    confidenceBefore = null,
    confidenceAfter = null
  } = req.body;

  // Validate required fields
  if (!toStage || content === undefined) {
    res.status(400).json({ error: 'Missing required fields: toStage, content' });
    return;
  }

  // Validate toStage
  if (!TASK_STATES.includes(toStage as TaskState)) {
    res.status(400).json({ error: `Invalid toStage. Valid: ${TASK_STATES.join(', ')}` });
    return;
  }

  // Validate task exists
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  try {
    const node = createNode(
      taskId,
      toStage,
      content,
      parentNodeId,
      fromStage,
      confidenceBefore,
      confidenceAfter
    );
    res.status(201).json({ node });
  } catch (error) {
    console.error('Error creating node:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/nodes/:nodeId', (req: Request, res: Response) => {
  const nodeId = req.params.nodeId as string;
  const updates = req.body;

  try {
    const updatedNode = updateNode(nodeId, updates);
    
    if (!updatedNode) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    res.json({ node: updatedNode });
  } catch (error) {
    console.error('Error updating node:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/queue/:state', (req: Request, res: Response) => {
  const state = req.params.state as string;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;

  if (!TASK_STATES.includes(state as TaskState)) {
    res.status(400).json({ error: `Invalid state. Valid: ${TASK_STATES.join(', ')}` });
    return;
  }

  const heap = getHeap();
  const items = heap.peek(state as TaskState, limit);

  res.json({ state, items });
});

router.post('/claims', (req: Request, res: Response) => {
  const body = req.body as ClaimTaskRequest;

  if (!body.taskId) {
    res.status(400).json({ error: 'taskId is required' });
    return;
  }

  const task = getTask(body.taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const existingClaim = getClaimByNode(task.id);
  if (existingClaim) {
    res.status(409).json({ error: 'Task already claimed', claim: existingClaim });
    return;
  }

  const claim = claimNode(body.taskId, body.ttlMinutes ?? 30);
  if (!claim) {
    res.status(409).json({ error: 'Could not claim task' });
    return;
  }

  res.status(201).json({ claim });
});

router.delete('/claims/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;

  const released = releaseClaim(id);
  if (!released) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  res.status(204).send();
});

router.post('/claims/:id/renew', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const ttlMinutes = req.body.ttlMinutes ?? 30;

  const renewed = renewClaim(id, ttlMinutes);
  if (!renewed) {
    res.status(404).json({ error: 'Claim not found' });
    return;
  }

  const claim = getClaim(id);
  res.json({ claim });
});

router.post('/claims/cleanup', (_req: Request, res: Response) => {
  const cleaned = cleanupExpiredClaims();
  res.json({ cleaned });
});

router.get('/heap-config', (req: Request, res: Response) => {
  const heap = getHeap();
  const config = heap.getConfig();

  res.json({ config });
});

router.patch('/heap-config', (req: Request, res: Response) => {
  const heap = getHeap();
  const config = heap.getConfig();

  const updates = req.body as Partial<typeof config>;
  for (const key of ['priorityWeight', 'confidenceWeight', 'manualWeight'] as const) {
    if (updates[key] !== undefined) {
      (config as any)[key] = updates[key];
    }
  }

  heap.setConfig(config);
  res.json({ config: heap.getConfig() });
});

export default router;