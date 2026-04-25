import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initDb, closeDb } from './db.js';
import api from './api.js';
import { getEventBus } from './events.js';
import type { ViteDevServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT ?? '10110', 10);
const DB_PATH = process.env.DB_PATH ?? './determinant.db';
const isDev = process.env.NODE_ENV !== 'production';

let vite: ViteDevServer | undefined;

async function startServer() {
  const app = express();

  // CORS configuration
  const corsOptions = {
    origin: isDev ? true : (process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:10110']),
    credentials: true,
    optionsSuccessStatus: 200
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', api);

  if (isDev) {
    // Development: Use Vite middleware
    const { createServer } = await import('vite');
    
    const webRoot = join(__dirname, '../../web');
    
    vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
      root: webRoot,
      configFile: join(webRoot, 'vite.config.ts'),
    });
    
    // Use Vite's middleware for assets, HMR, etc.
    app.use(vite.middlewares);
    
    // Serve index.html for all non-API, non-Vite routes (SPA fallback)
    // This runs AFTER Vite middleware has had a chance to handle the request
    app.use(async (req, res, next) => {
      // Only handle GET requests that haven't been handled yet
      if (req.method !== 'GET' || res.headersSent) {
        return next();
      }
      
      const url = req.originalUrl;
      
      try {
        // Read index.html
        const fs = await import('fs');
        let template = fs.readFileSync(
          join(webRoot, 'index.html'),
          'utf-8'
        );
        
        // Apply Vite HTML transforms (inject HMR client, etc.)
        template = await vite!.transformIndexHtml(url, template);
        
        // Send the transformed HTML
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        // Let Vite fix the stack trace
        if (vite) {
          vite.ssrFixStacktrace(e as Error);
        }
        next(e);
      }
    });
  } else {
    // Production: Serve static files
    const publicPath = join(__dirname, '../public');
    
    // Serve static files first
    app.use(express.static(publicPath));
    
    // SPA fallback - serve index.html for client-side routing
    app.use((req, res) => {
      console.log(`[SPA Fallback] Path: ${req.path}, Method: ${req.method}`);
      
      // Don't serve index.html for asset requests - let Express handle 404
      const hasFileExtension = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|map)$/i.test(req.path);
      if (req.path.startsWith('/assets/') || hasFileExtension) {
        console.log(`[SPA Fallback] Returning 404 for asset: ${req.path}`);
        res.status(404).send('Not Found');
        return;
      }
      
      // For all other GET requests, serve index.html (SPA client-side routing)
      if (req.method === 'GET') {
        console.log(`[SPA Fallback] Serving index.html for: ${req.path}`);
        res.sendFile(join(publicPath, 'index.html'));
      } else {
        console.log(`[SPA Fallback] Non-GET request, returning 404`);
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, () => {
    console.log(`Determinant server running on port ${PORT}`);
    console.log(`Mode: ${isDev ? 'development' : 'production'}`);
    if (isDev) {
      console.log(`Web UI: http://localhost:${PORT}`);
    }
    
    initDb(DB_PATH);
    
    // Set up SSE event broadcasting
    const eventBus = getEventBus();
    
    // Wire up all event types to broadcast to connected clients
    eventBus.on('task:created', (task) => eventBus.broadcastEvent('task:created', task));
    eventBus.on('task:updated', (task) => eventBus.broadcastEvent('task:updated', task));
    eventBus.on('task:deleted', (id) => eventBus.broadcastEvent('task:deleted', id));
    eventBus.on('node:created', (data) => eventBus.broadcastEvent('node:created', data));
    eventBus.on('node:updated', (node) => eventBus.broadcastEvent('node:updated', node));
    eventBus.on('node:processed', (node) => eventBus.broadcastEvent('node:processed', node));
    eventBus.on('queue:updated', (queue) => eventBus.broadcastEvent('queue:updated', queue));
    
    console.log('[SSE] Event broadcasting initialized');
  });
}

async function shutdown() {
  console.log('Shutting down server...');
  
  // Close Vite dev server if running
  if (vite) {
    await vite.close();
  }
  
  const eventBus = getEventBus();
  
  // Gracefully close all SSE connections
  eventBus.getClients().forEach((res, clientId) => {
    try {
      res.write(': server-shutdown\n\n');
      res.end();
    } catch (error) {
      // Client already disconnected
    }
  });
  
  closeDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
startServer();