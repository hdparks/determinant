import { describe, it, expect } from 'vitest';
import { TASK_STATES } from '../index.js';
import type { TaskState, Node, QuestionAnswersInput, DesignApprovalInput } from '../index.js';

describe('TaskState', () => {
  it('should include all 10 workflow stages', () => {
    expect(TASK_STATES).toHaveLength(10);
  });

  it('should include QuestionAnswers state', () => {
    expect(TASK_STATES).toContain('QuestionAnswers');
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
      'QuestionAnswers',
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

describe('QuestionAnswersInput', () => {
  it('should validate structured answers with custom answers', () => {
    const input: QuestionAnswersInput = {
      answers: [
        { questionNumber: 1, question: 'Q1?', customAnswer: 'Answer 1' },
        { questionNumber: 2, question: 'Q2?', customAnswer: 'Answer 2' },
        { questionNumber: 3, question: 'Q3?', selectedOptionId: 'a' },
      ],
    };
    
    expect(input.answers).toHaveLength(3);
    expect(input.answers[0].customAnswer).toBe('Answer 1');
    expect(input.answers[1].customAnswer).toBe('Answer 2');
    expect(input.answers[2].selectedOptionId).toBe('a');
  });

  it('should allow selecting options', () => {
    const input: QuestionAnswersInput = {
      answers: [
        { questionNumber: 1, question: 'Q1?', selectedOptionId: 'a' },
        { questionNumber: 2, question: 'Q2?', selectedOptionId: 'b' },
      ],
    };
    
    expect(input.answers).toHaveLength(2);
    expect(input.answers[0].selectedOptionId).toBe('a');
    expect(input.answers[1].selectedOptionId).toBe('b');
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
