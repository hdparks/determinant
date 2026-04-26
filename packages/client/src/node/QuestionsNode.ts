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

4. The questions should cover:
   - What parts of the codebase are relevant?
   - What existing patterns or conventions should be followed?
   - What technical decisions need to be made?
   - What dependencies or integrations are involved?
   - What edge cases or error scenarios should be considered?
   - What testing strategies are appropriate?

5. Format the questions in markdown with clear sections
6. Return ONLY this JSON (no other text):
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
