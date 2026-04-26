import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DesignApprovalNode } from '../DesignApprovalNode.js';
import { createMockClient, createMockNodeData } from './test-utils.js';
import type { DeterminantClient } from '../../client/index.js';
import type { DesignApprovalInput } from '@determinant/types';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DesignApprovalNode', () => {
  let mockClient: DeterminantClient;
  let workingDir: string;

  beforeEach(async () => {
    mockClient = createMockClient();
    
    // Create a temporary working directory for tests
    workingDir = join(tmpdir(), `determinant-test-${Date.now()}`);
    await mkdir(join(workingDir, '.determinant', 'artifacts', 'test-task-123'), { recursive: true });
  });

  it('should NOT be claimable by agents', () => {
    const nodeData = createMockNodeData({ 
      toStage: 'DesignApproval', 
      claimable: false 
    });
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    expect(node.claimable).toBe(false);
  });

  it('should throw error when agent tries to call process()', async () => {
    const nodeData = createMockNodeData({ toStage: 'DesignApproval', claimable: false });
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    await expect(node.process()).rejects.toThrow('must be processed by human');
  });

  it('should create PlanNode when design approved', async () => {
    const designContent = `# Technical Design

## Overview
Design document here

## Architecture
Component A → Component B`;

    // Setup parent Design node
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'design-node-123',
        toStage: 'Design',
        content: designContent
      })
    );

    const nodeData = createMockNodeData({
      toStage: 'DesignApproval',
      taskId: 'test-task-123',
      parentNodeId: 'design-node-123',
      fromStage: 'Design',
      claimable: false
    });
    
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    const input: DesignApprovalInput = {
      approved: true
    };
    
    const result = await node.processHumanInput(input);
    
    expect(result.childNode.toStage).toBe('Plan');
    expect(result.childNode.claimable).toBe(true);
    expect(result.childNode.confidenceBefore).toBe(10); // Human approved = high confidence
    expect(node.content).toContain('APPROVED');
  });

  it('should create DesignNode when feedback provided', async () => {
    const nodeData = createMockNodeData({
      toStage: 'DesignApproval',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    const input: DesignApprovalInput = {
      approved: false,
      feedback: 'Please add error handling section'
    };
    
    const result = await node.processHumanInput(input);
    
    expect(result.childNode.toStage).toBe('Design'); // Loop back!
    expect(result.childNode.claimable).toBe(true);
    expect(result.childNode.confidenceBefore).toBe(5); // Needs revision = medium confidence
    expect(node.content).toContain('NEEDS_REVISION');
    expect(node.content).toContain('error handling');
  });

  it('should throw error when feedback missing and not approved', async () => {
    const nodeData = createMockNodeData({
      toStage: 'DesignApproval',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    const invalidInput: DesignApprovalInput = {
      approved: false
      // Missing feedback!
    };
    
    await expect(node.processHumanInput(invalidInput)).rejects.toThrow('Feedback is required');
  });

  it('should include design content in approval artifact', async () => {
    const designContent = '# Technical Design\n\nDesign details here';
    
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'design-node-456',
        toStage: 'Design',
        content: designContent
      })
    );

    const nodeData = createMockNodeData({
      toStage: 'DesignApproval',
      taskId: 'test-task-123',
      parentNodeId: 'design-node-456',
      claimable: false
    });
    
    const node = new DesignApprovalNode(nodeData, mockClient, { workingDir });
    
    const input: DesignApprovalInput = {
      approved: true
    };
    
    await node.processHumanInput(input);
    
    // Verify content includes artifact reference (not embedded content)
    expect(node.content).toContain('Design artifact:');
    expect(node.content).toContain('design.md');
    expect(node.content).toContain('APPROVED');
  });
});
