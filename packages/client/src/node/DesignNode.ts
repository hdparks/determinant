import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * DesignNode creates a technical design document based on research findings.
 * 
 * This is an agent-claimable node that can operate in two modes:
 * 1. Initial design creation - based on Research findings
 * 2. Design revision - based on human feedback from DesignApproval
 * 
 * The agent builds the design document incrementally at a stage-based artifact path:
 * .determinant/artifacts/{taskId}/design.md
 * 
 * This enables crash recovery - if interrupted, retries continue from partial work.
 */
export class DesignNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n🎨 Processing Design node ${this.id}`);
      console.log(`   Creating technical design document...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    // Determine if this is initial design or a revision
    const isRevision = this.fromStage === 'DesignApproval';
    
    let prompt: string;
    
    if (isRevision) {
      prompt = await this.buildRevisionPrompt(artifactPath);
    } else {
      prompt = await this.buildInitialPrompt(artifactPath);
    }
    
    const result = await this.generateContent(prompt);
    
    // Validate agent wrote to expected location
    if (result.filePath !== artifactPath) {
      throw new Error(
        `Agent wrote to unexpected path: ${result.filePath}, expected: ${artifactPath}`
      );
    }
    
    const markdown = await readFile(result.filePath, 'utf-8');
    
    // Save this node's content to database (following ProposalNode pattern)
    this.content = markdown.trim();
    this.confidenceBefore = result.confidenceBefore!;
    this.confidenceAfter = result.confidenceAfter!;
    await this.save();
    
    if (this.config.verbose) {
      console.log(`   💾 Design content saved to database`);
    }
    
    const childData = this.createChildNodeData(result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
  
  /**
   * Build prompt for initial design creation (from Research)
   */
  private async buildInitialPrompt(artifactPath: string): Promise<string> {
    // Construct artifact paths
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
    
    return `
You are creating a CONCISE technical design plan based on research findings.

PROPOSAL ARTIFACT:
Path: ${proposalArtifactPath}
Purpose: Contains the original task description including the vibe (what to build), pins (requirements that must be honored), and hints (guidance from the user).

RESEARCH ARTIFACT:
Path: ${researchArtifactPath}
Purpose: Contains answers to questions about the codebase, existing patterns, and technical constraints discovered during research, combining both human-provided answers and agent research findings.

YOUR JOB:
1. Read the proposal and research artifacts to understand the requirements and context.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review and UPDATE it - preserve good parts, improve weak sections
   - IF IT DOESN'T EXIST: Create a new design document from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all design work to write the artifact.
   If interrupted, your incremental updates will be preserved.

4. Create a CONCISE design plan (target 200-300 tokens) that captures:
   - High-level solution approach (2-3 sentences)
   - Key architectural decisions (3-5 bullet points max)
   - Critical technical choices with brief rationale (3-5 decisions max)
   - Major risks or constraints (2-3 items max)

5. The design should be:
   - Focused on WHAT and WHY, not HOW
   - Decision-oriented, not implementation-detailed
   - Concise enough to grasp in under 2 minutes
   - Honoring all pins from the proposal
   - Justified with key insights from research

6. DO NOT include:
   - Code snippets or line numbers
   - Exhaustive testing checklists or step-by-step implementation plans
   - Exact styling specifications (colors, pixels, CSS classes)
   - Comprehensive documentation of every detail
   - Sections on topics with obvious/standard approaches
   - Details that can be determined during implementation

7. Write in markdown format with clear, focused sections.

8. Finally, respond with ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 how confident you were before creating design>,
  "confidenceAfter": <1-10 how confident you are in this design>
}
     `.trim();
  }
  
  /**
   * Build prompt for design revision (based on human feedback)
   */
  private async buildRevisionPrompt(artifactPath: string): Promise<string> {
    // Construct artifact paths
    const originalDesignArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'design.md'
    );
    
    const feedbackArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'designapproval.md'
    );
    
    return `
You are REVISING a technical design plan based on human feedback.

ORIGINAL DESIGN ARTIFACT:
Path: ${originalDesignArtifactPath}
Purpose: Contains the previous version of the technical design plan that received human feedback.

DESIGN FEEDBACK ARTIFACT:
Path: ${feedbackArtifactPath}
Purpose: Contains human review of the design with feedback requesting specific revisions.

YOUR JOB:
1. Read both artifacts to understand the original design and the feedback provided.

2. Carefully review the human feedback - these are critical issues to address

3. Update the design document at: ${artifactPath}
   - Address ALL points raised in the feedback
   - Keep the good parts of the original design
   - Improve or add sections based on feedback
   - Maintain CONCISENESS (200-300 tokens target)

4. IMPORTANT: Update the document continuously as you make progress.
   Build incrementally rather than waiting until the end.

5. Make sure the revised design:
   - Fully addresses the human feedback
   - Remains focused on key decisions (not implementation details)
   - Maintains technical soundness
   - Is concise and decision-oriented
   - Avoids code snippets, exhaustive checklists, and styling minutiae

6. Finally, respond with ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 your confidence before revision (likely lower due to feedback)>,
  "confidenceAfter": <1-10 your confidence after addressing feedback>
}
     `.trim();
  }
}
