import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import type { DesignApprovalInput } from '@determinant/types';
import { join } from 'path';

/**
 * DesignApprovalNode is a human checkpoint where a person reviews the technical design.
 * 
 * This is NOT claimable by agents. Only humans can process this node via API/UI.
 * 
 * The human can:
 * - APPROVE: Design is good, proceed to Plan
 * - PROVIDE FEEDBACK: Design needs revision, create new DesignNode
 * 
 * Creates artifact:
 * - If approved: .determinant/artifacts/{taskId}/designapproval.md
 * - If feedback: .determinant/artifacts/{taskId}/designapproval.md (with feedback)
 */
export class DesignApprovalNode extends Node {
  // Override claimable to ensure it's always false
  public readonly claimable = false;

  /**
   * Agents cannot process this node - will always throw
   */
  async process(): Promise<ProcessResult> {
    throw new Error(
      'DesignApprovalNode must be processed by human via API. ' +
      'Agent workers cannot claim human checkpoint nodes.'
    );
  }

  /**
   * Called by API when human submits design approval or feedback
   */
  async processHumanInput(input: DesignApprovalInput): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n✋ Processing Human Approval for Design (node ${this.id})`);
      console.log(`   Decision: ${input.approved ? 'APPROVED' : 'NEEDS REVISION'}`);
    }
    
    // Validate input
    if (!input.approved && (!input.feedback || input.feedback.trim() === '')) {
      throw new Error('Feedback is required when design is not approved');
    }
    
    await this.ensureArtifactDir();
    
    if (input.approved) {
      return await this.processApproval();
    } else {
      return await this.processFeedback(input.feedback!);
    }
  }

  /**
   * Process approval - create PlanNode
   */
  private async processApproval(): Promise<ProcessResult> {
    const artifactPath = this.getStageArtifactPath();
    
    // Construct design artifact path
    const designArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'design.md'
    );
    
    const artifactContent = `# Design Approval

**Status**: APPROVED

The technical design has been reviewed and approved by a human.

## Approved Design

Design artifact: ${designArtifactPath}

The design document contains the technical design including architecture, component breakdown, technical decisions, data models, API designs, and security considerations.
`;
    
    this.content = artifactContent;
    
    // Create PlanNode (next stage in workflow)
    const childData = this.createChildNodeData(
      10, // Human approved = high confidence
      10
    );
    
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   ✅ Design approved, created ${childNode.toStage} node`);
    }
    
    return {
      childNode,
      artifactPath
    };
  }

  /**
   * Process feedback - create new DesignNode for revision
   */
  private async processFeedback(feedback: string): Promise<ProcessResult> {
    const artifactPath = this.getStageArtifactPath();
    
    const artifactContent = `# Design Feedback

**Status**: NEEDS_REVISION

The technical design requires revision based on human feedback.

## Human Feedback

${feedback}
`;
    
    this.content = artifactContent;
    
    // Create new DesignNode to address feedback (loops back!)
    const childData = {
      ...this.createChildNodeData(
        5, // Needs revision = medium confidence
        5
      ),
      toStage: 'Design' as const, // Override to loop back to Design
      fromStage: 'DesignApproval' as const
    };
    
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   ↻ Feedback provided, created ${childNode.toStage} node for revision`);
    }
    
    return {
      childNode,
      artifactPath
    };
  }
}
