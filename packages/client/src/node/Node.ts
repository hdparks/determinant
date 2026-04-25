import { Node as NodeInterface, TaskState, TASK_STATES } from '@determinant/types';
import type { DeterminantClient } from '../client/index.js';
import type { ProcessResult, AgentResult, OpenCodeConfig } from './types.js';
import { spawn } from 'child_process';
import { readFile, mkdir, access, constants } from 'fs/promises';
import { join } from 'path';

/**
 * Abstract base class for task stage processing nodes.
 * 
 * Each node represents a state transition in the task pipeline
 * (e.g., Questions → Research → Plan → Implement → Validate → Released).
 * 
 * ## Incremental Artifact Building
 * 
 * Nodes instruct OpenCode agents to build markdown artifacts incrementally:
 * - Agents write content continuously as they work, not all at the end
 * - Progress is preserved at deterministic paths if interrupted
 * - Retries detect existing artifacts and continue from partial work
 * - This improves resilience to timeouts and crashes
 * 
 * Artifact paths follow the pattern:
 * `.determinant/artifacts/{taskId}/{stage}.md`
 * 
 * The same path is used across retries, enabling crash recovery.
 */
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
  public readonly processedAt: Date | null;
  
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
    // Ensure dates are Date objects (API returns ISO strings)
    this.createdAt = data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt);
    this.processedAt = data.processedAt ? (data.processedAt instanceof Date ? data.processedAt : new Date(data.processedAt)) : null;
    this.client = client;
    this.config = {
      maxRetries: 3,
      timeout: 600000,
      workingDir: process.cwd(),
      verbose: true,
      ...config
    };
  }
  
  /**
   * Factory method - returns correct subclass based on toStage
   */
  static async create(data: NodeInterface, client: DeterminantClient, config?: OpenCodeConfig): Promise<Node> {
    // Import subclasses dynamically to avoid circular dependencies
    // Using dynamic import() since we're in an ES module
    switch (data.toStage) {
      case 'Proposal': {
        const { ProposalNode } = await import('./ProposalNode.js');
        return new ProposalNode(data, client, config);
      }
      case 'Questions': {
        const { QuestionsNode } = await import('./QuestionsNode.js');
        return new QuestionsNode(data, client, config);
      }
      case 'Research': {
        const { ResearchNode } = await import('./ResearchNode.js');
        return new ResearchNode(data, client, config);
      }
      case 'Plan': {
        const { PlanNode } = await import('./PlanNode.js');
        return new PlanNode(data, client, config);
      }
      case 'Implement': {
        const { ImplementNode } = await import('./ImplementNode.js');
        return new ImplementNode(data, client, config);
      }
      case 'Validate': {
        const { ValidateNode } = await import('./ValidateNode.js');
        return new ValidateNode(data, client, config);
      }
      case 'Released': {
        const { ReleasedNode } = await import('./ReleasedNode.js');
        return new ReleasedNode(data, client, config);
      }
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
        confidenceAfter: this.confidenceAfter,
        processedAt: this.processedAt
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
    const { maxRetries, timeout, workingDir, model, variant, verbose } = this.config;
    
    if (verbose) {
      console.log(`\n🤖 Calling OpenCode for ${this.toStage} node...`);
      const promptPreview = prompt.length > 200 ? prompt.substring(0, 200) + '...' : prompt;
      console.log(`   Prompt: ${promptPreview.replace(/\n/g, ' ')}`);
    }
    
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries!; attempt++) {
      try {
        // Build OpenCode command args
        const args: string[] = [
          'run',
          '--format', 'json',
          '--dangerously-skip-permissions'
        ];
        
        if (model) args.push('--model', model);
        if (variant) {
          args.push('--variant', variant);
        }
        if (verbose) {
          args.push('--thinking');
        }
        args.push(prompt);
        
        if (verbose && attempt > 1) {
          console.log(`   ⚠️  Retry attempt ${attempt}/${maxRetries}...`);
        }
        
        // Execute OpenCode with real-time streaming
        if (verbose) {
          console.log(`   ⏳ Executing OpenCode (timeout: ${timeout! / 1000}s)...`);
        } else {
          // Show spinner in non-verbose mode
          process.stdout.write('   ⏳ Processing');
        }
        
        const child = spawn('opencode', args, { 
          cwd: workingDir,
          stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
        });
        
        const textParts: string[] = [];
        let stdoutBuffer = '';
        let stderrBuffer = '';
        let spinnerInterval: NodeJS.Timeout | null = null;
        
        // Spinner for non-verbose mode
        if (!verbose) {
          let dots = 0;
          spinnerInterval = setInterval(() => {
            dots = (dots + 1) % 4;
            process.stdout.write(`\r   ⏳ Processing${'.'.repeat(dots)}   `);
          }, 500);
        }
        
        // Process stdout line by line in real-time
        child.stdout.on('data', (chunk: Buffer) => {
          stdoutBuffer += chunk.toString();
          const lines = stdoutBuffer.split('\n');
          
          // Keep last incomplete line in buffer
          stdoutBuffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const event = JSON.parse(line);
              
              // Display reasoning in real-time
              if (event.type === 'reasoning' && event.part?.text) {
                if (verbose) {
                  console.log(`\n   💭 Thinking...`);
                  event.part.text.split('\n').forEach((line: string) => {
                    console.log(`      ${line}`);
                  });
                  
                  if (event.part.time) {
                    const duration = ((event.part.time.end - event.part.time.start) / 1000).toFixed(2);
                    console.log(`   ⏱️  Thinking took ${duration}s\n`);
                  }
                }
              }
              
              // Display text in real-time
              if (event.type === 'text' && event.part?.text) {
                if (verbose) {
                  console.log(`\n   📝 Response...`);
                  event.part.text.split('\n').forEach((line: string) => {
                    console.log(`      ${line}`);
                  });
                }
                textParts.push(event.part.text);
              }
            } catch (e) {
              // Skip non-JSON lines
            }
          }
        });
        
        // Display stderr in real-time
        child.stderr.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stderrBuffer += text;
          if (verbose) {
            process.stderr.write(text);
          }
        });
        
        // Wait for process to complete
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            child.kill();
            if (spinnerInterval) clearInterval(spinnerInterval);
            reject(new Error(`OpenCode timed out after ${timeout! / 1000}s`));
          }, timeout);

          child.on('close', (code) => {
            clearTimeout(timer);
            if (spinnerInterval) {
              clearInterval(spinnerInterval);
              if (!verbose) process.stdout.write('\r'); // Clear spinner line
            }
            
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`OpenCode exited with code ${code}${stderrBuffer ? `\nStderr: ${stderrBuffer}` : ''}`));
            }
          });

          child.on('error', (err) => {
            clearTimeout(timer);
            if (spinnerInterval) clearInterval(spinnerInterval);
            reject(err);
          });
        });
        
        // Process any remaining buffer
        if (stdoutBuffer.trim()) {
          try {
            const event = JSON.parse(stdoutBuffer);
            if (event.type === 'text' && event.part?.text) {
              textParts.push(event.part.text);
            }
          } catch (e) {
            // Ignore
          }
        }
        
        // Combine text parts and parse as AgentResult
        const resultText = textParts.join('');
        
        // Extract JSON from markdown code fence
        const jsonMatch = resultText.match(/```json\s*\n([\s\S]*?)\n```/);
        if (!jsonMatch) {
          throw new Error('No JSON code block found in OpenCode response');
        }
        
        const result = JSON.parse(jsonMatch[1]) as AgentResult;
        
        // Validate required fields
        if (!result.filePath) {
          throw new Error('AgentResult missing required field: filePath');
        }
        
        // Set defaults for optional fields
        result.confidenceBefore = result.confidenceBefore ?? 5;
        result.confidenceAfter = result.confidenceAfter ?? 5;
        
        if (verbose) {
          console.log(`   ✅ OpenCode completed successfully`);
          console.log(`   📄 Artifact: ${result.filePath}`);
          console.log(`   📊 Confidence: ${result.confidenceBefore} → ${result.confidenceAfter}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        if (verbose) {
          console.error(`   ❌ Attempt ${attempt}/${maxRetries} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        if (attempt < maxRetries!) {
          // Wait before retry (exponential backoff)
          const waitTime = 1000 * attempt;
          if (verbose) {
            console.log(`   ⏸️  Waiting ${waitTime / 1000}s before retry...`);
          }
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All retries exhausted
    throw new Error(
      `Failed to generate content after ${maxRetries} attempts. Last error: ${lastError?.message}`
    );
  }
  
  /**
   * Protected helper - finds a specific ancestor node by stage
   */
  protected async getAncestorByStage(stage: TaskState): Promise<Node | null> {
    let currentParentId = this.parentNodeId;
    const visited: string[] = [];
    
    while (currentParentId) {
      visited.push(currentParentId);
      
      try {
        const parentNode = await this.client.getNode(currentParentId);
        if (parentNode.toStage === stage) {
          return await Node.create(parentNode, this.client, this.config);
        }
        currentParentId = parentNode.parentNodeId;
      } catch (error) {
        throw new Error(
          `Failed to fetch parent node ${currentParentId} while looking for ${stage} ancestor. ` +
          `Current node: ${this.id} (${this.toStage}), visited chain: ${visited.join(' → ')}`
        );
      }
    }
    
    return null;
  }
  
  /**
   * Protected helper - reads content from ancestor node's artifact
   */
  protected async getAncestorContent(stage: TaskState): Promise<string> {
    const ancestor = await this.getAncestorByStage(stage);
    if (!ancestor) {
      throw new Error(
        `Could not find ancestor node with stage: ${stage}. ` +
        `Current node: ${this.id} (${this.toStage}), parent: ${this.parentNodeId || 'none'}`
      );
    }
    return ancestor.content;
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
      createdAt: new Date(),
      processedAt: null
    };
  }
  
  /**
   * Protected helper - generates unique ID for new nodes
   */
  protected generateId(): string {
    return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Protected helper - gets artifact file path for a child node
   * 
   * This method is deterministic and idempotent:
   * - Same nodeId always returns the same path (for this node instance)
   * - Path uniqueness is guaranteed by unique node IDs
   * - Path format: {workingDir}/.determinant/artifacts/{taskId}/{nodeId}.md
   * 
   * Usage Pattern:
   * - Parent nodes call this to get artifact path for children they will create
   * - Child ID is generated via generateId() before calling this method
   * - Agent writes artifact to this path during processing
   * - Child node is created with artifact content after agent completes
   * 
   * @param nodeId - Unique identifier for the child node (from generateId())
   * @returns Absolute path to artifact file (always .md extension)
   * @throws Error if workingDir or taskId not configured, or nodeId is empty
   * 
   * @example
   * ```typescript
   * const childId = this.generateId();
   * const artifactPath = this.getArtifactPath(childId);
   * // artifactPath: /path/to/project/.determinant/artifacts/task123/node_1234567890_abc123def.md
   * ```
   */
  protected getArtifactPath(nodeId: string): string {
    if (!this.config.workingDir) {
      throw new Error('workingDir is not configured');
    }
    if (!this.taskId) {
      throw new Error('taskId is not set');
    }
    if (!nodeId || nodeId.trim() === '') {
      throw new Error('nodeId cannot be empty');
    }
    return join(this.config.workingDir, '.determinant', 'artifacts', this.taskId, `${nodeId}.md`);
  }
  
  /**
   * Get deterministic artifact path based on stage type.
   * 
   * This method provides a predictable, stage-based path that enables:
   * - Crash recovery: Agents can resume partial work on retry
   * - Overwrite behavior: Repair cycles overwrite previous attempts
   * - Debugging: Predictable paths like "research.md", "plan.md"
   * 
   * Format: {workingDir}/.determinant/artifacts/{taskId}/{stage}.md
   * 
   * Examples:
   * - Research node → .determinant/artifacts/task123/research.md
   * - Plan node → .determinant/artifacts/task123/plan.md (overwrites on repair)
   * 
   * @returns Absolute path to stage-specific artifact file
   * @throws Error if workingDir or taskId not configured
   */
  protected getStageArtifactPath(): string {
    if (!this.config.workingDir) {
      throw new Error('workingDir is not configured');
    }
    if (!this.taskId) {
      throw new Error('taskId is not set');
    }
    
    const stageName = this.toStage.toLowerCase();
    return join(
      this.config.workingDir,
      '.determinant',
      'artifacts',
      this.taskId,
      `${stageName}.md`
    );
  }
  
  /**
   * Get relative path to an artifact from the current task's artifact directory
   */
  protected getRelativeArtifactPath(nodeId: string): string {
    return `./${nodeId}.md`;
  }

  /**
   * Check if an artifact file exists on disk
   */
  protected async artifactExists(nodeId: string): Promise<boolean> {
    try {
      const artifactPath = this.getArtifactPath(nodeId);
      await access(artifactPath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract first N lines from content as a summary
   */
  protected extractSummary(content: string, maxLines: number = 50): string {
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return content;
    }
    return lines.slice(0, maxLines).join('\n') + '\n\n*[Summary truncated - see full document for complete details]*';
  }

  /**
   * Get descriptive link text for a node based on its stage and content
   */
  protected getLinkText(node: Node): string {
    const stage = node.toStage;
    
    // Try to extract title from first markdown heading
    const lines = node.content.split('\n');
    const titleLine = lines.find(line => line.startsWith('# '));
    
    if (titleLine) {
      const title = titleLine.replace(/^#\s+/, '').trim();
      return `${stage}: ${title}`;
    }
    
    return `${stage} Document`;
  }

  /**
   * Create a markdown link to an artifact with optional metadata
   */
  protected async createArtifactLink(targetNode: Node, includeMetadata: boolean = true): Promise<string> {
    const relativePath = this.getRelativeArtifactPath(targetNode.id);
    const linkText = this.getLinkText(targetNode);
    const exists = await this.artifactExists(targetNode.id);
    
    if (!exists) {
      console.warn(`⚠️  Artifact not found for node ${targetNode.id}, link may be broken`);
    }
    
    let result = `[${linkText}](${relativePath})`;
    
    if (includeMetadata) {
      const confidence = targetNode.confidenceAfter !== null 
        ? `${targetNode.confidenceBefore} → ${targetNode.confidenceAfter}`
        : 'N/A';
      
      result = `**Path**: ${result}  
**Stage**: ${targetNode.toStage}  
**Confidence**: ${confidence}`;
    }
    
    return result;
  }

  /**
   * Read artifact from disk with fallback to database content
   */
  protected async readArtifactWithFallback(nodeId: string): Promise<string> {
    const artifactPath = this.getArtifactPath(nodeId);
    
    try {
      return await readFile(artifactPath, 'utf-8');
    } catch (error: any) {
      console.warn(`⚠️  Artifact file not accessible for ${nodeId} (${error.code}), attempting database fallback`);
      
      // Try to get from database
      try {
        const node = await this.client.getNode(nodeId);
        if (node.content) {
          console.warn(`✓ Using database content for ${nodeId}`);
          return node.content;
        }
      } catch (dbError) {
        console.error(`❌ Database fallback failed for ${nodeId}`);
      }
      
      throw new Error(`Artifact and database content both unavailable for node ${nodeId}`);
    }
  }
  
  /**
   * Protected helper - ensures artifact directory exists
   */
  protected async ensureArtifactDir(): Promise<void> {
    const artifactDir = join(this.config.workingDir!, '.determinant', 'artifacts', this.taskId);
    await mkdir(artifactDir, { recursive: true });
  }
}
