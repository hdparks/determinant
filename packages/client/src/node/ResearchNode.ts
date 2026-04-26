import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

interface ParsedQuestion {
  question: string;
  decision: 'discard' | 'answer' | 'research';
  answer?: string;
}

interface ParsedQuestionsApproval {
  answered: Array<{ question: string; answer: string }>;
  toResearch: Array<{ question: string }>;
  discarded: Array<{ question: string }>;
}

/**
 * ResearchNode conducts codebase research to answer questions.
 * 
 * The agent is instructed to build the research document incrementally,
 * writing findings as they are discovered rather than waiting until all
 * research is complete. This ensures that if the agent is interrupted
 * (timeout, crash), significant progress is preserved and the retry
 * can continue from the partial artifact.
 * 
 * Reads from QuestionsApproval artifact which contains human decisions:
 * - [DISCARD]: Skip this question
 * - [ANSWERED]: Use human's answer directly
 * - [RESEARCH]: Agent should investigate
 * 
 * Uses stage-based artifact path (.determinant/artifacts/{taskId}/research.md)
 */
export class ResearchNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n🔍 Processing Research node ${this.id}`);
      console.log(`   Conducting research to answer questions...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    // Read QuestionsApproval artifact to extract questions and human decisions
    const questionsApprovalContent = await this.getAncestorArtifactContent('QuestionsApproval');
    const parsedQuestions = this.parseQuestionsApproval(questionsApprovalContent);
    
    if (this.config.verbose) {
      console.log(`   📋 Questions breakdown:`);
      console.log(`      ${parsedQuestions.answered.length} answered by human`);
      console.log(`      ${parsedQuestions.toResearch.length} to research`);
      console.log(`      ${parsedQuestions.discarded.length} discarded`);
    }
    
    // Build context sections for the prompt
    const answeredSection = parsedQuestions.answered.length > 0 
      ? `\nHUMAN-ANSWERED QUESTIONS (use these answers directly):\n${parsedQuestions.answered.map(q => `\nQ: ${q.question}\nA: ${q.answer}`).join('\n')}\n`
      : '';
    
    const researchSection = parsedQuestions.toResearch.length > 0
      ? `\nQUESTIONS TO RESEARCH:\n${parsedQuestions.toResearch.map(q => `- ${q.question}`).join('\n')}\n`
      : '';
    
    const discardedNote = parsedQuestions.discarded.length > 0
      ? `\nNote: ${parsedQuestions.discarded.length} question(s) were marked as not relevant by human reviewer and can be ignored.\n`
      : '';
    
    const prompt = `
You are conducting research to answer questions about a development task.
${answeredSection}${researchSection}${discardedNote}
YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing research and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new research document from scratch

2. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   If the process is interrupted, your incremental updates will be preserved.

3. For HUMAN-ANSWERED questions:
   - Include their answers in your research document (they're authoritative)
   - No need to research these further

4. For QUESTIONS TO RESEARCH:
   - Research the codebase thoroughly (use grep, read files, explore patterns)
   - Apply best practices and solid engineering judgment
   - Provide clear, actionable answers
   - Start with the most critical questions first (those blocking implementation)

5. The research document should be well-organized with:
   - Each question followed by its answer (human-provided or researched)
   - Code examples or file references where relevant
   - Recommendations based on findings

6. Finally, respond with ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 how confident you were before research>,
  "confidenceAfter": <1-10 how confident you are in the research findings>
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
    const childData = this.createChildNodeData(result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
  
  /**
   * Parse QuestionsApproval artifact to extract questions and human decisions
   * 
   * Format expected:
   * ## Question text?
   * **Decision**: [DISCARD] - ...
   * 
   * ## Another question?
   * **Decision**: [ANSWERED]
   * Human's answer here
   * 
   * ## Third question?
   * **Decision**: [RESEARCH] - ...
   */
  private parseQuestionsApproval(content: string): ParsedQuestionsApproval {
    const result: ParsedQuestionsApproval = {
      answered: [],
      toResearch: [],
      discarded: []
    };
    
    // Split content by ## headers (questions)
    const sections = content.split(/^## /m).filter(s => s.trim());
    
    for (const section of sections) {
      const lines = section.trim().split('\n');
      if (lines.length === 0) continue;
      
      const questionText = lines[0].trim();
      
      // Find the decision line
      const decisionLine = lines.find(l => l.includes('**Decision**:'));
      if (!decisionLine) continue;
      
      if (decisionLine.includes('[DISCARD]')) {
        result.discarded.push({ question: questionText });
      } else if (decisionLine.includes('[ANSWERED]')) {
        // Answer is the content after the decision line
        const decisionIndex = lines.findIndex(l => l.includes('**Decision**:'));
        const answerLines = lines.slice(decisionIndex + 1).filter(l => l.trim() && !l.startsWith('**'));
        const answer = answerLines.join('\n').trim();
        
        if (answer) {
          result.answered.push({ question: questionText, answer });
        }
      } else if (decisionLine.includes('[RESEARCH]')) {
        result.toResearch.push({ question: questionText });
      }
    }
    
    return result;
  }
}
