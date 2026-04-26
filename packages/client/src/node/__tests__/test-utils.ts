import { vi } from 'vitest';
import type { Node as NodeInterface } from '@determinant/types';
import type { DeterminantClient } from '../../client/index.js';

/**
 * Creates mock DeterminantClient
 */
export function createMockClient(): any {
  return {
    getNode: vi.fn(),
    createNode: vi.fn(),
    updateNode: vi.fn(),
    getTask: vi.fn(),
    updateTask: vi.fn(),
    getTasks: vi.fn(),
    deleteTask: vi.fn(),
    createTask: vi.fn(),
  };
}

/**
 * Creates mock node data
 */
export function createMockNodeData(overrides?: Partial<NodeInterface>): NodeInterface {
  return {
    id: 'test-node-123',
    taskId: 'test-task-123',
    parentNodeId: null,
    fromStage: null,
    toStage: 'Proposal',
    content: '# Test Content',
    confidenceBefore: null,
    confidenceAfter: null,
    createdAt: new Date(),
    processedAt: null,
    claimable: true,  // Default to claimable for agent nodes
    ...overrides,
  };
}

/**
 * Mocks generateContent for LLM calls
 * 
 * Note: This is a helper for future implementation when we add LLM mocking capabilities
 */
export function mockGenerateContent(responses: Record<string, string>) {
  // This will be implemented when we add LLM integration to nodes
  // For now, it's a placeholder for the test infrastructure
  return vi.fn().mockImplementation(async function(this: any) {
    const nodeType = this?.toStage || 'Proposal';
    return {
      content: responses[nodeType] || '# Mock Response',
      confidence: 8,
    };
  });
}
