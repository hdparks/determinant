import { DeterminantClient } from '../client/index.js';
import { Node } from '../node/Node.js';

/**
 * Example workflow demonstrating Node class usage
 * 
 * This example shows how to:
 * 1. Fetch a task with its nodes
 * 2. Create a Node instance using the factory pattern
 * 3. Process a node to generate artifacts via OpenCode
 * 4. Save the resulting child node
 */
async function exampleWorkflow() {
  // Initialize client
  const client = new DeterminantClient({
    baseUrl: 'http://localhost:10110',
    apiKey: process.env.DETERMINANT_API_KEY
  });
  
  // Example task ID (replace with actual ID)
  const taskId = 'task_example_123';
  
  console.log('=== Node Workflow Example ===\n');
  
  try {
    // 1. Fetch a task with its nodes
    console.log(`Fetching task ${taskId}...`);
    const { task, nodes } = await client.getTask(taskId);
    
    console.log(`Task: ${task.vibe}`);
    console.log(`State: ${task.state}`);
    console.log(`Nodes: ${nodes.length}\n`);
    
    // Check if there are any nodes
    if (nodes.length === 0) {
      console.log('No nodes yet. Create a Proposal node first.');
      return;
    }
    
    // 2. Get the latest node
    const latestNodeData = nodes[nodes.length - 1];
    console.log(`Latest node stage: ${latestNodeData.toStage}`);
    console.log(`Node ID: ${latestNodeData.id}\n`);
    
    // 3. Create Node instance (factory returns correct subclass)
    const latestNode = await Node.create(latestNodeData, client);
    console.log(`Created ${latestNode.constructor.name} instance\n`);
    
    // Skip if already at final stage
    if (latestNodeData.toStage === 'Released') {
      console.log('Node is already at Released stage (final stage)');
      return;
    }
    
    // 4. Process the node (generates next stage artifact via OpenCode)
    console.log('Processing node with OpenCode agent...');
    console.log('This will:');
    console.log('  - Call OpenCode to generate the next stage artifact');
    console.log('  - Create a markdown file in .determinant/artifacts/');
    console.log('  - Return a fully constructed child node\n');
    
    const result = await latestNode.process();
    
    console.log('✅ Processing complete!');
    console.log(`Artifact created at: ${result.artifactPath}`);
    console.log(`Child node stage: ${result.childNode.toStage}`);
    console.log(`Child node ID: ${result.childNode.id}`);
    console.log(`Confidence: ${result.childNode.confidenceBefore} → ${result.childNode.confidenceAfter}\n`);
    
    // 5. Save the child node to persist it
    console.log('Saving child node to database...');
    await result.childNode.save();
    console.log(`✅ Child node saved with ID: ${result.childNode.id}\n`);
    
    // 6. Continue processing if desired (example: process the next stage too)
    if (result.childNode.toStage !== 'Released') {
      console.log('Child node is not at final stage yet.');
      console.log('You could continue processing:');
      console.log('  const nextResult = await result.childNode.process();');
      console.log('  await nextResult.childNode.save();\n');
    } else {
      console.log('Child node reached Released stage (final stage)\n');
    }
    
    console.log('=== Workflow Complete ===');
    
  } catch (error) {
    console.error('Error in workflow:', error);
    throw error;
  }
}

/**
 * Simple example showing the clean API
 */
async function simpleExample() {
  const client = new DeterminantClient({
    baseUrl: 'http://localhost:10110',
    apiKey: process.env.DETERMINANT_API_KEY
  });
  
  // Fetch task
  const { nodes } = await client.getTask('task_123');
  const latestNodeData = nodes[nodes.length - 1];
  
  // Create node instance
  const node = await Node.create(latestNodeData, client);
  
  // Process and save - that's it!
  const result = await node.process();
  await result.childNode.save();
  
  console.log(`Created ${result.childNode.toStage} node: ${result.childNode.id}`);
}

// Run the example if this file is executed directly
if (require.main === module) {
  exampleWorkflow().catch(console.error);
}

export { exampleWorkflow, simpleExample };
