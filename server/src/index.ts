import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
// Load .env from server/ first, then fall back to parent dir
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Ensure data directory exists (needed for SQLite on Railway/Render)
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

import { initDatabase } from './db/database';
import { WorldManager } from './game/world';
import { Simulation } from './game/simulation';
import { WSHandler } from './websocket/handler';
import { createApiRouter } from './routes/api';

// ============================================================
// Boot checks
// ============================================================
if (!process.env.MISTRAL_API_KEY) {
  console.warn('⚠️  MISTRAL_API_KEY is not set in .env');
  console.warn('   The character will use rule-based fallbacks instead of AI.');
  console.warn('   Copy .env.example to .env and add your key to enable AI.\n');
}

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ============================================================
// Initialize
// ============================================================
initDatabase();

const world = new WorldManager();
const app   = express();
const server = http.createServer(app);
const wss   = new WebSocketServer({ server });

// Allow any origin (needed for public tunnel access)
app.use(cors());
app.use(express.json());

// ============================================================
// Serve built frontend static files
// ============================================================
const STATIC_DIR = path.resolve(__dirname, '../../../../client/dist');
app.use(express.static(STATIC_DIR));

// ============================================================
// Create simulation and wire up callbacks
// ============================================================
let wsHandler: WSHandler;

const simulation = new Simulation(world, {
  onCharacterUpdate: () => wsHandler?.broadcastCharacterUpdate(),
  onNewEvent:        () => wsHandler?.broadcastNewEvents(),
  onThought:         (t) => wsHandler?.broadcastThought(t),
  onTileChanged:     (x, y) => wsHandler?.broadcastTileChanged(x, y),
  onDayPhase:        () => wsHandler?.broadcastDayPhase(),
});

wsHandler = new WSHandler(wss, simulation);

// ============================================================
// Routes
// ============================================================
app.use('/api', createApiRouter(world));

// SPA fallback — все не-API маршруты отдают index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ============================================================
// Start
// ============================================================
server.listen(PORT, () => {
  console.log(`\n🌿 AI World Sim Server running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Ping brain: http://localhost:${PORT}/api/ping-brain\n`);
  simulation.start();
});

// ============================================================
// Graceful shutdown
// ============================================================
function shutdown() {
  console.log('\n[Server] Shutting down...');
  simulation.stop();
  world.persist();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err);
  // Don't crash — log and continue
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
