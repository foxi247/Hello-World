import { WorldManager } from './world';
import { startAction, progressAction } from './actions';
import {
  decayNeeds,
  updateComfort,
  isNearHome,
  detectUrgentNeed,
  getAvailableActions,
  canBuild,
} from './character';
import { generateThought, selectIntent, summarizeIntoMemory } from '../ai/mind';
import type { ActionType } from '../../../shared/types';

// ============================================================
// Simulation configuration
// ============================================================
const TICK_INTERVAL_MS = 1000;         // 1 second per tick
const AI_THINK_INTERVAL  = parseInt(process.env.AI_THINK_INTERVAL  ?? '20');
const AI_THOUGHT_INTERVAL = parseInt(process.env.AI_THOUGHT_INTERVAL ?? '15');
const PERSIST_INTERVAL = 30;            // persist every 30 ticks
const MEMORY_SUMMARIZE_INTERVAL = 60;   // summarize memories every 60 ticks

// ============================================================
// Callbacks to notify the WebSocket layer
// ============================================================
export type SimulationCallbacks = {
  onCharacterUpdate: () => void;
  onNewEvent: () => void;
  onThought: (thought: string) => void;
  onTileChanged: (x: number, y: number) => void;
  onDayPhase: () => void;
};

// ============================================================
// Simulation class
// ============================================================
export class Simulation {
  private _world: WorldManager;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _callbacks: SimulationCallbacks;
  private _aiThinkBusy = false;
  private _thoughtBusy  = false;
  private _pendingIntentAction: ActionType | null = null;
  private _ticksSinceLastIntent = 0;
  private _ticksSinceLastThought = 0;
  private _recentEventMessages: string[] = [];

  constructor(world: WorldManager, callbacks: SimulationCallbacks) {
    this._world = world;
    this._callbacks = callbacks;
  }

  start(): void {
    if (this._timer) return;
    console.log('[Simulation] Starting loop, tick interval:', TICK_INTERVAL_MS, 'ms');
    this._timer = setInterval(() => this._tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ----------------------------------------------------------
  // Main tick
  // ----------------------------------------------------------
  private async _tick(): Promise<void> {
    const char = this._world.character;
    const tiles = this._world.tiles;

    // 1. Advance time
    this._world.advanceTick();
    this._ticksSinceLastIntent++;
    this._ticksSinceLastThought++;

    // 2. Decay needs
    decayNeeds(char);
    updateComfort(char, isNearHome(char));

    // 3. Process current action
    if (char.currentAction === 'IDLE' || char.currentAction === 'MOVE_TO') {
      // Start a new action
      this._startNewAction();
    } else {
      const result = progressAction(char, tiles);

      if (result.tileChanged) {
        this._callbacks.onTileChanged(result.tileChanged.x, result.tileChanged.y);
      }

      if (result.completed) {
        if (result.eventMessage) {
          this._world.addEvent('action', result.eventMessage);
          this._recentEventMessages.push(result.eventMessage);
          this._callbacks.onNewEvent();
        }
        char.currentAction = 'IDLE';
        char.actionProgress = 0;
        char.targetPosition = null;
      }
    }

    this._callbacks.onCharacterUpdate();

    // 4. Periodic thought generation (non-blocking)
    if (this._ticksSinceLastThought >= AI_THOUGHT_INTERVAL && !this._thoughtBusy) {
      this._ticksSinceLastThought = 0;
      this._generateThought();
    }

    // 5. Periodic intent selection (non-blocking)
    if (this._ticksSinceLastIntent >= AI_THINK_INTERVAL && !this._aiThinkBusy) {
      this._ticksSinceLastIntent = 0;
      this._selectNextIntent();
    }

    // 6. Persist periodically
    if (this._world.tick % PERSIST_INTERVAL === 0) {
      this._world.persist();
    }

    // 7. Memory summarization
    if (this._world.tick % MEMORY_SUMMARIZE_INTERVAL === 0 && this._recentEventMessages.length > 3) {
      const events = [...this._recentEventMessages];
      this._recentEventMessages = [];
      summarizeIntoMemory(char, events, this._world.tick).catch(console.error);
    }

    // 8. Day phase change notification
    if (this._world.tick % 5 === 0) {
      this._callbacks.onDayPhase();
    }
  }

  // ----------------------------------------------------------
  // Start a new action — uses pending intent or picks sensible default
  // ----------------------------------------------------------
  private _startNewAction(): void {
    const char = this._world.character;
    const tiles = this._world.tiles;

    // Check urgent needs first (these override AI intent)
    const urgent = detectUrgentNeed(char);
    let nextAction: ActionType = 'WANDER';

    if (urgent) {
      if (urgent.includes('eat') || urgent.includes('food')) {
        const hasFood = char.inventory.find(i => i.type === 'food' && i.amount > 0);
        nextAction = hasFood ? 'EAT' : 'COLLECT_FOOD';
      } else if (urgent.includes('rest') || urgent.includes('energy')) {
        nextAction = 'REST';
      }
    } else if (this._pendingIntentAction) {
      nextAction = this._pendingIntentAction;
      this._pendingIntentAction = null;
    } else {
      // Rule-based fallback
      nextAction = this._ruleBasedAction();
    }

    const { eventMessage } = startAction(char, nextAction, tiles);
    this._world.addEvent('action', eventMessage);
    this._recentEventMessages.push(eventMessage);
    this._callbacks.onNewEvent();
  }

  // ----------------------------------------------------------
  // Rule-based action selection (used when LLM hasn't responded yet)
  // ----------------------------------------------------------
  private _ruleBasedAction(): ActionType {
    const char = this._world.character;
    const inv = char.inventory;
    const foodAmt  = inv.find(i => i.type === 'food')?.amount  ?? 0;
    const woodAmt  = inv.find(i => i.type === 'wood')?.amount  ?? 0;
    const stoneAmt = inv.find(i => i.type === 'stone')?.amount ?? 0;

    if (char.needs.hunger < 30 && foodAmt > 0) return 'EAT';
    if (char.needs.hunger < 50 && foodAmt === 0) return 'COLLECT_FOOD';
    if (char.needs.energy < 30) return 'REST';
    if (canBuild(char)) return 'BUILD';
    if (woodAmt < 8) return 'COLLECT_WOOD';
    if (stoneAmt < 5) return 'COLLECT_STONE';
    if (foodAmt < 5) return 'COLLECT_FOOD';
    return Math.random() < 0.3 ? 'THINK' : 'WANDER';
  }

  // ----------------------------------------------------------
  // Async thought generation
  // ----------------------------------------------------------
  private async _generateThought(): Promise<void> {
    this._thoughtBusy = true;
    try {
      const char = this._world.character;
      const recentEvents = this._world.state.recentEvents.slice(-5);
      const thought = await generateThought(char, recentEvents);

      this._world.setThought(thought);
      this._world.addEvent('thought', `💭 ${thought}`);
      this._callbacks.onThought(thought);
      this._callbacks.onNewEvent();
    } catch (err) {
      console.error('[Simulation] Thought generation error:', err);
    } finally {
      this._thoughtBusy = false;
    }
  }

  // ----------------------------------------------------------
  // Async intent selection
  // ----------------------------------------------------------
  private async _selectNextIntent(): Promise<void> {
    this._aiThinkBusy = true;
    try {
      const char = this._world.character;
      const urgent = detectUrgentNeed(char);
      const available = getAvailableActions(char);
      const intent = await selectIntent(char, available, urgent);
      this._pendingIntentAction = intent;
    } catch (err) {
      console.error('[Simulation] Intent selection error:', err);
    } finally {
      this._aiThinkBusy = false;
    }
  }

  // ----------------------------------------------------------
  // Handle player chat — called externally
  // ----------------------------------------------------------
  handleChat(
    message: string,
    onResponse: (response: string) => void
  ): void {
    import('../ai/mind').then(({ generateChatResponse }) => {
      const char = this._world.character;
      const recentChat = this._world.getRecentChatRaw();
      const recentEvents = this._world.state.recentEvents.slice(-5);

      generateChatResponse(char, message, recentChat, recentEvents)
        .then(response => {
          onResponse(response);
          // Small mood boost from social interaction
          char.needs.mood = Math.min(char.needs.mood + 5, 100);
          char.relationship = Math.min(char.relationship + 2, 100);
        })
        .catch(err => {
          console.error('[Simulation] Chat response error:', err);
          onResponse('...');
        });
    });
  }

  getWorld(): WorldManager {
    return this._world;
  }
}
