# @determinant/server

Express API server for Determinant task management system.

## Features

- RESTful API for task CRUD operations
- Priority queue management with configurable heap weights
- Task claiming system with TTL-based locks
- SQLite database for persistence
- Optional API key authentication

## Installation

```bash
npm install
npm run build
```

## Running the Server

```bash
# Development mode (auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

## Serving Web Application

In production, the server can serve the web UI directly from a single process:

### Setup

1. Build all packages:
   ```bash
   npm run build  # (from repository root)
   ```

2. Start the server:
   ```bash
   npm start  # (from repository root)
   ```

3. Access web UI at http://localhost:10110

### How It Works

The server automatically serves static files from `packages/web/dist`:

- **Static assets** (`/assets/*`): Cached for 1 year (content-hashed filenames)
- **index.html**: Never cached (contains references to current assets)
- **SPA routing**: All non-`/api` routes fall back to `index.html` for client-side routing
- **API routes**: Remain under `/api` prefix

### Architecture

```
http://localhost:10110/
├── /api/*           → API endpoints (from routes)
├── /assets/*        → Static assets (JS, CSS, images)
├── /icons.svg       → Static files from web/dist
├── /favicon.svg     → Static files from web/dist
└── /* (other)       → index.html (SPA fallback)
```

This merged deployment:
- ✅ Simplifies deployment (single process)
- ✅ Eliminates CORS complexity (same origin)
- ✅ Reduces infrastructure requirements
- ✅ Maintains development flexibility (separate processes still available)

### Separate Deployment Option

For CDN/static hosting scenarios:

1. Deploy `packages/web/dist/*` to static hosting (Netlify, Vercel, S3, etc.)
2. Run `packages/server/dist/index.js` on server infrastructure
3. Configure environment variables:
   ```bash
   # Web .env.production
   VITE_DETERMINANT_SERVER_URL=https://api.example.com
   
   # Server environment
   ALLOWED_ORIGINS=https://myapp.example.com,https://cdn.example.com
   ```

See `packages/web/README.md` for web deployment details.

## Configuration

Configure via environment variables:

- `PORT` - Server port (default: 10110)
- `DB_PATH` - Database file path (default: ./determinant.db)
- `ALLOWED_ORIGINS` - Comma-separated CORS origins (default: http://localhost:5173)
  - For merged deployment: Not required (same-origin policy applies)
  - For separate deployment: Set to web application domain(s)
- `DETERMINANT_API_KEY` - Optional API key for authentication

## API Endpoints

All endpoints are prefixed with `/api`.

### Authentication

If `DETERMINANT_API_KEY` is set, all requests require the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-key-here" http://localhost:10110/api/health
```

### Tasks

#### `GET /api/tasks`
List all tasks, optionally filtered by state.

**Query params:**
- `state` (optional): Filter by task state (Proposal, Questions, Research, Plan, Implement, Validate, Released)

**Response:**
```json
{
  "tasks": [
    {
      "id": "01HZXXX...",
      "title": "Build API",
      "description": "...",
      "state": "Proposal",
      "priority": 3,
      "manualWeight": 0,
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ]
}
```

#### `POST /api/tasks`
Create a new task.

**Request body:**
```json
{
  "title": "Task title",
  "description": "Optional description",
  "priority": 3
}
```

**Response:** `201 Created`
```json
{
  "task": { /* task object */ }
}
```

#### `GET /api/tasks/:id`
Get task details with all workflow nodes.

**Response:**
```json
{
  "task": { /* task object */ },
  "nodes": [
    {
      "id": "01HZXXX...",
      "taskId": "01HZXXX...",
      "parentId": null,
      "fromState": "Proposal",
      "toState": "Plan",
      "content": "...",
      "confidence": 8,
      "createdAt": 1234567890
    }
  ]
}
```

#### `PATCH /api/tasks/:id/state`
Update task state.

**Request body:**
```json
{
  "state": "Plan"
}
```

**Response:**
```json
{
  "task": { /* updated task */ }
}
```

#### `PATCH /api/tasks/:id/priority`
Update task priority (1-5).

**Request body:**
```json
{
  "priority": 2
}
```

**Response:**
```json
{
  "task": { /* updated task */ }
}
```

### Queue

#### `GET /api/queue/:state`
Get priority queue for a given state.

**Query params:**
- `limit` (optional): Max items to return (default: 10)

**Response:**
```json
{
  "state": "Proposal",
  "items": [
    {
      "taskId": "01HZXXX...",
      "score": 15.5,
      "title": "Build API",
      "priority": 2,
      "confidence": 8,
      "manualWeight": 0
    }
  ]
}
```

### Claims

#### `POST /api/claims`
Claim a task for processing.

**Request body:**
```json
{
  "taskId": "01HZXXX...",
  "ttlMinutes": 30
}
```

**Response:** `201 Created`
```json
{
  "claim": {
    "id": "01HZXXX...",
    "taskId": "01HZXXX...",
    "expiresAt": 1234567890
  }
}
```

**Error:** `409 Conflict` if task is already claimed.

#### `DELETE /api/claims/:id`
Release a claim.

**Response:** `204 No Content`

#### `POST /api/claims/:id/renew`
Renew a claim's TTL.

**Request body:**
```json
{
  "ttlMinutes": 30
}
```

**Response:**
```json
{
  "claim": { /* updated claim */ }
}
```

#### `POST /api/claims/cleanup`
Clean up expired claims.

**Response:**
```json
{
  "cleaned": 3
}
```

### Heap Configuration

#### `GET /api/heap-config`
Get current heap weight configuration.

**Response:**
```json
{
  "config": {
    "priorityWeight": 0.5,
    "confidenceWeight": 0.5,
    "manualWeight": 0.0
  }
}
```

#### `PATCH /api/heap-config`
Update heap weights.

**Request body:**
```json
{
  "priorityWeight": 0.7,
  "confidenceWeight": 0.3,
  "manualWeight": 0.0
}
```

**Response:**
```json
{
  "config": { /* updated config */ }
}
```

## Real-Time Updates (Planned Feature)

> **Note:** This feature is planned but not yet implemented. The web UI currently uses polling (5s for task lists, 3s for individual tasks).

### Planned SSE Endpoint

**Endpoint:** `GET /api/events`

**Purpose:** Server-sent events for real-time task updates without polling.

**Event Types:**

#### `task:created`
Emitted when a new task is created.

```json
{
  "type": "task:created",
  "data": {
    "task": {
      "id": "01HZXXX...",
      "title": "New task",
      "state": "Proposal",
      "priority": 3
    }
  }
}
```

#### `task:updated`
Emitted when a task is modified (state, priority, etc.).

```json
{
  "type": "task:updated",
  "data": {
    "task": { /* updated task object */ },
    "changes": ["state", "priority"]
  }
}
```

#### `task:deleted`
Emitted when a task is deleted.

```json
{
  "type": "task:deleted",
  "data": {
    "taskId": "01HZXXX..."
  }
}
```

#### `queue:updated`
Emitted when the priority queue changes.

```json
{
  "type": "queue:updated",
  "data": {
    "state": "Proposal",
    "queue": [
      {
        "taskId": "01HZXXX...",
        "score": 15.5,
        "title": "Task title"
      }
    ]
  }
}
```

### Client Usage (Future)

```typescript
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('task:created', (event) => {
  const { task } = JSON.parse(event.data);
  // Update UI with new task
});

eventSource.addEventListener('task:updated', (event) => {
  const { task } = JSON.parse(event.data);
  // Update UI with modified task
});
```

### Migration Path

1. **Phase 1** (current): Polling-based updates
2. **Phase 2**: Implement SSE endpoint on server
3. **Phase 3**: Update web client to use SSE
4. **Phase 4**: Remove polling or use as fallback for older browsers

## Database Schema

See the main README for database schema details.

## License

MIT
