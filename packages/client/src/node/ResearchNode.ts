import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

interface ParsedQuestion {
  question: string;
  answer: string;
}

interface ParsedQuestionAnswers {
  questions: Array<ParsedQuestion>;
}

/**
 * ResearchNode conducts codebase research using human answers as guidance.
 * 
 * The agent reads human-provided answers from QuestionAnswers and uses them
 * as starting points for comprehensive codebase exploration. For example:
 * - If human says "JWT auth", agent finds JWT implementation and reads it
 * - If human says "unknown", agent investigates autonomously
 * 
 * The research is built incrementally, writing findings as they are discovered
 * rather than waiting until all research is complete. This ensures that if the
 * agent is interrupted (timeout, crash), significant progress is preserved and
 * the retry can continue from the partial artifact.
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
    
    // Read QuestionAnswers artifact to extract questions and human answers
    const questionAnswersContent = await this.getAncestorArtifactContent('QuestionAnswers');
    const parsedQuestions = this.parseQuestionAnswers(questionAnswersContent);
    
    if (this.config.verbose) {
      console.log(`   📋 ${parsedQuestions.questions.length} questions to research`);
    }
    
    // Build context for the prompt with all questions and human answers
    const questionsSection = parsedQuestions.questions.map((q, i) => 
      `\n${i + 1}. ${q.question}\n   Human answer: ${q.answer}`
    ).join('\n');
    
    const prompt = `
You are conducting research to gather comprehensive context for a development task.

HUMAN-PROVIDED ANSWERS:
${questionsSection}

YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing research and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new research document from scratch

2. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   If the process is interrupted, your incremental updates will be preserved.

3. For each question:
   - Use the human's answer as a starting point/guidance
   - If the human provided specific details (like "JWT auth" or "using React"), explore that area of the codebase
   - If the human wrote "unknown", "not sure", or similar, investigate autonomously
   - Find relevant files, read implementations, understand patterns
   - Gather comprehensive context with file paths and code references
   - Verify the human's answer against actual code where possible

4. Create a synthesis that combines:
   - Human knowledge (high-level guidance)
   - Agent exploration (deep codebase familiarity, file paths, implementation details)
   - Code references (actual files and line numbers)

5. The research document should be well-organized with:
   - Each question followed by detailed research findings
   - Code examples or file references where relevant
   - File paths and line numbers for key implementations
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
   * Parse QuestionAnswers artifact to extract questions and human answers
   * 
   * New simplified format:
   * ## Question 1: What is the auth mechanism?
   * **Answer**: JWT tokens stored in localStorage
   * 
   * ## Question 2: How are errors handled?
   * **Answer**: Using try-catch blocks and toast notifications
   */
  private parseQuestionAnswers(content: string): ParsedQuestionAnswers {
    const questions: ParsedQuestion[] = [];
    
    // Split content by ## headers (questions)
    const sections = content.split(/^## /m).filter(s => s.trim());
    
    for (const section of sections) {
      const lines = section.trim().split('\n');
      if (lines.length === 0) continue;
      
      // First line contains the question (may have "Question N: " prefix)
      const questionLine = lines[0].trim();
      const questionText = questionLine.replace(/^Question \d+:\s*/, '');
      
      // Find the answer line (starts with **Answer**:)
      const answerLine = lines.find(l => l.trim().startsWith('**Answer**:'));
      if (!answerLine) continue;
      
      // Extract answer text (everything after **Answer**: on same line, or subsequent lines)
      const answerLineIndex = lines.findIndex(l => l.trim().startsWith('**Answer**:'));
      const answerStart = answerLine.replace(/^\*\*Answer\*\*:\s*/, '').trim();
      const answerRest = lines.slice(answerLineIndex + 1)
        .filter(l => l.trim() && !l.startsWith('##') && !l.startsWith('**'))
        .join('\n')
        .trim();
      
      const answer = answerStart + (answerRest ? '\n' + answerRest : '');
      
      if (answer) {
        questions.push({ question: questionText, answer });
      }
    }
    
    return { questions };
  }
}
