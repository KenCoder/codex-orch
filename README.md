# Codex Orchestrator

A resilient multi-conversation Claude orchestrator with:

- **Node backend** for projects, isolated conversation session directories, setup script execution, message persistence, and assistant turns.
- **React + ShadCN-style UI** for professional conversation management.
- **Unreliable network support** via client-side outbox queue + idempotent message API.
- **Notifications** when background conversations become ready.

## Quick start

```bash
npm install
npm run dev
```

- API: `http://localhost:4000`
- UI: `http://localhost:5173`

## Environment

- Optional `ANTHROPIC_API_KEY` to use real Claude responses.
- Without API key, backend uses mock assistant replies for local development.

## How it works

1. Create a project with a Python setup script path and base directory.
2. Launch conversation from that project.
3. Backend creates a dedicated `.session-<id>` folder and runs setup script inside it once.
4. Messages are stored persistently in `server-data/db.json`.
5. UI sends optimistic messages into an outbox; dropped networks retry automatically.
