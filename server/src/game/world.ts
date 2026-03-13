import { v4 as uuidv4 } from 'uuid';
import type { WorldState, GameEvent, ChatMessage, CharacterState, NPCState, Invention } from '../../../shared/types';
import { buildInitialWorld, WORLD_WIDTH, WORLD_HEIGHT } from './worldMap';
import { createCharacter } from './character';
import {
  saveWorldState,
  loadWorldState,
  saveCharacterState,
  loadCharacterState,
  saveEvent,
  getRecentEvents,
  saveChatMessage,
  getRecentChat,
} from '../db/database';

// Day phases: 400 ticks per full day cycle
const DAY_CYCLE_TICKS = 400;

// ============================================================
// World manager — holds and manages the authoritative state
// ============================================================
export class WorldManager {
  private _state: WorldState;
  private _recentEventsBuffer: GameEvent[] = [];

  constructor() {
    this._state = this._loadOrCreate();
  }

  // ----------------------------------------------------------
  // Load from DB or create fresh
  // ----------------------------------------------------------
  private _loadOrCreate(): WorldState {
    const savedWorld = loadWorldState();
    const savedChar  = loadCharacterState();

    let tiles = buildInitialWorld();
    let character = createCharacter();

    if (savedWorld) {
      try {
        const w = savedWorld as Partial<WorldState>;
        if (w.tiles) tiles = w.tiles;
      } catch { /* ignore corrupt data */ }
    }

    if (savedChar) {
      try {
        character = savedChar as CharacterState;
      } catch { /* ignore */ }
    }

    // Restore recent events from DB
    const dbEvents = getRecentEvents(30);
    const recentEvents: GameEvent[] = dbEvents.map((e, i) => ({
      id: `evt-${i}`,
      tick: e.tick,
      type: e.type as GameEvent['type'],
      message: e.message,
      timestamp: Date.now() - (30 - i) * 1000,
    }));

    // Restore chat history
    const dbChat = getRecentChat(20);
    const chatHistory: ChatMessage[] = dbChat.map((c, i) => ({
      id: `chat-${i}`,
      role: c.role as ChatMessage['role'],
      content: c.content,
      timestamp: Date.now() - (20 - i) * 1000,
    }));

    const state: WorldState = {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      tiles,
      character,
      npcs: [],
      inventions: [],
      tick: character.tickAge,
      dayPhase: 'day',
      dayProgress: 0,
      recentEvents,
      chatHistory,
    };

    this._updateDayPhase(state);
    console.log('[World] Состояние загружено. Тик:', state.tick, 'Персонаж:', character.name);
    return state;
  }

  // ----------------------------------------------------------
  // Accessors
  // ----------------------------------------------------------
  get state(): WorldState { return this._state; }
  get character(): CharacterState { return this._state.character; }
  get tiles() { return this._state.tiles; }
  get tick(): number { return this._state.tick; }
  get npcs(): NPCState[] { return this._state.npcs; }
  get inventions(): Invention[] { return this._state.inventions; }

  // ----------------------------------------------------------
  // Advance tick
  // ----------------------------------------------------------
  advanceTick(): void {
    this._state.tick++;
    this._updateDayPhase(this._state);
  }

  private _updateDayPhase(state: WorldState): void {
    const t = state.tick % DAY_CYCLE_TICKS;
    const pct = (t / DAY_CYCLE_TICKS) * 100;

    if (pct < 10) {
      state.dayPhase = 'dawn';
      state.dayProgress = (pct / 10) * 100;
    } else if (pct < 60) {
      state.dayPhase = 'day';
      state.dayProgress = ((pct - 10) / 50) * 100;
    } else if (pct < 75) {
      state.dayPhase = 'dusk';
      state.dayProgress = ((pct - 60) / 15) * 100;
    } else {
      state.dayPhase = 'night';
      state.dayProgress = ((pct - 75) / 25) * 100;
    }
  }

  // ----------------------------------------------------------
  // Events
  // ----------------------------------------------------------
  addEvent(
    type: GameEvent['type'],
    message: string
  ): GameEvent {
    const event: GameEvent = {
      id: uuidv4(),
      tick: this._state.tick,
      type,
      message,
      timestamp: Date.now(),
    };

    this._state.recentEvents.push(event);
    if (this._state.recentEvents.length > 50) {
      this._state.recentEvents.shift();
    }

    this._recentEventsBuffer.push(event);

    // Persist
    saveEvent(this._state.tick, type, message);

    return event;
  }

  // Get and clear the buffer of new events since last call
  drainNewEvents(): GameEvent[] {
    const events = [...this._recentEventsBuffer];
    this._recentEventsBuffer = [];
    return events;
  }

  // ----------------------------------------------------------
  // Chat
  // ----------------------------------------------------------
  addChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
    const msg: ChatMessage = {
      id: uuidv4(),
      role,
      content,
      timestamp: Date.now(),
    };

    this._state.chatHistory.push(msg);
    if (this._state.chatHistory.length > 50) {
      this._state.chatHistory.shift();
    }

    // Persist
    saveChatMessage(role, content, this._state.tick);

    return msg;
  }

  getRecentChatRaw(): Array<{ role: string; content: string }> {
    return this._state.chatHistory.slice(-10).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  // ----------------------------------------------------------
  // Set character thought
  // ----------------------------------------------------------
  setThought(thought: string): void {
    this._state.character.currentThought = thought;
  }

  // ----------------------------------------------------------
  // NPCs
  // ----------------------------------------------------------
  addNPC(npc: NPCState): void {
    this._state.npcs.push(npc);
  }

  removeNPC(id: string): void {
    this._state.npcs = this._state.npcs.filter(n => n.id !== id);
  }

  // ----------------------------------------------------------
  // Inventions
  // ----------------------------------------------------------
  addInvention(invention: Invention): void {
    this._state.inventions.push(invention);
  }

  getInventionNames(): string[] {
    return this._state.inventions.map(i => i.name);
  }

  // ----------------------------------------------------------
  // Persist
  // ----------------------------------------------------------
  persist(): void {
    try {
      saveWorldState({
        tiles: this._state.tiles,
        tick: this._state.tick,
        npcs: this._state.npcs,
        inventions: this._state.inventions,
      });
      saveCharacterState(this._state.character);
    } catch (err) {
      console.error('[World] Ошибка сохранения:', err);
    }
  }

  // ----------------------------------------------------------
  // Get a snapshot safe to send to clients
  // ----------------------------------------------------------
  getSnapshot(): WorldState {
    return JSON.parse(JSON.stringify(this._state)) as WorldState;
  }
}
