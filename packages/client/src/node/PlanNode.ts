import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

export class PlanNode extends Node {
  async process(): Promise<ProcessResult> {
    await this.ensureArtifactDir();
    
    const childId = this.generateId();
    const artifactPath = this.getArtifactPath(childId);
    
    // Determine if this is initial plan or repair plan
    const isRepairPlan = this.fromStage === 'Validate';
    
    let prompt: string;
    
    if (isRepairPlan) {
      // This is a repair plan - content is validation failure report
      const proposalContent = await this.getAncestorContent('Proposal');
      prompt = `
You are creating a repair plan to fix validation failures.

ORIGINAL PROPOSAL:
${proposalContent}

VALIDATION FAILURE REPORT:
${this.content}

YOUR JOB:
1. Create a repair plan at: ${artifactPath}
2. The plan should:
   - Address each failure identified in the validation report
   - Explain what went wrong and why
   - Provide specific fixes for each issue
   - Include verification steps to confirm the fixes work
   
3. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
    } else {
      // Initial plan - content is research, need proposal too
      const proposalContent = await this.getAncestorContent('Proposal');
      prompt = `
You are creating a comprehensive implementation plan.

PROPOSAL:
${proposalContent}

RESEARCH:
${this.content}

YOUR JOB:
1. Create a detailed plan at: ${artifactPath}
2. The plan should include:
   - Step-by-step implementation tasks
   - File changes needed (specific paths)
   - Code patterns to follow (from research)
   - Dependencies to add/update
   - Automated verification steps wherever possible
   - Manual verification steps where automation isn't feasible
   - Expected outcomes for each verification step

3. The plan should be actionable and specific enough that another developer could execute it

4. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
    }
    
    const result = await this.generateContent(prompt);
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = Node.create(childData, this.client, this.config);
    
    return { childNode, artifactPath: result.filePath };
  }
}
