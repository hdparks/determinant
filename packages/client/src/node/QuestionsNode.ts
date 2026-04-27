import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * QuestionsNode generates research questions from a proposal.
 * 
 * The agent is instructed to build the questions document incrementally,
 * adding questions as knowledge gaps are identified rather than planning
 * all questions upfront. This preserves progress if interrupted.
 */
export class QuestionsNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n❓ Processing Questions node ${this.id}`);
      console.log(`   Generating questions to guide research...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    const proposalArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'proposal.md'
    );
    
    const prompt = `
You are analyzing a proposal to identify knowledge gaps that need research.

PROPOSAL ARTIFACT:
Path: ${proposalArtifactPath}
Purpose: Contains the original task description including the vibe (what to build), pins (requirements that must be honored), and hints (guidance from the user).

YOUR JOB:
1. Read the proposal artifact to understand the task requirements.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing questions and ADD to them - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new questions document from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Add questions as you identify knowledge gaps, building the document incrementally.

4. For each knowledge gap, EXPLORE FIRST before asking humans:
   - If you CAN find a concrete answer through codebase exploration, DOCUMENT IT DIRECTLY
   - If the answer requires human judgment or decision-making, PRESENT STRUCTURED OPTIONS
   
5. The questions should cover:
   - What parts of the codebase are relevant?
   - What existing patterns or conventions should be followed?
   - What technical decisions need to be made?
   - What dependencies or integrations are involved?
   - What edge cases or error scenarios should be considered?
   - What testing strategies are appropriate?

6. FORMAT your questions using this structured markdown format:

   For questions where you FOUND A CONCRETE ANSWER:
   
   ### Question 1
   What is the authentication mechanism used?
   
   **Answer**: Uses JWT tokens (found in \`src/auth/jwt.ts:23\`)
   
   **Context**: The auth middleware validates tokens on each request using the jsonwebtoken library. Tokens are signed with HS256 and expire after 24 hours.
   
   ---
   
   For questions requiring HUMAN DECISION:
   
   ### Question 2
   Should we add rate limiting to the API endpoints?
   
   **Options**:
   - **A: Add rate limiting** (Recommended)
     - Prevents abuse and DDoS attacks
     - Standard practice for public APIs
     - Can use existing express-rate-limit middleware
   - **B: Skip rate limiting for now**
     - Simpler initial implementation
     - Can add later if needed
     - Risk: API vulnerable to abuse
   - **C: Add rate limiting only to auth endpoints**
     - Protects most critical endpoints
     - Reduces implementation scope
     - Leaves other endpoints exposed
   
   **Context**: The API currently has no rate limiting. Given this is a public-facing API, protection is recommended to prevent abuse.
   
   ---

7. IMPORTANT FORMATTING RULES:
   - Use "### Question N" headers for each question (where N is the question number)
   - For answered questions: Use "**Answer**:" followed by the answer with file references
   - For decision questions: Use "**Options**:" followed by lettered options (A, B, C, etc.)
   - Mark recommended options with "(Recommended)" after the option letter
   - Always include "**Context**:" to explain your reasoning
   - Separate questions with "---" horizontal rules

8. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 how confident you are in your current understanding>,
  "confidenceAfter": <1-10 how confident you are that these questions will lead to a good plan>
}
    `.trim();
    
    const result = await this.generateContent(prompt);
    
    // Validate agent wrote to expected location
    if (result.filePath !== artifactPath) {
      throw new Error(
        `Agent wrote to unexpected path: ${result.filePath}, expected: ${artifactPath}`
      );
    }
    
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
