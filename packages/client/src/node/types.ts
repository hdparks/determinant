import type { Node as NodeInterface } from '@determinant/types';
import type { DeterminantClient } from '../client/index.js';
import type { Node as NodeClass } from './Node.js';

/**
 * Result from OpenCode agent processing
 * All stages return similar structure with path to generated markdown
 */
export interface AgentResult {
  filePath: string;              // Path to generated markdown file
  confidenceBefore?: number;     // 1-10, optional (defaults to 5)
  confidenceAfter?: number;      // 1-10, optional (defaults to 5)
  status?: 'success' | 'failure'; // Only used by ValidateNode
}

/**
 * Result from Node.process() containing fully constructed child node
 */
export interface ProcessResult {
  childNode: NodeClass;          // Ready to save
  artifactPath: string;          // Where the markdown was created
}

/**
 * Configuration for OpenCode agent execution
 */
export interface OpenCodeConfig {
  maxRetries?: number;           // Default: 3 (Ralph Loop)
  timeout?: number;              // Default: 120000ms
  model?: string;                // Optional model override
  variant?: string;              // Model variant (e.g., 'high', 'max') for extended thinking
  workingDir?: string;           // Default: process.cwd()
  verbose?: boolean;             // Default: true (show detailed logs)
}

// Re-export for convenience
export type { NodeInterface, DeterminantClient, NodeClass };
