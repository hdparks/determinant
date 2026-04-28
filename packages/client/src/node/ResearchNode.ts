import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

/**
 * ResearchNode conducts codebase research using human answers as guidance.
 * 
 * The agent reads human-provided answers from QuestionAnswers artifact and uses them
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
    
    // Ensure QuestionAnswers artifact exists (generate from DB if needed)
    const questionAnswersArtifactPath = await this.ensureAncestorArtifactExists('QuestionAnswers');
    
    const prompt = `
You are conducting research to gather comprehensive context for a development task.

QUESTION ANSWERS ARTIFACT:
Path: ${questionAnswersArtifactPath}
Purpose: Contains questions about the task and human-provided answers. Each question is formatted as a markdown heading with the answer below it.

YOUR JOB:
1. Read the QuestionAnswers artifact to understand what questions need research and what guidance the human provided.

2. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing research and ADD to it - preserve all previous content
   - IF IT DOESN'T EXIST: Create a new research document from scratch

3. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   If the process is interrupted, your incremental updates will be preserved.

4. For each question in the QuestionAnswers artifact:
   - Use the human's answer as a starting point/guidance
   - If the human provided specific details (like "JWT auth" or "using React"), explore that area of the codebase
   - If the human wrote "unknown", "not sure", or similar, investigate autonomously
   - Find relevant files, read implementations, understand patterns
   - Gather comprehensive context with file paths and code references
   - Verify the human's answer against actual code where possible

5. Create a synthesis that combines:
   - Human knowledge (high-level guidance)
   - Agent exploration (deep codebase familiarity, file paths, implementation details)
   - Code references (actual files and line numbers)

6. The research document should be well-organized with:
   - Each question followed by detailed research findings
   - Code examples or file references where relevant
   - File paths and line numbers for key implementations
   - Recommendations based on findings

7. Finally, respond with ONLY this JSON (no other text):
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
    
    // Save this node's content to database (following ProposalNode pattern)
    this.content = markdown.trim();
    this.confidenceBefore = result.confidenceBefore!;
    this.confidenceAfter = result.confidenceAfter!;
    await this.save();
    
    if (this.config.verbose) {
      console.log(`   💾 Research content saved to database`);
    }
    
    const childData = this.createChildNodeData(result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
