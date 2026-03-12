# 🌿 Alder's World — AI Character Simulation

A locally-runnable 2D world simulation with an autonomous AI character whose brain runs on **Mistral Large API**.

**Alder** is a young person living alone in a small forest clearing. He gathers resources, builds shelter, satisfies his needs, and thinks his own thoughts — all driven by a mix of deterministic game logic and LLM reasoning.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  CLIENT (React + Vite + Phaser 3)                   │
│  ├── WorldScene.ts     — 2D tile rendering           │
│  ├── App.tsx           — main layout                 │
│  ├── Chat.tsx          — player ↔ character chat     │
│  ├── StatusPanel.tsx   — needs / inventory / time    │
│  ├── ThoughtBubble.tsx — character's inner thoughts  │
│  └── EventLog.tsx      — action/thought feed         │
└────────────────── WebSocket ────────────────────────┘
┌─────────────────────────────────────────────────────┐
│  SERVER (Node.js + Express + ws)                    │
│  ├── simulation.ts     — game loop (1s tick)         │
│  ├── world.ts          — world state manager         │
│  ├── character.ts      — needs, inventory, actions   │
│  ├── actions.ts        — action execution logic      │
│  ├── mind.ts           — LLM reasoning layer         │
│  ├── mistral.ts        — Mistral API adapter         │
│  ├── prompts.ts        — all character prompts       │
│  └── database.ts       — SQLite persistence          │
└─────────────────────────────────────────────────────┘
```

**What runs on LLM vs deterministic code:**

| LLM (Mistral)              | Deterministic code              |
|----------------------------|---------------------------------|
| Internal thoughts          | Movement / pathfinding          |
| High-level intent selection | Need decay / recovery          |
| Chat responses             | Resource collection             |
| Memory summarization       | Building progression            |
|                            | Fallback when API is down       |

---

## Deploy to Railway (recommended for public access)

Railway supports WebSockets + SQLite + long-running processes — perfect for this project.

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select the repository
4. Add environment variable: `MISTRAL_API_KEY=your_key`
5. Railway auto-detects `nixpacks.toml` and builds everything
6. Get your public URL from the Railway dashboard

The `nixpacks.toml` at the root handles the full build + start automatically.

---

## Prerequisites (local run)

- Node.js 18+
- npm 9+
- A [Mistral AI API key](https://console.mistral.ai/) *(optional — app works without it using rule-based fallbacks)*

---

## Quick Start

```bash
# 1. Clone / enter directory
cd Hello-World

# 2. Copy env and add your key
cp .env.example .env
# Edit .env and set MISTRAL_API_KEY=your_key_here

# 3. Install all dependencies
npm run install:all

# 4. (Optional) Run smoke test
npm run test:smoke

# 5. Start everything
npm run dev
```

Open **http://localhost:3000** — you should see Alder's world.

---

## Environment Variables

```env
MISTRAL_API_KEY=your_key_here     # Required for AI brain
MISTRAL_MODEL=mistral-large-latest # Model to use
PORT=3001                          # Server port
AI_THINK_INTERVAL=20               # Seconds between intent selections
AI_THOUGHT_INTERVAL=15             # Seconds between thought generation
```

---

## Smoke Test

Tests environment, SQLite, world generation, and Mistral API connectivity:

```bash
cd server
npm run test:smoke
```

Or from root:

```bash
npm run test:smoke
```

---

## Project Structure

```
Hello-World/
├── client/               # React + Vite + Phaser frontend
│   └── src/
│       ├── game/
│       │   ├── scenes/WorldScene.ts   # Phaser 2D rendering
│       │   └── PhaserGame.tsx         # React ↔ Phaser bridge
│       ├── components/   # UI components
│       ├── hooks/        # WebSocket hook
│       └── types/        # Type re-exports
├── server/               # Node.js + Express backend
│   └── src/
│       ├── ai/           # Mistral adapter + prompts + mind
│       ├── db/           # SQLite setup
│       ├── game/         # World, character, simulation, actions
│       ├── routes/       # REST API
│       └── websocket/    # WS handler
├── shared/
│   └── types.ts          # Types shared between client and server
├── .env.example
└── README.md
```

---

## API Endpoints

| Method | Path               | Description                |
|--------|--------------------|----------------------------|
| GET    | /api/health        | Server health check        |
| GET    | /api/ping-brain    | Test Mistral API connection |
| GET    | /api/state         | Full world state JSON       |
| GET    | /api/character     | Character state JSON        |

---

## How Alder Works

1. **Game loop** runs every 1 second on the server
2. **Needs** (hunger, energy, mood, comfort) decay over time
3. Every **~20 seconds**, LLM selects Alder's next high-level intent
4. Every **~15 seconds**, LLM generates an internal thought
5. **Urgent needs** override LLM intent (hunger < 20 → eat, energy < 15 → rest)
6. Player chat triggers immediate LLM response
7. State persists to **SQLite** every 30 seconds
8. Memories are **summarized** periodically into long-term storage

---

## Character Personality

**Alder** is a quiet, observant, resourceful young person. He lives in his clearing as his entire reality — he doesn't know of any outside world. He speaks plainly and warmly, gets anxious when hungry or tired, and finds meaning in small things.

He refers to the player as "the Voice" or "that presence" — he's grown used to it, finds it somewhat comforting.

---

## Troubleshooting

**Server won't start:**
```bash
cd server && npm install
```

**Client won't start:**
```bash
cd client && npm install
```

**Alder doesn't respond intelligently:**
Check that `MISTRAL_API_KEY` is set in `.env`. Run `npm run test:smoke` to verify.

**Database errors:**
The SQLite file is at `server/data/world.db`. Delete it to reset the world:
```bash
rm server/data/world.db
```
