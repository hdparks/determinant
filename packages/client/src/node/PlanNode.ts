import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

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
      // This is a repair plan
      const proposalArtifactPath = join(
        this.config.workingDir!,
        '.determinant',
        'artifacts',
        this.taskId,
        'proposal.md'
      );
      
      const validateArtifactPath = join(
        this.config.workingDir!,
        '.determinant',
        'artifacts',
        this.taskId,
        'validate.md'
      );
      
      prompt = `
You are creating a repair plan to fix validation failures.

ORIGINAL PROPOSAL ARTIFACT:
Path: ${proposalArtifactPath}
Purpose: Contains the original task description including the vibe (what to build), pins (requirements that must be honored), and hints (guidance from the user).

VALIDATION FAILURE ARTIFACT:
Path: ${validateArtifactPath}
Purpose: Contains validation test results showing which requirements failed, including test outputs and specific failure reasons.

YOUR JOB:
1. Read both artifacts to understand the original requirements and what failed during validation.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing repair plan and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new repair plan from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Build the repair plan incrementally, addressing each failure as you analyze it.

4. The plan should:
   - Address each failure identified in the validation report
   - Explain what went wrong and why
   - Provide specific fixes for each issue
   - Include verification steps to confirm the fixes work
   
5. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
    } else {
      // Initial plan
      const proposalArtifactPath = join(
        this.config.workingDir!,
        '.determinant',
        'artifacts',
        this.taskId,
        'proposal.md'
      );
      
      const researchArtifactPath = join(
        this.config.workingDir!,
        '.determinant',
        'artifacts',
        this.taskId,
        'research.md'
      );
      
      const designArtifactPath = join(
        this.config.workingDir!,
        '.determinant',
        'artifacts',
        this.taskId,
        'design.md'
      );

      prompt = `
You are creating a comprehensive implementation plan.

PROPOSAL ARTIFACT:
Path: ${proposalArtifactPath}
Purpose: Contains the original task description including the vibe (what to build), pins (requirements that must be honored), and hints (guidance from the user).

RESEARCH ARTIFACT:
Path: ${researchArtifactPath}
Purpose: Contains answers to questions about the codebase, existing patterns, and technical constraints discovered during research, combining both human-provided answers and agent research findings.

APPROVED DESIGN ARTIFACT:
Path: ${designArtifactPath}
Purpose: Contains the technical design document including architecture, component breakdown, technical decisions, data models, API designs, and security considerations. This design has been reviewed and approved by a human.

YOUR JOB:
1. Read all three artifacts to understand the full context for implementation.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing plan and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new plan from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Build the plan incrementally - start with an overview, then add details for each step.

4. Create a detailed, step-by-step implementation plan that:
   - Follows the APPROVED TECHNICAL DESIGN above (this is mandatory)
   - Breaks down the proposal into concrete, actionable tasks
   - Specifies exact file paths that need to be created or modified
   - Includes code patterns and examples from the research
   - Lists any dependencies that need to be added or updated
   - Provides verification steps for each major task

5. The plan should be specific enough that a developer could follow it without needing to ask clarifying questions.

6. IMPORTANT: The approved design has been reviewed and approved by a human. Your implementation plan MUST align with it. Do not deviate from the design's architectural decisions.

7. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
      `.trim();
    }
    
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
    
    return { childNode, artifactPath: result.filePath };
  }
}
