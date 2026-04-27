import { Router, Request, Response, NextFunction } from 'express';
import {
  createTask,
  getTask,
  getAllTasks,
  getAllTasksWithScores,
  getTasksByState,
  getTasksByStateWithScores,
  updateTaskState,
  updateTaskPriority,
  updateTaskVibe,
  updateTaskDependency,
  updateTaskManualWeight,
  wouldCreateCycle,
  getTaskWithNodes,
  createNode,
  getNode,
  updateNode,
  markNodeProcessed,
  completeNodeProcessing,
  processHumanApproval,
  detectOrphanedNodes,
  detectDuplicateChildren,
  fixOrphanedNodes,
  getTaskDependents,
  getDependencyChain,
  deleteTask,
  calculateTaskScore,
} from './task-store.js';
import { getHeap } from './heap.js';
import { TaskState, TASK_STATES, CreateTaskRequest, UpdateTaskStateRequest, UpdateTaskPriorityRequest, UpdateTaskManualWeightRequest, UpdateTaskDependencyRequest, UpdateTaskVibeRequest, QuestionAnswersInput, DesignApprovalInput } from '@determinant/types';
import { getEventBus } from './events.js';
import { newId } from './db.js';

const router = Router();

// SSE endpoint (must be before authMiddleware since it has custom auth)
router.get('/events', (req: Request, res: Response) => {
  // Custom auth for SSE (query parameter instead of header)
  // EventSource API doesn't support custom headers
  const apiKey = req.query.apiKey as string;
  const expectedKey = process.env.DETERMINANT_API_KEY;

  if (expectedKey && !apiKey) {
    res.status(401).json({ error: 'Unauthorized: API key required' });
    return;
  }

  if (expectedKey && apiKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }

  const eventBus = getEventBus();
  
  // Check capacity BEFORE setting headers (so we can send proper JSON response)
  if (!eventBus.hasCapacity()) {
    res.status(503).json({ 
      error: 'Server at capacity. Too many SSE connections.' 
    });
    return;
  }

  // Set SSE headers (after capacity check passes)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Disable response buffering (critical for SSE)
  res.flushHeaders();

  const clientId = newId();
  
  // Add client to active connections (double-check for race conditions)
  const added = eventBus.addClient(clientId, res);
  if (!added) {
    // Race condition: capacity reached between hasCapacity() and addClient()
    console.error(`[SSE] Race condition: capacity reached after pre-check`);
    res.end();
    return;
  }
  
  console.log(`[SSE] Client connected: ${clientId} from ${req.ip}`);
  
  // Send initial connection success comment
  res.write(': connected\n\n');

  // Set up heartbeat (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (error) {
      // Client disconnected, will be cleaned up in close handler
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    eventBus.removeClient(clientId);
    console.log(`[SSE] Client disconnected: ${clientId}`);
  });
});

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
    tasks = getTasksByStateWithScores(state);
  } else {
    tasks = getAllTasksWithScores();
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
  
  // Validate priority (consistent with PATCH endpoint)
  if (typeof priority !== 'number' || isNaN(priority) || priority < 1 || priority > 5) {
    res.status(400).json({ error: 'Priority must be between 1 and 5' });
    return;
  }
  
  const pins = body.pins ?? [];
  const hints = body.hints ?? [];
  const workingDir = body.workingDir ?? null;
  const dependsOnTaskId = body.dependsOnTaskId ?? null;
  
  // Validate dependency exists
  if (dependsOnTaskId) {
    const parentTask = getTask(dependsOnTaskId);
    if (!parentTask) {
      res.status(400).json({ error: 'Invalid dependsOnTaskId: task not found' });
      return;
    }
  }

  try {
    const task = createTask(body.vibe, pins, hints, priority, workingDir, dependsOnTaskId);
    res.status(201).json({ task });
  } catch (error) {
    // Catch circular dependency errors
    res.status(400).json({ error: (error as Error).message });
  }
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

router.patch('/tasks/:id/manual-weight', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateTaskManualWeightRequest;

  if (body.manualWeight === undefined) {
    res.status(400).json({ error: 'Manual weight is required' });
    return;
  }

  if (typeof body.manualWeight !== 'number' || !Number.isFinite(body.manualWeight)) {
    res.status(400).json({ error: 'Manual weight must be a valid number' });
    return;
  }

  const task = await updateTaskManualWeight(id, body.manualWeight);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Events already emitted in updateTaskManualWeight
  res.json({ task });
});

router.patch('/tasks/:id/vibe', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateTaskVibeRequest;

  // Type validation
  if (typeof body.vibe !== 'string') {
    res.status(400).json({ error: 'Vibe must be a string' });
    return;
  }

  // Required field validation
  if (!body.vibe || !body.vibe.trim()) {
    res.status(400).json({ error: 'Vibe cannot be empty' });
    return;
  }

  // Length validation
  if (body.vibe.length > 1000) {
    res.status(400).json({ error: 'Vibe must be 1000 characters or less' });
    return;
  }

  const task = updateTaskVibe(id, body.vibe.trim());
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

router.patch('/tasks/:id/dependency', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const body = req.body as UpdateTaskDependencyRequest;

  // Validate task exists
  const task = getTask(id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Validate parent task exists (if setting dependency)
  if (body.dependsOnTaskId !== null) {
    const parentTask = getTask(body.dependsOnTaskId);
    if (!parentTask) {
      res.status(400).json({ error: 'Invalid dependsOnTaskId: task not found' });
      return;
    }
    
    // Prevent self-dependency
    if (body.dependsOnTaskId === id) {
      res.status(400).json({ error: 'Task cannot depend on itself' });
      return;
    }
    
    // Prevent circular dependencies
    if (wouldCreateCycle(id, body.dependsOnTaskId)) {
      res.status(400).json({ error: 'Circular dependency detected' });
      return;
    }
  }

  try {
    const updatedTask = await updateTaskDependency(id, body.dependsOnTaskId);
    res.json({ task: updatedTask });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

// Get all tasks that depend on this task (reverse dependency lookup)
router.get('/tasks/:id/dependents', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const task = getTask(id);
  
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  
  const dependents = getTaskDependents(id);
  res.json({ dependents });
});

// Get full dependency chain (ancestors)
router.get('/tasks/:id/dependency-chain', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const task = getTask(id);
  
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  
  const chain = getDependencyChain(id);
  res.json({ chain });
});

// Delete a task
router.delete('/tasks/:id', (req: Request, res: Response) => {
  const id = req.params.id as string;
  
  const deleted = deleteTask(id);
  
  if (!deleted) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  
  // 204 No Content - successful deletion with no response body
  res.status(204).send();
});

// Node routes
router.post('/tasks/:taskId/nodes', async (req: Request, res: Response) => {
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
    const node = await createNode(
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

router.get('/nodes/:nodeId', (req: Request, res: Response) => {
  const nodeId = req.params.nodeId as string;

  try {
    const node = getNode(nodeId);
    
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    res.json({ node });
  } catch (error) {
    console.error('Error fetching node:', error);
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

router.post('/nodes/:nodeId/processed', async (req: Request, res: Response) => {
  const nodeId = req.params.nodeId as string;

  try {
    const node = await markNodeProcessed(nodeId);
    
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    res.json({ node });
  } catch (error) {
    console.error('Error marking node as processed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Atomically complete node processing by creating child and marking parent as processed.
 * This endpoint ensures both operations succeed together or fail together.
 */
router.post('/nodes/:parentId/complete', async (req: Request, res: Response) => {
  const parentId = req.params.parentId as string;
  const { toStage, content, confidenceBefore, confidenceAfter } = req.body;

  // Validate required fields
  if (!toStage) {
    res.status(400).json({ error: 'Missing required field: toStage' });
    return;
  }

  // Validate toStage is valid
  if (!TASK_STATES.includes(toStage as TaskState)) {
    res.status(400).json({ error: `Invalid toStage: ${toStage}` });
    return;
  }

  try {
    const result = await completeNodeProcessing(parentId, {
      toStage: toStage as TaskState,
      content,
      confidenceBefore: confidenceBefore ?? null,
      confidenceAfter: confidenceAfter ?? null,
    });

    res.json(result);
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('Error completing node processing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Process human approval for QuestionAnswers or DesignApproval nodes.
 * Accepts approval input, formats artifact content, creates child node.
 */
router.post('/nodes/:nodeId/approve', async (req: Request, res: Response) => {
  const nodeId = req.params.nodeId as string;
  const input = req.body;

  try {
    // Get the node to determine its type
    const node = getNode(nodeId);
    
    if (!node) {
      res.status(404).json({ error: 'Node not found' });
      return;
    }

    // Verify it's a human checkpoint node
    if (node.claimable) {
      res.status(400).json({ 
        error: 'This node does not require human approval' 
      });
      return;
    }

    // Verify node hasn't been processed yet
    if (node.processedAt) {
      res.status(400).json({ 
        error: 'This node has already been processed' 
      });
      return;
    }

    let approvalContent: string;
    let childToStage: TaskState;

    // Handle QuestionAnswers
    if (node.toStage === 'QuestionAnswers') {
      const questionsInput = input as QuestionAnswersInput;
      
      // Validate input
      if (!questionsInput.answers || !Array.isArray(questionsInput.answers)) {
        res.status(400).json({ error: 'Invalid input: answers array required' });
        return;
      }

      // Validate each answer has either selectedOptionId or customAnswer
      for (const item of questionsInput.answers) {
        if (!item.selectedOptionId && !item.customAnswer?.trim()) {
          res.status(400).json({ 
            error: `Question ${item.questionNumber} "${item.question}" requires an answer. ` +
                   'Please select an option or provide a custom answer.'
          });
          return;
        }
      }

      // Note: Full artifact formatting happens in client's QuestionAnswersNode.processHumanInput
      // Server just validates and passes through to client
      approvalContent = '# Question Answers\n\n';
      approvalContent += 'Human answers to research questions:\n\n';

      for (const item of questionsInput.answers) {
        approvalContent += `## Question ${item.questionNumber}: ${item.question}\n\n`;
        
        if (item.customAnswer) {
          approvalContent += `**Answer**: ${item.customAnswer}\n\n`;
        } else if (item.selectedOptionId) {
          approvalContent += `**Selected Option**: ${item.selectedOptionId}\n\n`;
        }
      }

      childToStage = 'Research';
    } 
    // Handle DesignApproval
    else if (node.toStage === 'DesignApproval') {
      const designInput = input as DesignApprovalInput;
      
      // Validate input
      if (typeof designInput.approved !== 'boolean') {
        res.status(400).json({ error: 'Invalid input: approved boolean required' });
        return;
      }

      if (!designInput.approved && (!designInput.feedback || designInput.feedback.trim() === '')) {
        res.status(400).json({ 
          error: 'Feedback is required when design is not approved' 
        });
        return;
      }

      // Format the approval artifact
      approvalContent = '# Design Approval\n\n';
      if (designInput.approved) {
        approvalContent += '**Decision**: APPROVED\n\n';
        if (designInput.feedback) {
          approvalContent += `**Notes**: ${designInput.feedback}\n\n`;
        }
      } else {
        approvalContent += '**Decision**: CHANGES REQUESTED\n\n';
        approvalContent += `**Feedback**: ${designInput.feedback}\n\n`;
      }

      childToStage = 'Plan';
    } 
    else {
      res.status(400).json({ 
        error: `Node type ${node.toStage} does not support human approval` 
      });
      return;
    }

    // Process the approval
    const result = await processHumanApproval(nodeId, approvalContent, childToStage);

    res.json({ node: result.parentNode });
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('not found')) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('Error processing human approval:', error);
    res.status(500).json({ 
      error: err.message || 'Internal server error' 
    });
  }
});

router.get('/queue', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const claimableOnly = req.query.claimableOnly !== 'false'; // Default to true

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    res.status(400).json({ error: 'Invalid limit parameter' });
    return;
  }

  const heap = getHeap();
  const items = heap.getQueue(limit, claimableOnly);

  res.json({ items });
});

// Human queue - only shows non-claimable nodes (human checkpoints)
router.get('/queue/human', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    res.status(400).json({ error: 'Invalid limit parameter' });
    return;
  }

  const heap = getHeap();
  const items = heap.getQueue(limit, false); // claimableOnly = false shows all
  
  // Filter to only non-claimable items
  const humanItems = items.filter(item => !item.node.claimable);

  res.json({ items: humanItems });
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
  
  // Config change affects entire queue scoring
  getEventBus().emit('queue:updated', heap.getQueue());
  
  res.json({ config: heap.getConfig() });
});

/**
 * Detect orphaned nodes (nodes with children but still unprocessed)
 */
router.get('/cleanup/orphaned-nodes', (req: Request, res: Response) => {
  try {
    const orphanedNodes = detectOrphanedNodes();
    res.json({ orphanedNodes, count: orphanedNodes.length });
  } catch (error) {
    console.error('Error detecting orphaned nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Detect duplicate children (multiple nodes with same parent and stage)
 */
router.get('/cleanup/duplicate-children', (req: Request, res: Response) => {
  try {
    const duplicates = detectDuplicateChildren();
    res.json({ duplicates, count: duplicates.length });
  } catch (error) {
    console.error('Error detecting duplicate children:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Fix orphaned nodes by marking them as processed
 */
router.post('/cleanup/fix-orphaned-nodes', (req: Request, res: Response) => {
  const { nodeIds } = req.body;

  if (!Array.isArray(nodeIds)) {
    res.status(400).json({ error: 'nodeIds must be an array' });
    return;
  }

  try {
    const fixed = fixOrphanedNodes(nodeIds);
    res.json({ fixed, requested: nodeIds.length });
  } catch (error) {
    console.error('Error fixing orphaned nodes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;