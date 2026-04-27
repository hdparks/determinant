import { Knex } from 'knex';

/**
 * Migration 005: Rename QuestionsApproval to QuestionAnswers
 * Data migration to update existing tasks and nodes with the renamed state
 */
export async function up(knex: Knex): Promise<void> {
  // Check if any tasks use the old state name
  const questionsApprovalCount = await knex.raw(`
    SELECT COUNT(*) as count 
    FROM tasks 
    WHERE state = 'QuestionsApproval'
  `).then((result: any) => result[0].count);

  if (questionsApprovalCount > 0) {
    // Update task state
    await knex.raw(`
      UPDATE tasks 
      SET state = 'QuestionAnswers' 
      WHERE state = 'QuestionsApproval'
    `);
    
    // Update nodes from_stage
    await knex.raw(`
      UPDATE nodes 
      SET from_stage = 'QuestionAnswers' 
      WHERE from_stage = 'QuestionsApproval'
    `);
    
    // Update nodes to_stage
    await knex.raw(`
      UPDATE nodes 
      SET to_stage = 'QuestionAnswers' 
      WHERE to_stage = 'QuestionsApproval'
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  throw new Error('No rollbacks supported - forward-only migrations');
}
