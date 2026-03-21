# Clawible Bridge v2

**BYOA (Bring Your Own Agent)** - A clean, adapter-based bridge for connecting Clawible to various AI agents.

## Architecture

```
┌─────────────────────────────────────────────┐
│               Clawible Web                   │
└──────────────────┬──────────────────────────┘
                   │ HTTP
                   ▼
┌─────────────────────────────────────────────┐
│            Clawible Bridge v2                │
│  ┌─────────────────────────────────────┐    │
│  │         TaskManager                  │    │
│  │  - Task lifecycle management         │    │
│  │  - State isolation per task          │    │
│  │  - Adapter orchestration             │    │
│  └─────────────────────────────────────┘    │
│                    │                         │
│     ┌──────────────┼──────────────┬─────┐   │
│     ▼              ▼              ▼     ▼   │
│  ┌────────┐  ┌──────────┐  ┌──────┐  ┌───┐ │
│  │OpenClaw│  │ClaudeCode│  │Codex │  │...│ │
│  └────────┘  └──────────┘  └──────┘  └───┘ │
└─────────────────────────────────────────────┘
```

## Key Differences from v1

1. **Clean task isolation** - Each task gets its own context, no bleeding between requests
2. **No channel awareness** - Bridge doesn't know about WhatsApp/Telegram/etc
3. **Pluggable adapters** - Easy to add new agent backends
4. **Proper state management** - Task lifecycle tracked cleanly

## Available Adapters

| Adapter | Description | Capabilities |
|---------|-------------|--------------|
| `openclaw` | OpenClaw agents (Bob, Ruby, Django, etc.) | coding, planning, chat, tools, browser |
| `claude-code` | Anthropic's Claude Code CLI | coding, file-access, shell |
| `codex` | OpenAI Codex CLI | coding, file-access, shell |
| `ollama` | Local Ollama models | chat, coding |
| `raw-api` | Direct Anthropic/OpenAI API calls | chat |

## API

### Create a Task

```bash
POST /tasks
{
  "adapter": "openclaw",
  "task": "Build a React component for user authentication",
  "context": {
    "projectPath": "/path/to/project",
    "systemPrompt": "You are a senior React developer...",
    "files": {
      "src/App.tsx": "// existing code..."
    }
  },
  "options": {
    "agentId": "ruby-santos",
    "model": "claude-sonnet-4-5",
    "timeout": 180
  }
}
```

### Get Task Status

```bash
GET /tasks/:id
```

### List Tasks

```bash
GET /tasks?status=running&adapter=openclaw&limit=10
```

### Cancel Task

```bash
PATCH /tasks/:id
{
  "action": "cancel"
}
```

### List Adapters

```bash
GET /adapters
```

## Legacy v1 Compatibility

The bridge includes v1-compatible endpoints for gradual migration:

- `POST /send` → Creates task with auto-inferred adapter
- `GET /status/:id` → Returns v1 format
- `GET /pending` → Lists pending/running tasks
- `POST /complete/:id` → Manual task completion

## Running

```bash
npm install
npm start
# or for development:
npm run dev
```

Default port: 3032 (different from v1's 3031 for side-by-side testing)

## Environment Variables

- `BRIDGE_PORT` - HTTP port (default: 3032)
- `ANTHROPIC_API_KEY` - For raw-api adapter (Anthropic)
- `OPENAI_API_KEY` - For raw-api adapter (OpenAI)
- `OLLAMA_HOST` - Ollama server URL (default: http://localhost:11434)

## Adding New Adapters

1. Create `src/adapters/your-adapter.js`
2. Extend `BaseAdapter` from `./base.js`
3. Implement `execute(context, options)`
4. Register in `src/task-manager.js`

See `src/adapters/base.js` for the interface specification.
