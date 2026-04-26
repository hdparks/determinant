import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionsApprovalNode } from '../QuestionsApprovalNode.js';
import { createMockClient, createMockNodeData } from './test-utils.js';
import type { DeterminantClient } from '../../client/index.js';
import type { QuestionsApprovalInput } from '@determinant/types';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('QuestionsApprovalNode', () => {
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
      toStage: 'QuestionsApproval', 
      claimable: false 
    });
    const node = new QuestionsApprovalNode(nodeData, mockClient, { workingDir });
    
    expect(node.claimable).toBe(false);
  });

  it('should throw error when agent tries to call process()', async () => {
    const nodeData = createMockNodeData({ toStage: 'QuestionsApproval', claimable: false });
    const node = new QuestionsApprovalNode(nodeData, mockClient, { workingDir });
    
    await expect(node.process()).rejects.toThrow('must be processed by human');
  });

  it('should format artifact with human decisions', async () => {
    const questionsContent = `# Research Questions

1. What is the auth mechanism?
2. How are errors handled?
3. What database schema exists?`;

    // Setup parent Questions node
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'questions-node-123',
        toStage: 'Questions',
        content: questionsContent
      })
    );

    const nodeData = createMockNodeData({
      toStage: 'QuestionsApproval',
      taskId: 'test-task-123',
      parentNodeId: 'questions-node-123',
      fromStage: 'Questions',
      claimable: false
    });
    
    const node = new QuestionsApprovalNode(nodeData, mockClient, { workingDir });
    
    const input: QuestionsApprovalInput = {
      questions: [
        { question: 'What is the auth mechanism?', decision: 'discard' },
        { question: 'How are errors handled?', decision: 'answer', answer: 'Using try-catch blocks' },
        { question: 'What database schema exists?', decision: 'research' },
      ],
    };
    
    const result = await node.processHumanInput(input);
    
    // Verify artifact was created with correct markers
    expect(result.artifactPath).toContain('questionsapproval.md');
    expect(node.content).toContain('[DISCARD]');
    expect(node.content).toContain('[ANSWERED]');
    expect(node.content).toContain('[RESEARCH]');
    expect(node.content).toContain('try-catch blocks');
  });

  it('should create ResearchNode as child', async () => {
    const nodeData = createMockNodeData({
      toStage: 'QuestionsApproval',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new QuestionsApprovalNode(nodeData, mockClient, { workingDir });
    
    const input: QuestionsApprovalInput = {
      questions: [
        { question: 'Q1?', decision: 'research' },
      ],
    };
    
    const result = await node.processHumanInput(input);
    
    expect(result.childNode.toStage).toBe('Research');
    expect(result.childNode.claimable).toBe(true);
    expect(result.childNode.confidenceBefore).toBe(10); // Human input = high confidence
  });

  it('should validate required answer when decision is "answer"', async () => {
    const nodeData = createMockNodeData({
      toStage: 'QuestionsApproval',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new QuestionsApprovalNode(nodeData, mockClient, { workingDir });
    
    const invalidInput: QuestionsApprovalInput = {
      questions: [
        { question: 'Q1?', decision: 'answer' }, // Missing answer!
      ],
    };
    
    await expect(node.processHumanInput(invalidInput)).rejects.toThrow('answer is required');
  });
});
