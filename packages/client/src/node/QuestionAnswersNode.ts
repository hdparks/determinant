import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import type { QuestionAnswersInput, StructuredQuestion } from '@determinant/types';
import { parseQuestionsArtifact } from '../utils/parse-questions.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * QuestionAnswersNode is a human checkpoint where a person reviews questions.
 * 
 * This is NOT claimable by agents. Only humans can process this node via API/UI.
 * 
 * The human can either:
 * 1. Accept answers the agent found through exploration
 * 2. Select from options the agent presented
 * 3. Provide custom answers
 * 
 * The ResearchNode will use these answers as starting points for comprehensive 
 * codebase exploration.
 * 
 * Creates artifact: .determinant/artifacts/{taskId}/questionanswers.md
 */
export class QuestionAnswersNode extends Node {
  // Override claimable to ensure it's always false
  public readonly claimable = false;

  /**
   * Agents cannot process this node - will always throw
   */
  async process(): Promise<ProcessResult> {
    throw new Error(
      'QuestionAnswersNode must be processed by human via API. ' +
      'Agent workers cannot claim human checkpoint nodes.'
    );
  }

  /**
   * Called by API when human submits question approval
   */
  async processHumanInput(input: QuestionAnswersInput): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n✋ Processing Human Approval for Questions (node ${this.id})`);
      console.log(`   ${input.answers.length} questions answered`);
    }
    
    // Validate input - each answer must have selectedOptionId OR customAnswer
    for (const item of input.answers) {
      if (!item.selectedOptionId && !item.customAnswer?.trim()) {
        throw new Error(
          `Question ${item.questionNumber} "${item.question}" requires an answer. ` +
          'Please select an option or provide a custom answer.'
        );
      }
    }
    
    // Read the original questions artifact to get the full question details
    const questionsArtifactPath = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId,
      'questions.md'
    );
    
    let questions: StructuredQuestion[] = [];
    try {
      const questionsContent = await readFile(questionsArtifactPath, 'utf-8');
      questions = parseQuestionsArtifact(questionsContent);
    } catch (error) {
      // If we can't read questions, continue with less detailed output
      console.warn('Could not read questions artifact:', error);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    // Format the approval artifact with full context
    let artifactContent = '# Question Answers\n\n';
    artifactContent += 'Human decisions on research questions:\n\n';

    for (const answer of input.answers) {
      const question = questions.find(q => q.number === answer.questionNumber);
      
      artifactContent += `## Question ${answer.questionNumber}: ${answer.question}\n\n`;
      
      // Show original answer if agent found it through exploration
      if (question?.answer) {
        artifactContent += `**Agent found**: ${question.answer}\n\n`;
      }
      
      // Show options if they were presented
      if (question?.options && question.options.length > 0) {
        artifactContent += '**Options presented**:\n';
        question.options.forEach(opt => {
          const recommendedMarker = opt.recommended ? ' (Recommended)' : '';
          const selectedMarker = opt.id === answer.selectedOptionId ? ' ✓ **SELECTED**' : '';
          artifactContent += `- **${opt.id.toUpperCase()}**: ${opt.label}${recommendedMarker}${selectedMarker}\n`;
          if (opt.description) {
            artifactContent += `  - ${opt.description}\n`;
          }
        });
        artifactContent += '\n';
      }
      
      // Show context if available
      if (question?.context) {
        artifactContent += `**Context**: ${question.context}\n\n`;
      }
      
      // Show human's final decision
      let humanDecision: string;
      if (answer.customAnswer) {
        humanDecision = answer.customAnswer;
      } else if (answer.selectedOptionId && question?.options) {
        const selectedOption = question.options.find(o => o.id === answer.selectedOptionId);
        humanDecision = selectedOption?.label || answer.selectedOptionId;
      } else {
        humanDecision = 'Acknowledged';
      }
      
      artifactContent += `**Human decision**: ${humanDecision}\n\n`;
      artifactContent += '---\n\n';
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
