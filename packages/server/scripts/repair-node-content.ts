#!/usr/bin/env ts-node

/**
 * Repair script for nodes with empty content
 * 
 * This script finds all nodes that should have content from artifacts
 * but currently have empty content in the database, then backfills
 * the content from their artifact files.
 * 
 * Run with: npm run repair-nodes
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Database from 'better-sqlite3';

// Node stages that should have content from artifacts
const ARTIFACT_STAGES = ['Proposal', 'Questions', 'Research', 'Design', 'Plan', 'Implement'];

interface NodeRow {
  id: string;
  task_id: string;
  to_stage: string;
  content_length: number;
}

async function main() {
  const dbPath = join(process.cwd(), 'determinant.db');
  
  if (!existsSync(dbPath)) {
    console.error(`❌ Database not found at ${dbPath}`);
    process.exit(1);
  }
  
  const db = new Database(dbPath);
  
  console.log('\n🔍 Searching for nodes with empty content...\n');
  
  // Find all nodes with empty content that should have artifacts
  const query = `
    SELECT id, task_id, to_stage, LENGTH(content) as content_length
    FROM nodes
    WHERE to_stage IN (${ARTIFACT_STAGES.map(s => `'${s}'`).join(', ')})
    AND (content IS NULL OR content = '')
    ORDER BY created_at DESC
  `;
  
  const emptyNodes = db.prepare(query).all() as NodeRow[];
  
  if (emptyNodes.length === 0) {
    console.log('✅ No nodes found with empty content!\n');
    db.close();
    return;
  }
  
  console.log(`Found ${emptyNodes.length} nodes with empty content:\n`);
  
  let repaired = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const node of emptyNodes) {
    const artifactPath = getArtifactPath(node.to_stage, node.task_id);
    
    if (!existsSync(artifactPath)) {
      console.log(`⚠️  ${node.to_stage} ${node.id.substring(0, 8)}: Artifact file not found`);
      skipped++;
      continue;
    }
    
    try {
      const content = await readFile(artifactPath, 'utf-8');
      
      if (!content.trim()) {
        console.log(`⚠️  ${node.to_stage} ${node.id.substring(0, 8)}: Artifact file is empty`);
        skipped++;
        continue;
      }
      
      // Update the node content in database
      // Ensure content is stored as text, not blob
      const updateStmt = db.prepare('UPDATE nodes SET content = CAST(? AS TEXT) WHERE id = ?');
      updateStmt.run(content.trim(), node.id);
      
      console.log(`✅ ${node.to_stage} ${node.id.substring(0, 8)}: Updated with ${content.length} chars`);
      repaired++;
      
    } catch (error) {
      console.error(`❌ ${node.to_stage} ${node.id.substring(0, 8)}: Error -`, error);
      errors++;
    }
  }
  
  db.close();
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Repaired: ${repaired}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📝 Total: ${emptyNodes.length}\n`);
}

/**
 * Get the artifact file path for a given stage and task ID
 */
function getArtifactPath(stage: string, taskId: string): string {
  const artifactsDir = join(process.cwd(), '..', '..', '.determinant', 'artifacts', taskId);
  const filename = stage.toLowerCase() + '.md';
  return join(artifactsDir, filename);
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
