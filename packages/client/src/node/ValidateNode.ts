import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import type { Node as NodeInterface } from '@determinant/types';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * ValidateNode runs verification tests and creates validation reports.
 * 
 * The agent is instructed to document test results incrementally as each
 * verification is run. However, the final SUCCESS/FAILURE status can only
 * be determined after all tests complete. This incremental documentation
 * preserves progress if interrupted during long test runs.
 * 
 * Creates different child nodes based on validation outcome:
 * - SUCCESS → ReleasedNode (task complete)
 * - FAILURE → PlanNode (repair cycle)
 */
export class ValidateNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n✅ Processing Validate node ${this.id}`);
      console.log(`   Running verification tests...`);
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
    
    const planArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'plan.md'
    );
    
    const implementArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'implement.md'
    );
    
    const prompt = `
You are validating an implementation against the original proposal.

ORIGINAL PROPOSAL ARTIFACT:
Path: ${proposalArtifactPath}
Purpose: Contains the original task description including the vibe (what to build), pins (requirements that must be honored), and hints (guidance from the user).

IMPLEMENTATION PLAN ARTIFACT:
Path: ${planArtifactPath}
Purpose: Contains the step-by-step implementation plan including verification steps that should be run to validate the implementation.

IMPLEMENTATION NOTES ARTIFACT:
Path: ${implementArtifactPath}
Purpose: Contains implementation notes documenting what was built, code changes made, deviations from the plan, issues encountered, and current implementation state.

YOUR JOB:
1. Read all three artifacts to understand what was requested, what was planned, and what was actually implemented.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing validation report and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new validation report from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Document test results as you run each verification, building the report incrementally.

4. Run each verification test outlined in the plan
5. Compare the implementation against the original proposal requirements
6. Create a validation report at: ${artifactPath}

7. The validation report MUST:
   - Start with a clear SUCCESS or FAILURE status
   - List each verification test and its result
   - Verify that all proposal requirements are met
   - Include test outputs and evidence
   - If FAILURE: clearly identify what failed and why
   - If SUCCESS: confirm all requirements satisfied

8. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "status": "success" OR "failure",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
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
    
    if (this.config.verbose) {
      console.log(`   ${result.status === 'success' ? '✅ Validation SUCCESS' : '❌ Validation FAILURE'}`);
    }
    
    // CONDITIONAL LOGIC: Create different child based on success/failure
    let childData: NodeInterface;
    
    if (result.status === 'success') {
      // Success: create Released node (normal progression)
      if (this.config.verbose) {
        console.log(`   🎉 Task complete! Creating Released node...`);
      }
      childData = this.createChildNodeData(
        result.confidenceBefore!, 
        result.confidenceAfter!
      );
    } else {
      // Failure: create Plan node for repair cycle
      if (this.config.verbose) {
        console.log(`   🔄 Creating repair Plan node to fix issues...`);
      }
      // Override toStage to be 'Plan' instead of next stage
      childData = {
        id: this.generateId(),
        taskId: this.taskId,
        parentNodeId: this.id,
        fromStage: 'Validate',
        toStage: 'Plan',  // Back to planning!
        content: '',  // Empty content, child will populate when processing
        confidenceBefore: result.confidenceBefore!,
        confidenceAfter: result.confidenceAfter!,
        claimable: this.isStageClaimable('Plan'),
        createdAt: new Date(),
        processedAt: null
      };
    }
    
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
