import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import type { Node as NodeInterface } from '@determinant/types';
import { readFile } from 'fs/promises';

export class ValidateNode extends Node {
  async process(): Promise<ProcessResult> {
    await this.ensureArtifactDir();
    
    const childId = this.generateId();
    const artifactPath = this.getArtifactPath(childId);
    
    // Get proposal and plan content from ancestors
    const proposalContent = await this.getAncestorContent('Proposal');
    const planContent = await this.getAncestorContent('Plan');
    
    const prompt = `
You are validating an implementation against the original proposal.

ORIGINAL PROPOSAL:
${proposalContent}

PLAN (including verification steps):
${planContent}

IMPLEMENTATION NOTES:
${this.content}

YOUR JOB:
1. Run each verification test outlined in the plan
2. Compare the implementation against the original proposal requirements
3. Create a validation report at: ${artifactPath}

4. The validation report MUST:
   - Start with a clear SUCCESS or FAILURE status
   - List each verification test and its result
   - Verify that all proposal requirements are met
   - Include test outputs and evidence
   - If FAILURE: clearly identify what failed and why
   - If SUCCESS: confirm all requirements satisfied

5. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "status": "success" OR "failure",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
    `.trim();
    
    const result = await this.generateContent(prompt);
    const markdown = await readFile(result.filePath, 'utf-8');
    
    // CONDITIONAL LOGIC: Create different child based on success/failure
    let childData: NodeInterface;
    
    if (result.status === 'success') {
      // Success: create Released node (normal progression)
      childData = this.createChildNodeData(
        markdown, 
        result.confidenceBefore!, 
        result.confidenceAfter!
      );
    } else {
      // Failure: create Plan node for repair cycle
      // Override toStage to be 'Plan' instead of next stage
      childData = {
        id: this.generateId(),
        taskId: this.taskId,
        parentNodeId: this.id,
        fromStage: 'Validate',
        toStage: 'Plan',  // Back to planning!
        content: markdown,  // Validation failure report becomes plan input
        confidenceBefore: result.confidenceBefore!,
        confidenceAfter: result.confidenceAfter!,
        createdAt: new Date()
      };
    }
    
    const childNode = Node.create(childData, this.client, this.config);
    
    return { childNode, artifactPath: result.filePath };
  }
}
