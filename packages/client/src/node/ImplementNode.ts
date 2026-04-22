import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

export class ImplementNode extends Node {
  async process(): Promise<ProcessResult> {
    await this.ensureArtifactDir();
    
    const childId = this.generateId();
    const artifactPath = this.getArtifactPath(childId);
    
    const prompt = `
You are implementing a development plan.

PLAN:
${this.content}

YOUR JOB:
1. Execute each step in the plan
2. Create detailed implementation notes at: ${artifactPath}
3. The implementation notes should include:
   - What was implemented
   - Code changes made (specific files and changes)
   - Any deviations from the plan and why
   - Issues encountered and how they were resolved
   - Current state of the implementation

4. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 confidence before implementation>,
  "confidenceAfter": <1-10 confidence in the implementation>
}
    `.trim();
    
    const result = await this.generateContent(prompt);
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = Node.create(childData, this.client, this.config);
    
    return { childNode, artifactPath: result.filePath };
  }
}
