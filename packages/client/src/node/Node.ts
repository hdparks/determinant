import { Node as NodeInterface, TaskState, TASK_STATES } from '@determinant/types';
import type { DeterminantClient } from '../client/index.js';
import type { ProcessResult, AgentResult, OpenCodeConfig } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, mkdir } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export abstract class Node implements NodeInterface {
  // Properties from NodeInterface
  public readonly id: string;
  public readonly taskId: string;
  public readonly parentNodeId: string | null;
  public readonly fromStage: TaskState | null;
  public readonly toStage: TaskState;
  public content: string;
  public confidenceBefore: number | null;
  public confidenceAfter: number | null;
  public readonly createdAt: Date;
  
  // Additional properties
  protected readonly client: DeterminantClient;
  protected readonly config: OpenCodeConfig;
  
  constructor(data: NodeInterface, client: DeterminantClient, config: OpenCodeConfig = {}) {
    this.id = data.id;
    this.taskId = data.taskId;
    this.parentNodeId = data.parentNodeId;
    this.fromStage = data.fromStage;
    this.toStage = data.toStage;
    this.content = data.content;
    this.confidenceBefore = data.confidenceBefore;
    this.confidenceAfter = data.confidenceAfter;
    this.createdAt = data.createdAt;
    this.client = client;
    this.config = {
      maxRetries: 3,
      timeout: 120000,
      workingDir: process.cwd(),
      ...config
    };
  }
  
  /**
   * Factory method - returns correct subclass based on toStage
   */
  static create(data: NodeInterface, client: DeterminantClient, config?: OpenCodeConfig): Node {
    // Import subclasses dynamically to avoid circular dependencies
    // We'll use require here since this is a factory pattern
    const { ProposedNode } = require('./ProposedNode');
    const { PlannedNode } = require('./PlannedNode');
    const { ExecutedNode } = require('./ExecutedNode');
    const { VerifiedNode } = require('./VerifiedNode');
    const { ReleasedNode } = require('./ReleasedNode');
    
    switch (data.toStage) {
      case 'Proposed': return new ProposedNode(data, client, config);
      case 'Planned': return new PlannedNode(data, client, config);
      case 'Executed': return new ExecutedNode(data, client, config);
      case 'Verified': return new VerifiedNode(data, client, config);
      case 'Released': return new ReleasedNode(data, client, config);
      default: throw new Error(`Unknown TaskState: ${data.toStage}`);
    }
  }
  
  /**
   * Abstract method - each subclass implements stage-specific processing
   */
  abstract process(): Promise<ProcessResult>;
  
  /**
   * Save this node to the server (create or update)
   */
  async save(): Promise<void> {
    // Simple heuristic: if createdAt is more than 1 second old, it's an update
    const isUpdate = this.createdAt && new Date().getTime() - this.createdAt.getTime() > 1000;
    
    if (isUpdate) {
      // Node exists, update it
      const updated = await this.client.updateNode(this.id, {
        content: this.content,
        confidenceBefore: this.confidenceBefore,
        confidenceAfter: this.confidenceAfter
      });
      this.content = updated.content;
      this.confidenceBefore = updated.confidenceBefore;
      this.confidenceAfter = updated.confidenceAfter;
    } else {
      // New node, create it
      const created = await this.client.createNode({
        taskId: this.taskId,
        parentNodeId: this.parentNodeId,
        fromStage: this.fromStage,
        toStage: this.toStage,
        content: this.content,
        confidenceBefore: this.confidenceBefore,
        confidenceAfter: this.confidenceAfter
      });
      // Update with server-generated values
      Object.assign(this, created);
    }
  }
  
  /**
   * Protected helper - calls OpenCode agent with prompt and parses JSON response
   * Implements Ralph Loop for retries
   */
  protected async generateContent(prompt: string): Promise<AgentResult> {
    const { maxRetries, timeout, workingDir, model } = this.config;
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries!; attempt++) {
      try {
        // Build OpenCode command
        const modelFlag = model ? `--model ${model}` : '';
        // Escape the prompt for shell
        const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
        const command = `opencode run --format json --dangerously-skip-permissions ${modelFlag} "${escapedPrompt}"`;
        
        // Execute OpenCode
        const { stdout, stderr } = await execAsync(command, {
          cwd: workingDir,
          timeout,
          maxBuffer: 10 * 1024 * 1024 // 10MB
        });
        
        // Parse JSON events from stdout
        const lines = stdout.split('\n').filter(line => line.trim());
        const textParts: string[] = [];
        
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            if (event.type === 'text' && event.part?.text) {
              textParts.push(event.part.text);
            }
          } catch (e) {
            // Skip non-JSON lines
          }
        }
        
        // Combine text parts and parse as AgentResult
        const resultText = textParts.join('');
        const result = JSON.parse(resultText) as AgentResult;
        
        // Validate required fields
        if (!result.filePath) {
          throw new Error('AgentResult missing required field: filePath');
        }
        
        // Set defaults for optional fields
        result.confidenceBefore = result.confidenceBefore ?? 5;
        result.confidenceAfter = result.confidenceAfter ?? 5;
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.error(`OpenCode attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt < maxRetries!) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // All retries exhausted
    throw new Error(
      `Failed to generate content after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }
  
  /**
   * Protected helper - determines next stage in progression
   */
  protected getNextStage(): TaskState | null {
    const currentIndex = TASK_STATES.indexOf(this.toStage);
    if (currentIndex === -1 || currentIndex === TASK_STATES.length - 1) {
      return null; // Invalid or final stage
    }
    return TASK_STATES[currentIndex + 1];
  }
  
  /**
   * Protected helper - creates child node data structure
   */
  protected createChildNodeData(content: string, confidenceBefore: number, confidenceAfter: number): NodeInterface {
    const nextStage = this.getNextStage();
    if (!nextStage) {
      throw new Error(`Cannot create child node from final stage: ${this.toStage}`);
    }
    
    return {
      id: this.generateId(),
      taskId: this.taskId,
      parentNodeId: this.id,
      fromStage: this.toStage,
      toStage: nextStage,
      content,
      confidenceBefore,
      confidenceAfter,
      createdAt: new Date()
    };
  }
  
  /**
   * Protected helper - generates unique ID for new nodes
   */
  protected generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Protected helper - gets artifact file path for a node
   */
  protected getArtifactPath(nodeId: string): string {
    return join(this.config.workingDir!, '.determinant', 'artifacts', this.taskId, `${nodeId}.md`);
  }
  
  /**
   * Protected helper - ensures artifact directory exists
   */
  protected async ensureArtifactDir(): Promise<void> {
    const artifactDir = join(this.config.workingDir!, '.determinant', 'artifacts', this.taskId);
    await mkdir(artifactDir, { recursive: true });
  }
}
