import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DesignNode } from '../DesignNode.js';
import { createMockClient, createMockNodeData } from './test-utils.js';
import { MOCK_LLM_RESPONSES } from './fixtures.js';
import type { DeterminantClient } from '../../client/index.js';
import { readFile, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('DesignNode', () => {
  let mockClient: DeterminantClient;
  let workingDir: string;

  beforeEach(async () => {
    mockClient = createMockClient();
    
    // Create a temporary working directory for tests
    workingDir = join(tmpdir(), `determinant-test-${Date.now()}`);
    await mkdir(join(workingDir, '.determinant', 'artifacts', 'test-task-123'), { recursive: true });
  });

  it('should be claimable by agents', () => {
    const nodeData = createMockNodeData({ toStage: 'Design', claimable: true });
    const node = new DesignNode(nodeData, mockClient, { workingDir });
    
    expect(node.claimable).toBe(true);
  });

  it('should use correct toStage', () => {
    const nodeData = createMockNodeData({ toStage: 'Design' });
    const node = new DesignNode(nodeData, mockClient, { workingDir });
    
    expect(node.toStage).toBe('Design');
  });

  it('should create DesignApprovalNode as child', async () => {
    // Setup parent node as Research
    const researchContent = '# Research Findings\n\nResearch content here';
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'research-node-123',
        toStage: 'Research',
        content: researchContent,
        parentNodeId: null
      })
    );
    
    const nodeData = createMockNodeData({
      toStage: 'Design',
      taskId: 'test-task-123',
      parentNodeId: 'research-node-123',
      fromStage: 'Research'
    });
    
    const node = new DesignNode(nodeData, mockClient, { 
      workingDir,
      maxRetries: 1
    });
    
    // Mock the generateContent method to simulate agent response
    const artifactPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'design.md');
    vi.spyOn(node as any, 'generateContent').mockResolvedValue({
      filePath: artifactPath,
      confidenceBefore: 7,
      confidenceAfter: 8
    });
    
    // Pre-create the artifact file to simulate agent writing it
    await writeFile(artifactPath, MOCK_LLM_RESPONSES.Design);
    
    const result = await node.process();
    
    expect(result.childNode.toStage).toBe('DesignApproval');
    expect(result.childNode.claimable).toBe(false); // Design approval is human checkpoint
  });

  it('should read Research artifact from parent', async () => {
    // Setup: Create a mock Research artifact
    const researchContent = '# Research Findings\n\nDetailed research here';
    const researchPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'research.md');
    await writeFile(researchPath, researchContent);
    
    // Setup parent node as Research stage
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'parent-node-123',
        toStage: 'Research',
        content: researchContent
      })
    );
    
    const nodeData = createMockNodeData({
      toStage: 'Design',
      taskId: 'test-task-123',
      parentNodeId: 'parent-node-123',
      fromStage: 'Research'
    });
    
    const node = new DesignNode(nodeData, mockClient, { 
      workingDir,
      maxRetries: 1
    });
    
    // Mock generateContent and capture the prompt
    let capturedPrompt = '';
    const artifactPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'design.md');
    vi.spyOn(node as any, 'generateContent').mockImplementation(async (prompt: any) => {
      capturedPrompt = String(prompt);
      return {
        filePath: artifactPath,
        confidenceBefore: 7,
        confidenceAfter: 8
      };
    });
    
    await writeFile(artifactPath, MOCK_LLM_RESPONSES.Design);
    
    await node.process();
    
    // Verify the prompt includes artifact path references (not embedded content)
    expect(capturedPrompt).toContain('RESEARCH ARTIFACT');
    expect(capturedPrompt).toContain('research.md');
    expect(capturedPrompt).toContain('PROPOSAL ARTIFACT');
    expect(capturedPrompt).toContain('proposal.md');
  });

  it('should handle design revision with feedback', async () => {
    // Setup: Create previous design and feedback artifacts
    const previousDesign = '# Technical Design\n\nOriginal design here';
    const feedbackContent = '# Design Feedback\n\n**Status**: NEEDS_REVISION\n\n## Human Feedback\n\nPlease add error handling section';
    
    const designPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'design.md');
    await writeFile(designPath, previousDesign);
    
    // Setup parent as DesignApproval with feedback
    const feedbackNodeData = createMockNodeData({
      id: 'feedback-node-123',
      toStage: 'DesignApproval',
      content: feedbackContent,
      parentNodeId: 'original-design-node',
      claimable: false
    });
    
    // Setup grandparent as original Design
    const originalDesignNodeData = createMockNodeData({
      id: 'original-design-node',
      toStage: 'Design',
      content: previousDesign,
      parentNodeId: 'research-node-789',
      claimable: true
    });
    
    // Mock getNode to return feedback parent and then original design
    let callCount = 0;
    mockClient.getNode = vi.fn().mockImplementation((nodeId: string) => {
      callCount++;
      if (nodeId === 'feedback-node-123') {
        return Promise.resolve(feedbackNodeData);
      } else if (nodeId === 'original-design-node') {
        return Promise.resolve(originalDesignNodeData);
      }
      return Promise.reject(new Error(`Unknown node: ${nodeId}`));
    });
    
    const nodeData = createMockNodeData({
      toStage: 'Design',
      taskId: 'test-task-123',
      parentNodeId: 'feedback-node-123',
      fromStage: 'DesignApproval'
    });
    
    const node = new DesignNode(nodeData, mockClient, { 
      workingDir,
      maxRetries: 1
    });
    
    // Mock generateContent and capture prompt
    let capturedPrompt = '';
    const newDesignPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'design.md');
    vi.spyOn(node as any, 'generateContent').mockImplementation(async (prompt: any) => {
      capturedPrompt = String(prompt);
      return {
        filePath: newDesignPath,
        confidenceBefore: 5,
        confidenceAfter: 8
      };
    });
    
    await writeFile(newDesignPath, '# Technical Design (Revised)\n\nRevised design with error handling');
    
    await node.process();
    
    // Verify prompt includes artifact path references for revision flow
    expect(capturedPrompt).toContain('REVISING');
    expect(capturedPrompt).toContain('DESIGN ARTIFACT');
    expect(capturedPrompt).toContain('design.md');
    expect(capturedPrompt).toContain('FEEDBACK ARTIFACT');
    expect(capturedPrompt).toContain('designapproval.md');
  });

  it('should use stage-based artifact path', async () => {
    // Setup parent node as Research
    const researchContent = '# Research Findings\n\nDetailed research here';
    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'research-node-456',
        toStage: 'Research',
        content: researchContent,
        parentNodeId: null
      })
    );
    
    const nodeData = createMockNodeData({
      toStage: 'Design',
      taskId: 'test-task-123',
      parentNodeId: 'research-node-456',
      fromStage: 'Research'
    });
    
    const node = new DesignNode(nodeData, mockClient, { workingDir });
    
    const artifactPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'design.md');
    
    // Mock generateContent
    vi.spyOn(node as any, 'generateContent').mockResolvedValue({
      filePath: artifactPath,
      confidenceBefore: 7,
      confidenceAfter: 8
    });
    
    await writeFile(artifactPath, MOCK_LLM_RESPONSES.Design);
    
    const result = await node.process();
    
    expect(result.artifactPath).toBe(artifactPath);
  });
});
