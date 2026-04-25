import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './api.js';
import { initDb, closeDb } from './db.js';
import { getEventBus, resetEventBus } from './events.js';

/**
 * SSE API Endpoint Tests
 * 
 * Note: SSE connections are streaming and never end naturally.
 * We use a helper that aborts the connection after capturing initial response.
 */

/**
 * Helper to test SSE endpoint with timeout
 * SSE connections stream indefinitely, so we abort after getting initial response
 */
async function testSSEConnection(req: request.Test): Promise<{
  status: number;
  headers: Record<string, string | string[]>;
  text: string;
}> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Connection timeout'));
      }
    }, 200); // 200ms timeout

    req
      .buffer(true) // Enable buffering
      .parse((res, callback) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString();
          // Once we have initial response, resolve
          if (data.includes(': connected') && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            res.destroy(); // Close connection
            callback(null, {
              status: res.statusCode,
              headers: res.headers,
              text: data,
            });
            resolve({
              status: res.statusCode!,
              headers: res.headers as Record<string, string>,
              text: data,
            });
          }
        });
        res.on('end', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            callback(null, {
              status: res.statusCode,
              headers: res.headers,
              text: data,
            });
            resolve({
              status: res.statusCode!,
              headers: res.headers as Record<string, string>,
              text: data,
            });
          }
        });
      })
      .end((err) => {
        if (err && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          // For SSE, connection errors after initial response are expected
          if (err.message?.includes('aborted')) {
            // This is fine - we aborted it ourselves
            return;
          }
          reject(err);
        }
      });
  });
}

describe('GET /api/events (SSE)', () => {
  let app: express.Application;
  const originalApiKey = process.env.DETERMINANT_API_KEY;

  beforeAll(() => {
    initDb(':memory:');
    app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', router);
  });

  afterAll(() => {
    closeDb();
    // Restore original API key
    if (originalApiKey) {
      process.env.DETERMINANT_API_KEY = originalApiKey;
    } else {
      delete process.env.DETERMINANT_API_KEY;
    }
  });

  beforeEach(() => {
    resetEventBus();
    // Clear API key for each test (tests will set it as needed)
    delete process.env.DETERMINANT_API_KEY;
  });

  describe('Authentication', () => {
    test('accepts connection when no API key configured', async () => {
      delete process.env.DETERMINANT_API_KEY;

      const response = await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });

    test('accepts connection with valid API key (query param)', async () => {
      process.env.DETERMINANT_API_KEY = 'test-secret-key';

      const response = await testSSEConnection(
        request(app)
          .get('/api/events?apiKey=test-secret-key')
          .set('Accept', 'text/event-stream')
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });

    test('rejects with 401 when API key required but missing', async () => {
      process.env.DETERMINANT_API_KEY = 'test-secret-key';

      const response = await request(app)
        .get('/api/events')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: API key required');
    });

    test('rejects with 401 when API key invalid', async () => {
      process.env.DETERMINANT_API_KEY = 'test-secret-key';

      const response = await request(app)
        .get('/api/events?apiKey=wrong-key')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized: Invalid API key');
    });
  });

  describe('Connection Establishment', () => {
    test('sets correct SSE headers', async () => {
      const response = await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    test('sends initial connection success comment', async () => {
      const response = await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      expect(response.status).toBe(200);
      expect(response.text).toContain(': connected');
    });

    test('initial comment follows SSE format', async () => {
      const response = await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      // SSE comments start with ':' followed by space
      // and end with double newline
      expect(response.text).toMatch(/: connected\n\n/);
    });
  });

  describe('Connection Limits', () => {
    test('rejects with 503 when server at capacity', async () => {
      const eventBus = getEventBus();
      const hasCapacitySpy = vi.spyOn(eventBus, 'hasCapacity').mockReturnValue(false);

      const response = await request(app)
        .get('/api/events')
        .set('Accept', 'text/event-stream');

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('Server at capacity');

      hasCapacitySpy.mockRestore();
    });
  });

  describe('Logging', () => {
    test('logs client connection', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      // Should log connection with client ID
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SSE] Client connected:')
      );

      consoleLogSpy.mockRestore();
    });

    test('logs client disconnection', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await testSSEConnection(
        request(app)
          .get('/api/events')
          .set('Accept', 'text/event-stream')
      );

      // Wait for disconnect event
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SSE] Client disconnected:')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    test('handles malformed query parameters gracefully', async () => {
      process.env.DETERMINANT_API_KEY = 'test-key';

      const response = await request(app)
        .get('/api/events?apiKey=')
        .set('Accept', 'text/event-stream');

      // Empty API key should be rejected when API key is required
      expect(response.status).toBe(401);
    });

    test('accepts connection without Accept header', async () => {
      const response = await testSSEConnection(
        request(app).get('/api/events')
      );

      expect(response.status).toBe(200);
    });

    test('handles URL-encoded query parameters', async () => {
      process.env.DETERMINANT_API_KEY = 'test key with spaces';

      const response = await testSSEConnection(
        request(app)
          .get('/api/events?apiKey=test%20key%20with%20spaces')
          .set('Accept', 'text/event-stream')
      );

      expect(response.status).toBe(200);
    });

    test('rejects POST requests', async () => {
      const response = await request(app)
        .post('/api/events')
        .send({});

      expect(response.status).toBe(404);
    });

    test('rejects PUT requests', async () => {
      const response = await request(app)
        .put('/api/events')
        .send({});

      expect(response.status).toBe(404);
    });

    test('rejects DELETE requests', async () => {
      const response = await request(app)
        .delete('/api/events');

      expect(response.status).toBe(404);
    });
  });
});
