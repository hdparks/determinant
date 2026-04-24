import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

/**
 * PlanNode creates implementation plans from research or repair plans from validation failures.
 * 
 * The agent is instructed to build plans incrementally, starting with an overview
 * and progressively adding details for each step. For repair plans, failures are
 * addressed one-by-one. This incremental approach preserves progress if interrupted.
 * 
 * Supports two modes:
 * - Initial plan: Research → Plan (builds from research findings)
 * - Repair plan: Validate → Plan (addresses validation failures)
 */
export class PlanNode extends Node {
  async process(): Promise<ProcessResult> {
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
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
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing repair plan and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new repair plan from scratch

2. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Build the repair plan incrementally, addressing each failure as you analyze it.

3. The plan should:
   - Address each failure identified in the validation report
   - Explain what went wrong and why
   - Provide specific fixes for each issue
   - Include verification steps to confirm the fixes work
   
4. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
    } else {
      // Initial plan - get proposal and research
      const proposalNode = await this.getAncestorByStage('Proposal');
      const researchNode = await this.getAncestorByStage('Research');

      if (!proposalNode || !researchNode) {
        throw new Error('Plan requires both Proposal and Research ancestors');
      }

      // Always get full proposal content (it's typically shorter)
      const proposalContent = await this.getAncestorContent('Proposal');

      // Link to research with summary for token efficiency
      const researchLink = await this.createArtifactLink(researchNode, true);
      const researchSummary = this.extractSummary(researchNode.content, 50);

      prompt = `
You are creating a comprehensive implementation plan.

PROPOSAL:
${proposalContent}

RESEARCH SUMMARY:
${researchSummary}

Full research document: ${researchLink}

---

YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing plan and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new plan from scratch

2. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Build the plan incrementally - start with an overview, then add details for each step.

3. Create a detailed, step-by-step implementation plan that:
   - Breaks down the proposal into concrete, actionable tasks
   - Specifies exact file paths that need to be created or modified
   - Includes code patterns and examples from the research
   - Lists any dependencies that need to be added or updated
   - Provides verification steps for each major task

4. The plan should be specific enough that a developer could follow it without needing to ask clarifying questions.

5. IMPORTANT: Since the full research document is available via the link above, you should reference specific sections when needed rather than duplicating large amounts of research content.

6. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
      
      // Log statistics
      if (this.config.verbose) {
        const tokenEstimate = Math.ceil(prompt.length / 4);
        console.log(`📊 Plan prompt stats: ~${tokenEstimate.toLocaleString()} tokens`);
      }
    }
    
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
    
    return { childNode, artifactPath: result.filePath };
  }
}
