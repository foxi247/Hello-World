import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '../../data/world.db');

// Создаём папку для БД если её нет
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(DB_PATH);

// WAL mode для лучшей производительности
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// Schema
// ============================================================
export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS world_state (
      id       INTEGER PRIMARY KEY CHECK (id = 1),
      data     TEXT NOT NULL,
      updated  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS character_state (
      id       INTEGER PRIMARY KEY CHECK (id = 1),
      data     TEXT NOT NULL,
      updated  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS memories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tick      INTEGER NOT NULL,
      summary   TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 1,
      created   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      role      TEXT NOT NULL CHECK (role IN ('user','character')),
      content   TEXT NOT NULL,
      tick      INTEGER NOT NULL DEFAULT 0,
      created   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      tick      INTEGER NOT NULL,
      type      TEXT NOT NULL,
      message   TEXT NOT NULL,
      created   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  console.log('[DB] Database initialized at', DB_PATH);
}

// ============================================================
// World state persistence
// ============================================================
export function saveWorldState(data: object): void {
  const stmt = db.prepare(`
    INSERT INTO world_state (id, data, updated)
    VALUES (1, ?, strftime('%s','now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated
  `);
  stmt.run(JSON.stringify(data));
}

export function loadWorldState(): object | null {
  const row = db.prepare('SELECT data FROM world_state WHERE id = 1').get() as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

export function saveCharacterState(data: object): void {
  const stmt = db.prepare(`
    INSERT INTO character_state (id, data, updated)
    VALUES (1, ?, strftime('%s','now'))
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated = excluded.updated
  `);
  stmt.run(JSON.stringify(data));
}

export function loadCharacterState(): object | null {
  const row = db.prepare('SELECT data FROM character_state WHERE id = 1').get() as { data: string } | undefined;
  return row ? JSON.parse(row.data) : null;
}

// ============================================================
// Memories
// ============================================================
export function addMemory(tick: number, summary: string, importance = 1): void {
  db.prepare('INSERT INTO memories (tick, summary, importance) VALUES (?, ?, ?)').run(tick, summary, importance);
}

export function getRecentMemories(limit = 10): Array<{ tick: number; summary: string; importance: number }> {
  return db.prepare('SELECT tick, summary, importance FROM memories ORDER BY id DESC LIMIT ?').all(limit) as Array<{ tick: number; summary: string; importance: number }>;
}

export function getMemoryCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number };
  return row.c;
}

// ============================================================
// Chat history
// ============================================================
export function saveChatMessage(role: 'user' | 'character', content: string, tick: number): void {
  db.prepare('INSERT INTO chat_history (role, content, tick) VALUES (?, ?, ?)').run(role, content, tick);
}

export function getRecentChat(limit = 20): Array<{ role: string; content: string; tick: number }> {
  return db.prepare(
    'SELECT role, content, tick FROM chat_history ORDER BY id DESC LIMIT ?'
  ).all(limit).reverse() as Array<{ role: string; content: string; tick: number }>;
}

// ============================================================
// Events
// ============================================================
export function saveEvent(tick: number, type: string, message: string): void {
  db.prepare('INSERT INTO events (tick, type, message) VALUES (?, ?, ?)').run(tick, type, message);
}

export function getRecentEvents(limit = 50): Array<{ tick: number; type: string; message: string }> {
  return db.prepare(
    'SELECT tick, type, message FROM events ORDER BY id DESC LIMIT ?'
  ).all(limit).reverse() as Array<{ tick: number; type: string; message: string }>;
}
