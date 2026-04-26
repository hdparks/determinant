import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import type { QuestionsApprovalInput } from '@determinant/types';

/**
 * QuestionsApprovalNode is a human checkpoint where a person reviews questions.
 * 
 * This is NOT claimable by agents. Only humans can process this node via API/UI.
 * 
 * For each question, the human can:
 * - DISCARD: Question is not relevant
 * - ANSWER: Human provides direct answer
 * - RESEARCH: Agent should investigate autonomously
 * 
 * Creates artifact: .determinant/artifacts/{taskId}/questionsapproval.md
 */
export class QuestionsApprovalNode extends Node {
  // Override claimable to ensure it's always false
  public readonly claimable = false;

  /**
   * Agents cannot process this node - will always throw
   */
  async process(): Promise<ProcessResult> {
    throw new Error(
      'QuestionsApprovalNode must be processed by human via API. ' +
      'Agent workers cannot claim human checkpoint nodes.'
    );
  }

  /**
   * Called by API when human submits question approval
   */
  async processHumanInput(input: QuestionsApprovalInput): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n✋ Processing Human Approval for Questions (node ${this.id})`);
      console.log(`   ${input.questions.length} questions reviewed`);
    }
    
    // Validate input
    for (const item of input.questions) {
      if (item.decision === 'answer' && (!item.answer || item.answer.trim() === '')) {
        throw new Error(`Question "${item.question}" decision is "answer" but answer is required`);
      }
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    // Format the approval artifact
    let artifactContent = '# Questions Approval\n\n';
    artifactContent += 'Human review of research questions:\n\n';

    for (const item of input.questions) {
      artifactContent += `## ${item.question}\n\n`;
      
      if (item.decision === 'discard') {
        artifactContent += '**Decision**: [DISCARD] - Question not relevant\n\n';
      } else if (item.decision === 'answer') {
        artifactContent += `**Decision**: [ANSWERED]\n\n${item.answer}\n\n`;
      } else if (item.decision === 'research') {
        artifactContent += '**Decision**: [RESEARCH] - Agent should investigate autonomously\n\n';
      }
    }
    
    // Update this node's content
    this.content = artifactContent;
    
    // Create the next node (ResearchNode)
    const childData = this.createChildNodeData(
      10, // Human input = high confidence
      10
    );
    
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   ✅ Questions approved, created ${childNode.toStage} node`);
    }
    
    return {
      childNode,
      artifactPath
    };
  }
}
