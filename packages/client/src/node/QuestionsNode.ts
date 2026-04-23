import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

export class QuestionsNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n❓ Processing Questions node ${this.id}`);
      console.log(`   Generating questions to guide research...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    const prompt = `
You are analyzing a proposal to identify knowledge gaps that need research.

PROPOSAL:
${this.content}

YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing questions and continue/complete them
   - IF IT DOESN'T EXIST: Create a new questions document from scratch

2. The questions should cover:
   - What parts of the codebase are relevant?
   - What existing patterns or conventions should be followed?
   - What technical decisions need to be made?
   - What dependencies or integrations are involved?
   - What edge cases or error scenarios should be considered?
   - What testing strategies are appropriate?

3. Format the questions in markdown with clear sections
4. Return ONLY this JSON (no other text):
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
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
