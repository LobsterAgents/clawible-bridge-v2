# Clawible Bridge v2 - Development Guide

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│               Clawible Web                   │
│         (React/Next.js Frontend)            │
└──────────────────┬──────────────────────────┘
                   │ HTTP (POST /tasks, GET /tasks/:id)
                   ▼
┌─────────────────────────────────────────────┐
│            Clawible Bridge v2                │
│  ┌─────────────────────────────────────┐    │
│  │         TaskManager                  │    │
│  │  - Task lifecycle (create/track)     │    │
│  │  - State isolation per task          │    │
│  │  - Adapter orchestration             │    │
│  └─────────────────────────────────────┘    │
│                    │                         │
│     ┌──────────────┼──────────────┬─────┐   │
│     ▼              ▼              ▼     ▼   │
│  ┌────────┐  ┌──────────┐  ┌──────┐  ┌───┐ │
│  │OpenClaw│  │ClaudeCode│  │Codex │  │...│ │
│  │Adapter │  │ Adapter  │  │Adapt.│  │   │ │
│  └────────┘  └──────────┘  └──────┘  └───┘ │
└─────────────────────────────────────────────┘
```

## Core Principles

### 1. Clean Isolation
Each task gets its own isolated context. No state bleeding between requests.

### 2. No Channel Awareness
The bridge does NOT know about WhatsApp, Telegram, Discord, etc. It just:
- Receives tasks
- Executes them via adapters
- Returns results

Clawible Web handles all channel routing.

### 3. Pluggable Adapters
Each adapter is independent. Adding a new agent backend should only require:
1. Creating `src/adapters/your-adapter.js`
2. Extending `BaseAdapter`
3. Registering in `task-manager.js`

---

## Adapter Interface

All adapters must implement:

```javascript
class YourAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'Human-readable description';
    this.capabilities = ['coding', 'chat', 'image-generation', ...];
  }
  
  isAvailable() {
    // Return true if this adapter can run (dependencies installed, API keys set, etc.)
    return true;
  }
  
  async execute(context, options) {
    // context: { task, projectPath, systemPrompt, files, onStatus, onProgress }
    // options: { model, timeout, agentId, ...adapter-specific }
    // Returns: string (the result/response)
  }
  
  async cancel(taskId) {
    // Optional: Cancel a running task
  }
}
```

---

## Model Override Handling

**Each adapter handles model selection differently:**

| Adapter | Model Override Method | Notes |
|---------|----------------------|-------|
| `openclaw` | Embedded in message context | Agent can call `session_status(model="...")` |
| `claude-code` | `--model` CLI flag | Direct support |
| `codex` | `--model` or `-m` CLI flag | Direct support |
| `gemini` | API parameter | Direct support |
| `ollama` | API `model` field | Direct support |
| `raw-api` | API `model` field | Direct support |

### OpenClaw Special Case
The `openclaw agent` CLI doesn't have a `--model` flag. Instead:
1. Model preference is embedded in the task message
2. The spawned agent can use `session_status(model="...")` to switch
3. Or the agent's config-level model is used

### Adding Model Support to New Adapters
When creating a new adapter:
1. Check if the CLI/API supports model selection
2. If CLI flag exists (like `--model`), pass it directly
3. If API-based, include in the request body
4. If neither works, embed in the prompt/context (like OpenClaw)

---

## Task Lifecycle

```
1. CREATE (POST /tasks)
   └─> TaskManager.createTask()
       └─> Validates adapter exists
       └─> Creates task record (status: 'pending')
       └─> Spawns async execution

2. EXECUTE (async)
   └─> TaskManager.executeTask()
       └─> Status: 'running'
       └─> Calls adapter.execute(context, options)
       └─> onStatus callbacks update statusHistory
       └─> On success: status: 'completed', result set
       └─> On failure: status: 'failed', error set

3. POLL (GET /tasks/:id)
   └─> Returns current task state
   └─> Client polls until status is 'completed' or 'failed'

4. CLEANUP (automatic)
   └─> Tasks older than 1 hour are removed from memory
```

---

## Context Object

The `context` passed to adapters:

```javascript
{
  task: string,           // The actual task/prompt
  projectPath: string,    // Working directory for the task
  systemPrompt: string,   // System-level instructions
  files: {                // Relevant files (optional)
    'path/to/file': 'content...'
  },
  onStatus: (message) => void,   // Status update callback
  onProgress: (percent, message) => void  // Progress callback
}
```

---

## Options Object

The `options` passed to adapters:

```javascript
{
  model: string,          // Model override (e.g., 'claude-sonnet-4-5')
  timeout: number,        // Timeout in seconds (default: 180)
  agentId: string,        // OpenClaw agent ID (default: 'main')
  // ... adapter-specific options
}
```

---

## Adding a New Adapter

### Step 1: Create the adapter file

```javascript
// src/adapters/my-agent.js
import { BaseAdapter } from './base.js';

export class MyAgentAdapter extends BaseAdapter {
  constructor() {
    super();
    this.description = 'My Agent - does awesome things';
    this.capabilities = ['coding', 'chat'];
  }
  
  isAvailable() {
    // Check if my-agent CLI is installed
    return true;
  }
  
  async execute(context, options = {}) {
    const { task, projectPath, systemPrompt, onStatus } = context;
    const { model, timeout = 180 } = options;
    
    onStatus?.('Starting My Agent...');
    
    // Your implementation here
    // Return the result as a string
    
    return 'Task completed!';
  }
}
```

### Step 2: Register in TaskManager

```javascript
// src/task-manager.js
import { MyAgentAdapter } from './adapters/my-agent.js';

// In constructor:
this.adapters = new Map([
  // ... existing adapters
  ['my-agent', new MyAgentAdapter()],
]);
```

### Step 3: Test

```bash
curl -X POST http://localhost:3032/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "my-agent",
    "task": "Hello world",
    "options": { "model": "my-model" }
  }'
```

---

## Error Handling

Adapters should throw errors with descriptive messages:

```javascript
throw new Error('My Agent: API key not set');
throw new Error('My Agent: Timeout after 180s');
throw new Error('My Agent: CLI exited with code 1: <stderr>');
```

The TaskManager catches these and sets:
- `task.status = 'failed'`
- `task.error = error.message`

---

## Environment Variables

| Variable | Used By | Description |
|----------|---------|-------------|
| `BRIDGE_PORT` | Server | HTTP port (default: 3032) |
| `ANTHROPIC_API_KEY` | raw-api | Anthropic API access |
| `OPENAI_API_KEY` | raw-api | OpenAI API access |
| `GEMINI_API_KEY` | gemini | Google Gemini API access |
| `OLLAMA_HOST` | ollama | Ollama server URL (default: localhost:11434) |
| `OPENCLAW_NO_ANNOUNCE` | openclaw | Set by adapter to prevent WhatsApp notifications |

---

## Legacy v1 Compatibility

The bridge includes v1-compatible endpoints for gradual migration:

| v1 Endpoint | v2 Equivalent |
|-------------|---------------|
| `POST /send` | `POST /tasks` (with auto-inference) |
| `GET /status/:id` | `GET /tasks/:id` |
| `PATCH /status/:id` | `PATCH /tasks/:id` |
| `GET /pending` | `GET /tasks?status=pending` |
| `POST /complete/:id` | Manual task completion |

---

## Testing

```bash
# Start the bridge
npm run dev  # or npm start

# Health check
curl http://localhost:3032/health

# List adapters
curl http://localhost:3032/adapters

# Create a task
curl -X POST http://localhost:3032/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "openclaw",
    "task": "List files in current directory",
    "context": { "projectPath": "/tmp" },
    "options": { "timeout": 60 }
  }'

# Poll for result
curl http://localhost:3032/tasks/<task_id>
```

---

## Common Issues

### "unknown option '--model'" (OpenClaw)
The `openclaw agent` CLI doesn't support `--model`. Model override is embedded in the message context instead.

### Timeout errors
Increase the `timeout` option. Default is 180s for OpenClaw, 300s for Claude Code/Codex.

### "API key not set"
Set the required environment variable for the adapter you're using.

### Tasks stuck in 'running'
Check if the underlying process is still alive. May need to manually kill stale processes.

---

## Future Improvements

- [ ] WebSocket streaming for real-time progress
- [ ] Task persistence (Redis/SQLite) for restart recovery
- [ ] Rate limiting per adapter
- [ ] Adapter health checks
- [ ] Metrics/telemetry
- [ ] Authentication for bridge API
