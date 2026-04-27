import { describe, it, expect } from 'vitest';
import { parseQuestionsArtifact } from '../parse-questions.js';

describe('parseQuestionsArtifact', () => {
  it('should parse questions with concrete answers', () => {
    const content = `# Research Questions

### Question 1
What is the authentication mechanism?

**Answer**: Uses JWT tokens (found in \`src/auth/jwt.ts:23\`)

**Context**: The auth middleware validates tokens on each request using the jsonwebtoken library.

---`;

    const questions = parseQuestionsArtifact(content);
    
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      number: 1,
      text: 'What is the authentication mechanism?',
      answer: 'Uses JWT tokens (found in `src/auth/jwt.ts:23`)',
      context: 'The auth middleware validates tokens on each request using the jsonwebtoken library.',
    });
    expect(questions[0].options).toBeUndefined();
  });

  it('should parse questions with options and recommendations', () => {
    const content = `# Research Questions

### Question 2
Should we add rate limiting to the API endpoints?

**Options**:
- **A: Add rate limiting** (Recommended)
  - Prevents abuse and DDoS attacks
  - Standard practice for public APIs
- **B: Skip rate limiting for now**
  - Simpler initial implementation
  - Can add later if needed

**Context**: The API currently has no rate limiting.

---`;

    const questions = parseQuestionsArtifact(content);
    
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      number: 2,
      text: 'Should we add rate limiting to the API endpoints?',
      context: 'The API currently has no rate limiting.',
    });
    
    expect(questions[0].answer).toBeUndefined();
    expect(questions[0].options).toHaveLength(2);
    
    expect(questions[0].options![0]).toMatchObject({
      id: 'a',
      label: 'Add rate limiting',
      recommended: true,
      description: 'Prevents abuse and DDoS attacks Standard practice for public APIs',
    });
    
    expect(questions[0].options![1]).toMatchObject({
      id: 'b',
      label: 'Skip rate limiting for now',
      recommended: false,
      description: 'Simpler initial implementation Can add later if needed',
    });
  });

  it('should parse multiple questions of different types', () => {
    const content = `# Research Questions

### Question 1
What is the database schema?

**Answer**: SQLite with tasks and nodes tables

**Context**: Found in migrations/001_initial.sql

---

### Question 2
Should we use TypeScript or JavaScript?

**Options**:
- **A: TypeScript** (Recommended)
  - Better type safety
- **B: JavaScript**
  - Faster to write

**Context**: Team prefers TypeScript.

---

### Question 3
What testing framework is used?

**Answer**: Vitest

---`;

    const questions = parseQuestionsArtifact(content);
    
    expect(questions).toHaveLength(3);
    
    // Question 1 - answered
    expect(questions[0].number).toBe(1);
    expect(questions[0].answer).toBe('SQLite with tasks and nodes tables');
    expect(questions[0].options).toBeUndefined();
    
    // Question 2 - has options
    expect(questions[1].number).toBe(2);
    expect(questions[1].answer).toBeUndefined();
    expect(questions[1].options).toHaveLength(2);
    expect(questions[1].options![0].recommended).toBe(true);
    
    // Question 3 - answered
    expect(questions[2].number).toBe(3);
    expect(questions[2].answer).toBe('Vitest');
    expect(questions[2].options).toBeUndefined();
  });

  it('should handle questions without separators', () => {
    const content = `### Question 1
What is the auth mechanism?

**Answer**: JWT tokens`;

    const questions = parseQuestionsArtifact(content);
    
    expect(questions).toHaveLength(1);
    expect(questions[0].number).toBe(1);
    expect(questions[0].text).toBe('What is the auth mechanism?');
    expect(questions[0].answer).toBe('JWT tokens');
  });

  it('should return empty array for invalid content', () => {
    const content = `# Some random content without questions`;
    
    const questions = parseQuestionsArtifact(content);
    
    expect(questions).toHaveLength(0);
  });
});
