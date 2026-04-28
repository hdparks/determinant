import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './api.js';
import { initDb, closeDb, getDb } from './db.js';

describe('GET /api/work-dirs', () => {
  let app: express.Application;

  beforeAll(async () => {
    await initDb(':memory:');
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  afterAll(() => {
    closeDb();
  });

  test('returns empty array when no tasks exist', async () => {
    const response = await request(app).get('/api/work-dirs');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ workingDirs: [] });
  });

  test('returns distinct working directories', async () => {
    const db = getDb();
    
    // Insert tasks with working directories
    db.prepare(`
      INSERT INTO tasks (id, vibe, state, priority, manual_weight, working_dir, created_at, updated_at)
      VALUES 
        ('task1', 'Test 1', 'pending', 0, 0, '/path/one', datetime('now'), datetime('now')),
        ('task2', 'Test 2', 'pending', 0, 0, '/path/two', datetime('now'), datetime('now')),
        ('task3', 'Test 3', 'pending', 0, 0, '/path/one', datetime('now'), datetime('now'))
    `).run();
    
    const response = await request(app).get('/api/work-dirs');
    
    expect(response.status).toBe(200);
    expect(response.body.workingDirs).toHaveLength(2);
    expect(response.body.workingDirs).toContain('/path/one');
    expect(response.body.workingDirs).toContain('/path/two');
  });

  test('filters out null working directories', async () => {
    const db = getDb();
    
    // Clear previous data
    db.prepare('DELETE FROM tasks').run();
    
    // Insert tasks with mixed null and non-null working dirs
    db.prepare(`
      INSERT INTO tasks (id, vibe, state, priority, manual_weight, working_dir, created_at, updated_at)
      VALUES 
        ('task4', 'Test 4', 'pending', 0, 0, '/path/valid', datetime('now'), datetime('now')),
        ('task5', 'Test 5', 'pending', 0, 0, NULL, datetime('now'), datetime('now'))
    `).run();
    
    const response = await request(app).get('/api/work-dirs');
    
    expect(response.status).toBe(200);
    expect(response.body.workingDirs).toEqual(['/path/valid']);
  });

  test('returns directories in sorted order', async () => {
    const db = getDb();
    db.prepare('DELETE FROM tasks').run();
    
    db.prepare(`
      INSERT INTO tasks (id, vibe, state, priority, manual_weight, working_dir, created_at, updated_at)
      VALUES 
        ('task6', 'Test 6', 'pending', 0, 0, '/zzz', datetime('now'), datetime('now')),
        ('task7', 'Test 7', 'pending', 0, 0, '/aaa', datetime('now'), datetime('now')),
        ('task8', 'Test 8', 'pending', 0, 0, '/mmm', datetime('now'), datetime('now'))
    `).run();
    
    const response = await request(app).get('/api/work-dirs');
    
    expect(response.status).toBe(200);
    expect(response.body.workingDirs).toEqual(['/aaa', '/mmm', '/zzz']);
  });
});

describe('GET /api/validate-path', () => {
  let app: express.Application;

  beforeAll(async () => {
    await initDb(':memory:');
    app = express();
    app.use(express.json());
    app.use('/api', router);
  });

  afterAll(() => {
    closeDb();
  });

  test('returns error for missing path parameter', async () => {
    const response = await request(app).get('/api/validate-path');
    
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'path query parameter required' });
  });

  test('returns exists=true for valid directory', async () => {
    const response = await request(app)
      .get('/api/validate-path')
      .query({ path: '/tmp' });
    
    expect(response.status).toBe(200);
    expect(response.body.exists).toBe(true);
    expect(response.body.isDirectory).toBe(true);
  });

  test('returns exists=false for non-existent path', async () => {
    const response = await request(app)
      .get('/api/validate-path')
      .query({ path: '/this/path/does/not/exist/12345' });
    
    expect(response.status).toBe(200);
    expect(response.body.exists).toBe(false);
    expect(response.body.isDirectory).toBe(false);
  });

  test('returns isDirectory=false for file path', async () => {
    // Using /etc/hosts as a known file on Unix systems
    const response = await request(app)
      .get('/api/validate-path')
      .query({ path: '/etc/hosts' });
    
    expect(response.status).toBe(200);
    expect(response.body.exists).toBe(true);
    expect(response.body.isDirectory).toBe(false);
  });
});
