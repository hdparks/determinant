import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

/**
 * ResearchNode conducts codebase research to answer questions.
 * 
 * Uses stage-based artifact path (.determinant/artifacts/{taskId}/research.md)
 * which enables crash recovery: if an agent crashes mid-research, the next
 * invocation can detect the partial work and continue from where it left off.
 */
export class ResearchNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n🔍 Processing Research node ${this.id}`);
      console.log(`   Conducting research to answer questions...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    const prompt = `
You are conducting research to answer questions about a development task.

QUESTIONS:
${this.content}

YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing research and continue/complete it
   - IF IT DOESN'T EXIST: Create a new research document from scratch

2. For each question:
   - Research the codebase thoroughly (use grep, read files, explore patterns)
   - Apply best practices and solid engineering judgment
   - Provide clear, actionable answers
   
3. The research document should be well-organized with:
   - Each question followed by its answer
   - Code examples or file references where relevant
   - Recommendations based on findings

4. Finally, respond with ONLY this JSON (no other text):
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
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
