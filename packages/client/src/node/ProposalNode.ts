import { Node } from './Node.js';
import type { ProcessResult } from './types.js';
import { writeFile } from 'fs/promises';

export class ProposalNode extends Node {
  async process(): Promise<ProcessResult> {
    if (this.config.verbose) {
      console.log(`\n📋 Processing Proposal node ${this.id}`);
      console.log(`   Creating proposal document from task data...`);
    }
    
    await this.ensureArtifactDir();
    
    const artifactPath = this.getStageArtifactPath();
    
    // Fetch the task data to get vibe, pins, hints
    const taskData = await this.client.getTask(this.taskId);
    const task = taskData.task;
    
    // Build markdown from task data
    let markdown = `# Vibe\n\n${task.vibe}\n\n`;
    
    if (task.pins.length > 0) {
      markdown += `## Pins\n\n`;
      task.pins.forEach(pin => {
        markdown += `- ${pin}\n`;
      });
      markdown += '\n';
    }
    
    if (task.hints.length > 0) {
      markdown += `## Hints\n\n`;
      task.hints.forEach(hint => {
        markdown += `- ${hint}\n`;
      });
      markdown += '\n';
    }
    
    // Write markdown file directly (no OpenCode call)
    await writeFile(artifactPath, markdown.trim(), 'utf-8');
    
    if (this.config.verbose) {
      console.log(`   ✅ Proposal document created at ${artifactPath}`);
    }
    
    // Update this node's content in the database
    this.content = markdown.trim();
    this.confidenceBefore = 5;
    this.confidenceAfter = 5;
    await this.save();
    
    if (this.config.verbose) {
      console.log(`   💾 Proposal content saved to database`);
    }
    
    // Create child node data with default confidence scores
    const childData = this.createChildNodeData(
      markdown.trim(),
      5,  // default confidenceBefore
      5   // default confidenceAfter
    );
    
    // Create child node instance (will be QuestionsNode)
    const childNode = await Node.create(childData, this.client, this.config);
    
    if (this.config.verbose) {
      console.log(`   🎯 Created child node: ${childNode.toStage}`);
    }
    
    return {
      childNode,
      artifactPath
    };
  }
}
