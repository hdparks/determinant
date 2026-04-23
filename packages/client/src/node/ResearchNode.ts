import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';

/**
 * ResearchNode conducts codebase research to answer questions.
 * 
 * If a partial research artifact exists from a previous incomplete run,
 * this node will continue that research rather than starting from scratch.
 * This allows for graceful recovery from failures and incremental research.
 * 
 * Continuation behavior:
 * - Checks for existing .md artifacts in the task directory
 * - If found, includes existing content in prompt with continuation instructions
 * - Reuses the same artifact file path
 * - If corrupted or empty, falls back to creating fresh research
 */
export class ResearchNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n🔍 Processing Research node ${this.id}`);
      console.log(`   Conducting research to answer questions...`);
    }
    
    await this.ensureArtifactDir();
    
    // Check for existing partial research
    const existingResearch = await this.findPartialResearch();
    const artifactPath = existingResearch?.path || this.getArtifactPath(this.generateId());

    if (existingResearch && this.config.verbose) {
      console.log(`   📝 Continuing existing research at ${artifactPath}`);
    }
    
    // Build prompt based on whether continuing or creating new
    let prompt: string;

    if (existingResearch) {
      // Continuation prompt
      prompt = `
You are conducting research to answer questions about a development task.

EXISTING RESEARCH:
${existingResearch.content}

QUESTIONS:
${this.content}

YOUR JOB:
1. Continue the existing research document at: ${artifactPath}
2. Review what has already been researched above
3. For each question, fill in any gaps or add new findings:
   - Research the codebase thoroughly (use grep, read files, explore patterns)
   - Apply best practices and solid engineering judgment
   - Provide clear, actionable answers
4. If the existing research adequately answers all questions, you may keep it as-is.
   Only add new findings if there are gaps or incomplete sections.
   
5. The research document should remain well-organized with:
   - Each question followed by its answer
   - Code examples or file references where relevant
   - Recommendations based on findings

6. Finally, respond with ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10 how confident you were before research>,
  "confidenceAfter": <1-10 how confident you are in the research findings>
}
      `.trim();
    } else {
      // Original prompt for new research
      prompt = `
You are conducting research to answer questions about a development task.

QUESTIONS:
${this.content}

YOUR JOB:
1. Create a research document at: ${artifactPath}
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
    }
    
    const result = await this.generateContent(prompt);
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }

  /**
   * Searches for existing partial research artifacts for this task.
   * 
   * Looks for .md files in the task's artifact directory and returns
   * the most recent one if found. Validates that the file is readable
   * and non-empty.
   * 
   * @returns Object with path and content if partial research exists, null otherwise
   */
  private async findPartialResearch(): Promise<{ path: string; content: string } | null> {
    const artifactDir = join(
      this.config.workingDir!,
      '.determinant',
      'artifacts',
      this.taskId
    );
    
    try {
      const files = await readdir(artifactDir);
      const researchFiles = files.filter(f => f.endsWith('.md'));
      
      if (researchFiles.length === 0) {
        return null;
      }
      
      // Get the most recent file (files are named with timestamps)
      const latestFile = researchFiles[researchFiles.length - 1];
      const filePath = join(artifactDir, latestFile);
      const content = await readFile(filePath, 'utf-8');
      
      // Validate content is not empty
      if (!content || content.trim().length === 0) {
        if (this.config.verbose) {
          console.log(`   ⚠️  Found research artifact but it's empty, starting fresh`);
        }
        return null;
      }
      
      return { path: filePath, content };
    } catch (error) {
      // Directory doesn't exist or read failed - treat as no partial research
      return null;
    }
  }
}
