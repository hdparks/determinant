import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

export class QuestionsNode extends Node {
  async process(): Promise<ProcessResult> {
    await this.ensureArtifactDir();
    
    const childId = this.generateId();
    const artifactPath = this.getArtifactPath(childId);
    
    const prompt = `
You are analyzing a proposal to identify knowledge gaps that need research.

PROPOSAL:
${this.content}

YOUR JOB:
1. Create a questions document at: ${artifactPath}
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
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = Node.create(childData, this.client, this.config);
    
    return { childNode, artifactPath: result.filePath };
  }
}
