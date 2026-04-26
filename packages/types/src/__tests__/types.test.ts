import { describe, it, expect } from 'vitest';
import { TASK_STATES } from '../index.js';
import type { TaskState, Node, QuestionsApprovalInput, DesignApprovalInput } from '../index.js';

describe('TaskState', () => {
  it('should include all 10 workflow stages', () => {
    expect(TASK_STATES).toHaveLength(10);
  });

  it('should include QuestionsApproval state', () => {
    expect(TASK_STATES).toContain('QuestionsApproval');
  });

  it('should include Design state', () => {
    expect(TASK_STATES).toContain('Design');
  });

  it('should include DesignApproval state', () => {
    expect(TASK_STATES).toContain('DesignApproval');
  });

  it('should maintain correct order', () => {
    const expected: TaskState[] = [
      'Proposal',
      'Questions',
      'QuestionsApproval',
      'Research',
      'Design',
      'DesignApproval',
      'Plan',
      'Implement',
      'Validate',
      'Released',
    ];
    expect(TASK_STATES).toEqual(expected);
  });
});

describe('Node interface', () => {
  it('should require claimable property', () => {
    const node: Node = {
      id: 'test-1',
      taskId: 'task-1',
      parentNodeId: null,
      fromStage: null,
      toStage: 'Proposal',
      content: 'test',
      confidenceBefore: 5,
      confidenceAfter: null,
      createdAt: new Date(),
      processedAt: null,
      claimable: true, // NEW - should be required
    };
    
    expect(node.claimable).toBeDefined();
  });
});

describe('QuestionsApprovalInput', () => {
  it('should validate decision types', () => {
    const input: QuestionsApprovalInput = {
      questions: [
        { question: 'Q1?', decision: 'discard' },
        { question: 'Q2?', decision: 'answer', answer: 'A2' },
        { question: 'Q3?', decision: 'research' },
      ],
    };
    
    expect(input.questions).toHaveLength(3);
    expect(input.questions[0].decision).toBe('discard');
    expect(input.questions[1].decision).toBe('answer');
    expect(input.questions[2].decision).toBe('research');
  });
});

describe('DesignApprovalInput', () => {
  it('should support approval', () => {
    const approval: DesignApprovalInput = {
      approved: true,
    };
    
    expect(approval.approved).toBe(true);
    expect(approval.feedback).toBeUndefined();
  });

  it('should support feedback', () => {
    const feedback: DesignApprovalInput = {
      approved: false,
      feedback: 'Please revise the architecture section',
    };
    
    expect(feedback.approved).toBe(false);
    expect(feedback.feedback).toBeDefined();
  });
});
