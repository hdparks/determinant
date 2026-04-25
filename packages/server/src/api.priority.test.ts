import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './api.js';
import { initDb, closeDb } from './db.js';

describe('POST /api/tasks priority validation', () => {
  let app: express.Application;

  beforeAll(() => {
    initDb(':memory:');
    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', router);
  });

  afterAll(() => {
    closeDb();
  });

  test('accepts valid priority values (1-5)', async () => {
    for (const priority of [1, 2, 3, 4, 5]) {
      const response = await request(app)
        .post('/api/tasks')
        .send({ vibe: `Test task priority ${priority}`, priority });
      
      expect(response.status).toBe(201);
      expect(response.body.task.priority).toBe(priority);
    }
  });

  test('uses default priority 3 when omitted', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task no priority' });
    
    expect(response.status).toBe(201);
    expect(response.body.task.priority).toBe(3);
  });

  test('rejects priority 0', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task', priority: 0 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Priority must be between 1 and 5');
  });

  test('rejects priority 6', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task', priority: 6 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Priority must be between 1 and 5');
  });

  test('rejects negative priority', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task', priority: -1 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Priority must be between 1 and 5');
  });

  test('rejects string priority', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task', priority: 'abc' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Priority must be between 1 and 5');
  });

  test('rejects large out-of-range priority', async () => {
    const response = await request(app)
      .post('/api/tasks')
      .send({ vibe: 'Test task', priority: 999 });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Priority must be between 1 and 5');
  });
});
