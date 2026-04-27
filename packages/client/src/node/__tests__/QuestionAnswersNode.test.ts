import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuestionAnswersNode } from '../QuestionAnswersNode.js';
import { createMockClient, createMockNodeData } from './test-utils.js';
import type { DeterminantClient } from '../../client/index.js';
import type { QuestionAnswersInput } from '@determinant/types';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('QuestionAnswersNode', () => {
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
      toStage: 'QuestionAnswers', 
      claimable: false 
    });
    const node = new QuestionAnswersNode(nodeData, mockClient, { workingDir });
    
    expect(node.claimable).toBe(false);
  });

  it('should throw error when agent tries to call process()', async () => {
    const nodeData = createMockNodeData({ toStage: 'QuestionAnswers', claimable: false });
    const node = new QuestionAnswersNode(nodeData, mockClient, { workingDir });
    
    await expect(node.process()).rejects.toThrow('must be processed by human');
  });

  it('should format artifact with human answers', async () => {
    const questionsContent = `# Research Questions

### Question 1
What is the auth mechanism?

**Answer**: Uses JWT tokens (found in \`src/auth/jwt.ts:23\`)

**Context**: The auth middleware validates tokens on each request.

---

### Question 2
Should we add rate limiting?

**Options**:
- **A: Add rate limiting** (Recommended)
  - Prevents abuse and DDoS attacks
- **B: Skip for now**
  - Simpler initial implementation

**Context**: The API currently has no rate limiting.

---

### Question 3
What database schema exists?`;

    // Setup parent Questions node and write questions.md
    const questionsArtifactPath = join(workingDir, '.determinant', 'artifacts', 'test-task-123', 'questions.md');
    await writeFile(questionsArtifactPath, questionsContent, 'utf-8');

    mockClient.getNode = vi.fn().mockResolvedValue(
      createMockNodeData({
        id: 'questions-node-123',
        toStage: 'Questions',
        content: questionsContent
      })
    );

    const nodeData = createMockNodeData({
      toStage: 'QuestionAnswers',
      taskId: 'test-task-123',
      parentNodeId: 'questions-node-123',
      fromStage: 'Questions',
      claimable: false
    });
    
    const node = new QuestionAnswersNode(nodeData, mockClient, { workingDir });
    
    const input: QuestionAnswersInput = {
      answers: [
        { questionNumber: 1, question: 'What is the auth mechanism?', customAnswer: 'JWT tokens are correct' },
        { questionNumber: 2, question: 'Should we add rate limiting?', selectedOptionId: 'a' },
        { questionNumber: 3, question: 'What database schema exists?', customAnswer: 'SQLite with tasks and nodes tables' },
      ],
    };
    
    const result = await node.processHumanInput(input);
    
    // Verify artifact was created with correct format
    expect(result.artifactPath).toContain('questionanswers.md');
    expect(node.content).toContain('Question 1: What is the auth mechanism?');
    expect(node.content).toContain('**Agent found**: Uses JWT tokens');
    expect(node.content).toContain('**Human decision**: JWT tokens are correct');
    expect(node.content).toContain('Question 2: Should we add rate limiting?');
    expect(node.content).toContain('**A**: Add rate limiting');
    expect(node.content).toContain('✓ **SELECTED**');
    expect(node.content).toContain('Question 3: What database schema exists?');
    expect(node.content).toContain('**Human decision**: SQLite with tasks and nodes tables');
  });

  it('should create ResearchNode as child', async () => {
    const nodeData = createMockNodeData({
      toStage: 'QuestionAnswers',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new QuestionAnswersNode(nodeData, mockClient, { workingDir });
    
    const input: QuestionAnswersInput = {
      answers: [
        { questionNumber: 1, question: 'Q1?', customAnswer: 'Answer to Q1' },
      ],
    };
    
    const result = await node.processHumanInput(input);
    
    expect(result.childNode.toStage).toBe('Research');
    expect(result.childNode.claimable).toBe(true);
    expect(result.childNode.confidenceBefore).toBe(10); // Human input = high confidence
  });

  it('should validate required answer for all questions', async () => {
    const nodeData = createMockNodeData({
      toStage: 'QuestionAnswers',
      taskId: 'test-task-123',
      claimable: false
    });
    
    const node = new QuestionAnswersNode(nodeData, mockClient, { workingDir });
    
    const invalidInput: QuestionAnswersInput = {
      answers: [
        { questionNumber: 1, question: 'Q1?', customAnswer: '' }, // Empty answer!
      ],
    };
    
    await expect(node.processHumanInput(invalidInput)).rejects.toThrow('requires an answer');
  });
});
