# Determinant Architecture

> **Visual documentation of the Determinant system**
> 
> This document provides mermaid diagrams illustrating the architecture, workflow, data models, and interaction patterns of the Determinant task management system.

## About These Diagrams

These diagrams are generated using [Mermaid](https://mermaid.js.org/), which renders in GitHub, most markdown viewers, and many IDEs. If your viewer doesn't support mermaid, you can:
- View on GitHub (native support)
- Use the [Mermaid Live Editor](https://mermaid.live/) to paste and render
- Install a mermaid preview plugin for your editor

## System Overview

Determinant is an agentic workflow pipeline with task prioritization and confidence scoring. Tasks progress through a linear workflow with stage-specific artifacts, while a configurable priority queue determines processing order.

**Key Characteristics:**
- Linear workflow with repair loops
- Confidence-based prioritization
- Parent-child node progression tracking
- Real-time updates via Server-Sent Events
- Dependency-aware task scheduling

## Quick Reference
- [System Architecture](#system-architecture) - Component relationships
- [Workflow State Machine](#workflow-state-machine) - Task progression
- [Database Schema](#database-schema) - Data models and relationships
- [Data Flow](#data-flow) - API interaction sequences

---

## System Architecture

```mermaid
graph TB
    subgraph "Client Applications"
        CLI["@determinant/client<br/>CLI Tool"]
        WEB["@determinant/web<br/>React Dashboard"]
    end
    
    subgraph "Core Server"
        API["@determinant/server<br/>Express API"]
        DB[(SQLite Database<br/>determinant.db)]
        HEAP[Priority Heap<br/>Queue System]
        EVENTS[SSE Event<br/>Broadcaster]
    end
    
    TYPES["@determinant/types<br/>Shared Types"]
    TOOLS["@determinant/tools<br/>Utilities"]
    
    CLI -->|HTTP REST| API
    WEB -->|HTTP REST| API
    WEB -->|SSE Stream| EVENTS
    
    API --> DB
    API --> HEAP
    API --> EVENTS
    
    HEAP --> DB
    
    CLI -.->|imports| TYPES
    WEB -.->|imports| TYPES
    API -.->|imports| TYPES
    
    CLI -.->|imports| TOOLS
    API -.->|imports| TOOLS
    
    style CLI fill:#e1f5ff
    style WEB fill:#e1f5ff
    style API fill:#ffe1e1
    style DB fill:#fff4e1
    style TYPES fill:#e8e8e8
    style TOOLS fill:#e8e8e8
```

### System Components

**Client Layer:**
- **CLI** - Command-line interface for task management and processing
- **Web Dashboard** - Real-time React application for visualization

**Server Layer:**
- **Express API** - REST endpoints for CRUD operations
- **Priority Heap** - Configurable task prioritization queue
- **SSE Broadcaster** - Real-time event streaming to clients
- **SQLite Database** - Persistent storage with WAL mode

**Shared Packages:**
- **Types** - TypeScript definitions shared across packages
- **Tools** - Common utilities

**Communication:**
- REST API: Client ↔ Server operations
- SSE: Server → Clients for real-time updates

---

## Workflow State Machine

```mermaid
stateDiagram-v2
    [*] --> Proposal: Task Created<br/>(auto-creates Proposal node)
    
    Proposal --> Questions: Agent processes<br/>(confidence: 1-10)
    Questions --> Research
    Research --> Plan
    Plan --> Implement
    Implement --> Validate
    
    Validate --> Released: Validation passes
    Validate --> Plan: Validation fails<br/>(repair loop)
    
    Released --> [*]
    
    note right of Proposal
        Initial node auto-created
        from_stage = NULL
        to_stage = 'Proposal'
    end note
    
    note right of Validate
        Can branch to:
        - Released (success)
        - Plan (repair needed)
    end note
```

### Workflow Stages

Tasks progress linearly through 7 stages, with each stage producing a markdown artifact:

1. **Proposal** - Initial task definition (auto-created)
2. **Questions** - Identify knowledge gaps
3. **Research** - Answer questions and gather context
4. **Plan** - Create implementation plan
5. **Implement** - Execute the plan
6. **Validate** - Verify implementation
7. **Released** - Task complete

**Repair Loop:**
When validation fails, the agent can create a new node transitioning from Validate → Plan, creating a repair cycle that repeats until validation passes.

**Confidence Scoring:**
At each transition, agents assign confidence scores (1-10):
- `confidence_before`: Initial confidence before starting work
- `confidence_after`: Final confidence after completing work

---

## Database Schema

```mermaid
erDiagram
    tasks ||--o{ nodes : "has many"
    nodes ||--o| nodes : "parent of"
    tasks ||--o| tasks : "depends on"
    
    tasks {
        TEXT id PK "ULID"
        TEXT vibe "Task description"
        TEXT pins "JSON array"
        TEXT hints "JSON array"
        TEXT state "Proposal|Questions|..."
        INTEGER priority "1-5 (1=highest)"
        INTEGER manual_weight "Human override"
        TEXT working_dir "Execution directory"
        TEXT depends_on_task_id FK "Task dependency"
        TEXT created_at
        TEXT updated_at
    }
    
    nodes {
        TEXT id PK "ULID"
        TEXT task_id FK "CASCADE delete"
        TEXT parent_node_id FK "SET NULL"
        TEXT from_stage "Nullable (NULL for initial)"
        TEXT to_stage "Target stage"
        TEXT content "Markdown artifact"
        INTEGER confidence_before "1-10"
        INTEGER confidence_after "1-10"
        TEXT created_at
        TEXT processed_at "NULL until claimed"
    }
```

### Database Tables

**tasks**
- Primary entity representing a task in the system
- `state` matches the current stage the task is in
- `priority` (1-5) affects queue ranking (1 = highest priority)
- `depends_on_task_id` creates dependency chains (circular dependencies blocked)

**nodes**
- Represents a stage transition with its artifact
- Each node has a parent-child relationship for tracking progression
- Initial Proposal node has `from_stage = NULL`
- `processed_at` is NULL until an agent claims and processes the node
- Repair loops create new nodes: `parent_node_id` points to failed Validate node

**Key Relationships:**
- One task → Many nodes (entire progression history)
- One node → One parent node (forms tree structure)
- One task → One dependency task (optional)

**Indexes:**
- idx_nodes_task_id, idx_nodes_parent, idx_nodes_processed_at
- idx_tasks_state, idx_tasks_depends_on

---

## Data Flow

```mermaid
sequenceDiagram
    participant CLI as CLI/Web Client
    participant API as Express API
    participant DB as SQLite Database
    participant HEAP as Priority Heap
    participant SSE as SSE Broadcaster
    
    Note over CLI,SSE: Task Creation Flow
    CLI->>API: POST /api/tasks {vibe, pins, hints}
    API->>DB: INSERT task + auto-create Proposal node
    DB-->>API: Task created
    API->>HEAP: Rebuild queue
    API->>SSE: Emit task:created, node:created
    SSE-->>CLI: Event stream updates
    API-->>CLI: 201 Created {task}
    
    Note over CLI,SSE: Queue Processing Flow
    CLI->>API: GET /api/queue?limit=10
    API->>HEAP: getTopTasks(limit)
    HEAP->>DB: Query unprocessed nodes + calculate scores
    DB-->>HEAP: Ranked nodes
    HEAP-->>API: Priority-sorted queue
    API-->>CLI: 200 OK [{queueItems}]
    
    Note over CLI,SSE: Node Processing Flow
    CLI->>API: POST /api/nodes/:id/process {content, confidence}
    API->>DB: UPDATE node SET processed_at, confidence_after
    API->>DB: INSERT new node (next stage transition)
    API->>DB: UPDATE task SET state
    DB-->>API: Node processed
    API->>HEAP: Rebuild queue
    API->>SSE: Emit node:processed, node:created, queue:updated
    SSE-->>CLI: Event stream updates
    API-->>CLI: 200 OK {node}
```

### Typical Interaction Flows

**Task Creation:**
1. Client sends task details (vibe, pins, hints) to API
2. Server creates task + auto-generates initial Proposal node
3. Priority heap rebuilds queue
4. SSE broadcasts events to all connected clients
5. Node enters queue for processing

**Queue Retrieval:**
1. Client requests priority queue
2. Heap queries unprocessed nodes from database
3. Applies scoring formula: `priorityWeight × (6-priority) + confidenceWeight × confidence + manualWeight × manual`
4. Returns top N ranked nodes

**Node Processing:**
1. Client claims a node and processes it
2. Updates node with artifact content and confidence scores
3. Creates new node for next stage transition
4. Updates task state to match new node's to_stage
5. Heap rebuilds queue, SSE broadcasts updates
6. New node enters queue for next agent

**Real-time Updates:**
- SSE connection streams events: `task:created`, `task:updated`, `node:created`, `node:processed`, `queue:updated`
- Web dashboard receives updates without polling
- Max 1000 concurrent SSE connections
