# Local AI Hub

Beginner-friendly web UI to connect, manage, install, and chat with on-premise AI models (Ollama first; LM Studio / vLLM / OpenAI-compatible / LocalAI to follow).

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | Next.js 15 (App Router), React Query, Zustand, Tailwind, shadcn/ui |
| Backend  | Python (FastAPI), SQLAlchemy, Asyncio, python-socketio |
| Realtime | Socket.IO (python-socketio) + Redis |
| Data     | PostgreSQL |
| Infra    | Docker Compose |

## Repo layout

```
backend/     FastAPI + SQLAlchemy + python-socketio (Ported from Node.js)
frontend/    Next.js 15 App Router (Decoupled and self-contained)
infra/       Docker Compose files for database & Redis
```

## Getting started (local dev)

### 1. Run external services (PostgreSQL & Redis)
Ensure you have Docker running, then bring up the database and Redis services:
```bash
docker compose -f infra/compose/docker-compose.dev.yml up -d
```

### 2. Set up and run the Backend
```bash
cd backend

# Create virtual environment (if not already done)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the backend (runs on port 4000)
python run.py
```

### 3. Set up and run the Frontend
In a new terminal window:
```bash
cd frontend

# Install Node dependencies
npm install

# Run the frontend (runs on port 3000)
npm run dev
```

API: `http://localhost:4000`  •  Web: `http://localhost:3000`
