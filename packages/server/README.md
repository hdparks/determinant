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

## Configuration

Configure via environment variables:

- `PORT` - Server port (default: 10110)
- `DB_PATH` - Database file path (default: ./determinant.db)
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

## Database Schema

See the main README for database schema details.

## License

MIT
