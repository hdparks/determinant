import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

/**
 * ImplementNode executes the implementation plan and creates detailed notes.
 * 
 * The agent is instructed to update implementation notes continuously,
 * documenting what was done after each file or major change rather than
 * waiting until all work is complete. This preserves progress if interrupted
 * and provides clear tracking of implementation status.
 */
export class ImplementNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n⚙️  Processing Implement node ${this.id}`);
      console.log(`   Executing implementation plan...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    const prompt = `
You are implementing a development plan.

PLAN:
${this.content}

YOUR JOB:
1. Check if a file already exists at: ${artifactPath}
   - IF IT EXISTS: Review the existing implementation notes and ADD to them - preserve all previous content
   - IF IT DOESN'T EXIST: Start implementing from scratch

2. IMPORTANT: Update the document continuously as you make progress.
   Don't wait until you've finished all work to write the artifact.
   Update your implementation notes after completing each file or major task.

3. Execute each step in the plan
4. Create detailed implementation notes at: ${artifactPath}
5. The implementation notes should include:
   - What was implemented
   - Code changes made (specific files and changes)
   - Any deviations from the plan and why
   - Issues encountered and how they were resolved
   - Current state of the implementation

6. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 confidence before implementation>,
  "confidenceAfter": <1-10 confidence in the implementation>
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
