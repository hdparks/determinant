import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './api.js';
import { initDb, closeDb } from './db.js';

describe('PATCH /api/tasks/:id/vibe', () => {
  let app: express.Application;
  let taskId: string;

  beforeAll(async () => {
    initDb(':memory:');
    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', router);

    // Create test task
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Original vibe' });
    taskId = response.body.task.id;
  });

  afterAll(() => {
    closeDb();
  });

  test('updates vibe with valid non-empty string', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: 'Updated vibe' });
    
    expect(response.status).toBe(200);
    expect(response.body.task.vibe).toBe('Updated vibe');
  });

  test('trims whitespace from vibe', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: '  Trimmed vibe  ' });
    
    expect(response.status).toBe(200);
    expect(response.body.task.vibe).toBe('Trimmed vibe');
  });

  test('updates the updated_at timestamp', async () => {
    const before = new Date();
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: 'Timestamp test' });
    
    const updatedAt = new Date(response.body.task.updatedAt);
    expect(updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  test('returns 404 when task does not exist', async () => {
    const response = await request(app)
      .patch('/api/tasks/nonexistent/vibe')
      .send({ vibe: 'Test' });
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Task not found');
  });

  test('returns 400 when vibe is empty string', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: '' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Vibe cannot be empty');
  });

  test('returns 400 when vibe is whitespace only', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: '   ' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Vibe cannot be empty');
  });

  test('returns 400 when vibe is missing', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({});
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Vibe must be a string');
  });

  test('returns 400 when vibe is not a string', async () => {
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: 123 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Vibe must be a string');
  });

  test('returns 400 when vibe exceeds 1000 characters', async () => {
    const longVibe = 'a'.repeat(1001);
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: longVibe });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Vibe must be 1000 characters or less');
  });

  test('accepts vibe at exactly 1000 characters', async () => {
    const maxVibe = 'a'.repeat(1000);
    const response = await request(app)
      .patch(`/api/tasks/${taskId}/vibe`)
      .send({ vibe: maxVibe });
    
    expect(response.status).toBe(200);
    expect(response.body.task.vibe).toBe(maxVibe);
  });
});
