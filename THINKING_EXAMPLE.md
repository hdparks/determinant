# Extended Thinking Support

The Determinant client now supports OpenCode's extended thinking feature, which displays the model's reasoning process in real-time.

## How to Enable

Simply add the `variant` field to your `OpenCodeConfig`:

```typescript
import { DeterminantClient } from '@determinant/client';

const client = new DeterminantClient({
  baseURL: 'http://localhost:4000',
  openCodeConfig: {
    verbose: true,
    variant: 'high',  // Enables extended thinking
    model: 'anthropic/claude-sonnet-4-6'
  }
});
```

## What You'll See

When processing nodes, you'll see the model's thinking process displayed in real-time:

```
🤖 Calling OpenCode for plan node...
   Prompt: Implement user authentication with JWT tokens...
   ⏳ Executing OpenCode (timeout: 120s)...

   💭 Thinking...
      Let me analyze the requirements for JWT authentication.
      
      I need to consider:
      1. Token generation and signing
      2. Middleware for token validation
      3. Refresh token strategy
      4. Security best practices
      
      I'll break this into phases...
   ⏱️  Thinking took 3.31s

   📝 Response...
      {
        "filePath": "/path/to/plan.md",
        "confidenceBefore": 5,
        "confidenceAfter": 8
      }

   ✅ OpenCode completed successfully
   📄 Artifact: /path/to/plan.md
   📊 Confidence: 5 → 8
```

## Configuration Options

### `variant` (string, optional)
- **Purpose**: Controls the model's reasoning effort
- **Values**: `'high'`, `'max'`, `'minimal'` (provider-specific)
- **Default**: undefined (no extended thinking)
- **Note**: Extended thinking may increase latency and costs, but improves response quality for complex tasks

### `verbose` (boolean, optional)
- **Purpose**: Controls whether thinking is displayed
- **Default**: `true`
- **Note**: Thinking is only displayed when both `variant` is set AND `verbose` is true

## When to Use Extended Thinking

Extended thinking is beneficial for:
- ✅ Complex problem-solving tasks
- ✅ Multi-step planning
- ✅ Architectural decisions
- ✅ Code analysis and refactoring

It's less necessary for:
- ❌ Simple CRUD operations
- ❌ Straightforward implementations
- ❌ Quick questions

## Example: Complete Workflow

```typescript
import { DeterminantClient, TaskState } from '@determinant/client';

async function main() {
  const client = new DeterminantClient({
    baseURL: 'http://localhost:4000',
    openCodeConfig: {
      verbose: true,
      variant: 'high',          // Enable thinking
      model: 'anthropic/claude-sonnet-4-6',
      timeout: 180000,          // 3 minutes for complex tasks
    }
  });

  // Create a task
  const task = await client.createTask({
    title: 'Implement OAuth2 Authentication',
    description: 'Add OAuth2 support with Google and GitHub providers'
  });

  // Run proposal node (with thinking displayed)
  const proposal = await client.runProposal(task.id);
  
  // Progress through the graph
  const questions = await client.answerQuestions(proposal.id, {
    responses: ['Use Passport.js', 'Yes, add rate limiting']
  });
  
  const research = await client.conductResearch(questions.id);
  const plan = await client.createPlan(research.id);
  const implement = await client.implement(plan.id);
  const validate = await client.validate(implement.id);

  console.log('Task completed!', validate);
}

main().catch(console.error);
```

## Notes

- Thinking display happens in real-time as events stream from OpenCode
- The thinking content does not affect the final `AgentResult` structure
- All existing code continues to work without modification (backward compatible)
- If you don't specify `variant`, the behavior is identical to before
