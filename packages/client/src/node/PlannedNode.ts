import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { readFile } from 'fs/promises';

export class PlannedNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n📋 Processing Planned node ${this.id}`);
      console.log(`   Executing plan to generate documentation...`);
    }
    
    await this.ensureArtifactDir();
    
    const childId = this.generateId();
    const artifactPath = this.getArtifactPath(childId);
    
    const prompt = `
You are executing a plan to generate implementation documentation.

PLAN:
${this.content}

YOUR JOB:
1. Create detailed execution/implementation notes at: ${artifactPath}
2. The execution notes should include:
   - Implementation details
   - Code changes made (or to be made)
   - Configuration updates
   - Any issues encountered

3. Return ONLY this JSON (no other text):
{
  "filePath": "${artifactPath}",
  "confidenceBefore": <1-10>,
  "confidenceAfter": <1-10>
}
    `.trim();
    
    const result = await this.generateContent(prompt);
    const markdown = await readFile(result.filePath, 'utf-8');
    const childData = this.createChildNodeData(markdown, result.confidenceBefore!, result.confidenceAfter!);
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return { childNode, artifactPath: result.filePath };
  }
}
