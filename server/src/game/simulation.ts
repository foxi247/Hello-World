import { WorldManager } from './world';
import { startAction, progressAction } from './actions';
import {
  decayNeeds,
  decayNPCNeeds,
  updateComfort,
  isNearHome,
  detectUrgentNeed,
  getAvailableActions,
  canBuild,
  createNPC,
  addToInventory,
  getInventoryAmount,
} from './character';
import { generateThought, selectIntent, summarizeIntoMemory, generateInvention } from '../ai/mind';
import type { ActionType, NPCState, Invention } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  findTilesOfType,
  findAdjacentPassable,
} from './worldMap';

// ============================================================
// Конфигурация симуляции
// ============================================================
const TICK_INTERVAL_MS = 1000;
const AI_THINK_INTERVAL  = parseInt(process.env.AI_THINK_INTERVAL  ?? '20');
const AI_THOUGHT_INTERVAL = parseInt(process.env.AI_THOUGHT_INTERVAL ?? '15');
const PERSIST_INTERVAL = 30;
const MEMORY_SUMMARIZE_INTERVAL = 60;
const INVENTION_INTERVAL = 300;
const NPC_SPAWN_CHECK_INTERVAL = 200;
const RESOURCE_REGEN_INTERVAL = 120;  // каждые 120 тиков ресурсы отрастают
const DAY_CYCLE_TICKS = 400;
const NIGHT_SPEED_MULTIPLIER = 5;    // ночью тики летят x5

// ============================================================
// Колбэки для WebSocket
// ============================================================
export type SimulationCallbacks = {
  onCharacterUpdate: () => void;
  onNPCUpdate: () => void;
  onNewEvent: () => void;
  onThought: (thought: string) => void;
  onTileChanged: (x: number, y: number) => void;
  onDayPhase: () => void;
  onInvention: (invention: Invention) => void;
};

// ============================================================
// Класс симуляции
// ============================================================
export class Simulation {
  private _world: WorldManager;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _callbacks: SimulationCallbacks;
  private _aiThinkBusy = false;
  private _thoughtBusy  = false;
  private _inventionBusy = false;
  private _pendingIntentAction: ActionType | null = null;
  private _ticksSinceLastIntent = 0;
  private _ticksSinceLastThought = 0;
  private _ticksSinceLastInvention = 0;
  private _recentEventMessages: string[] = [];

  constructor(world: WorldManager, callbacks: SimulationCallbacks) {
    this._world = world;
    this._callbacks = callbacks;
  }

  start(): void {
    if (this._timer) return;
    console.log('[Simulation] Запуск цикла, интервал тика:', TICK_INTERVAL_MS, 'мс');
    this._timer = setInterval(() => this._tick(), TICK_INTERVAL_MS);
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  private _sleeping = false;
  private _nightTickAccum = 0;

  // ----------------------------------------------------------
  // Главный тик
  // ----------------------------------------------------------
  private async _tick(): Promise<void> {
    const char = this._world.character;
    const tiles = this._world.tiles;
    const dayPhase = this._world.state.dayPhase;

    // Night sleep system: everyone sleeps, time flies 5x faster
    if (dayPhase === 'night' && !this._sleeping) {
      this._sleeping = true;
      // Force everyone to sleep
      char.currentAction = 'REST';
      char.currentIntentLabel = 'спит';
      char.targetPosition = null;
      for (const npc of this._world.npcs) {
        npc.currentAction = 'REST';
        npc.currentTask = 'спит';
      }
      this._world.addEvent('system', '🌙 Ночь. Все ложатся спать.');
      this._callbacks.onNewEvent();
    }

    if (this._sleeping) {
      // Fast-forward night: advance multiple ticks
      for (let i = 0; i < NIGHT_SPEED_MULTIPLIER; i++) {
        this._world.advanceTick();
      }
      // Restore energy/hunger while sleeping
      char.needs.energy = Math.min(100, char.needs.energy + 0.8);
      char.needs.mood = Math.min(100, char.needs.mood + 0.2);
      char.needs.hunger = Math.max(0, char.needs.hunger - 0.15);
      for (const npc of this._world.npcs) {
        npc.needs.energy = Math.min(100, npc.needs.energy + 0.6);
        npc.needs.hunger = Math.max(0, npc.needs.hunger - 0.1);
      }
      char.tickAge += NIGHT_SPEED_MULTIPLIER;

      // Check if dawn
      if (this._world.state.dayPhase === 'dawn' || this._world.state.dayPhase === 'day') {
        this._sleeping = false;
        char.currentAction = 'IDLE';
        char.currentIntentLabel = 'просыпается';
        for (const npc of this._world.npcs) {
          npc.currentAction = 'IDLE';
          npc.currentTask = 'проснулся';
        }
        this._world.addEvent('system', '🌅 Рассвет! Все просыпаются.');
        this._callbacks.onNewEvent();
      }

      this._callbacks.onCharacterUpdate();
      this._callbacks.onDayPhase();
      if (this._world.npcs.length > 0) this._callbacks.onNPCUpdate();
      return;
    }

    // 1. Время
    this._world.advanceTick();
    this._ticksSinceLastIntent++;
    this._ticksSinceLastThought++;
    this._ticksSinceLastInvention++;

    // 2. Деградация потребностей
    decayNeeds(char);
    updateComfort(char, isNearHome(char));

    // 3. NPC потребности
    for (const npc of this._world.npcs) {
      decayNPCNeeds(npc);
      this._tickNPC(npc, tiles);
    }

    // 4. Текущее действие
    if (char.currentAction === 'IDLE' || char.currentAction === 'MOVE_TO') {
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

    // 5. Генерация мыслей
    if (this._ticksSinceLastThought >= AI_THOUGHT_INTERVAL && !this._thoughtBusy) {
      this._ticksSinceLastThought = 0;
      this._generateThought();
    }

    // 6. Выбор намерения
    if (this._ticksSinceLastIntent >= AI_THINK_INTERVAL && !this._aiThinkBusy) {
      this._ticksSinceLastIntent = 0;
      this._selectNextIntent();
    }

    // 7. Система изобретений
    if (this._ticksSinceLastInvention >= INVENTION_INTERVAL && !this._inventionBusy) {
      if (char.needs.hunger > 50 && char.needs.energy > 40 && char.needs.mood > 40) {
        this._ticksSinceLastInvention = 0;
        this._tryInvention();
      }
    }

    // 8. Спавн NPC
    if (this._world.tick % NPC_SPAWN_CHECK_INTERVAL === 0) {
      this._checkNPCSpawn();
    }

    // 9. Регенерация ресурсов
    if (this._world.tick % RESOURCE_REGEN_INTERVAL === 0) {
      this._regenerateResources();
    }

    // 10. Сохранение
    if (this._world.tick % PERSIST_INTERVAL === 0) {
      this._world.persist();
    }

    // 10. Суммаризация памяти
    if (this._world.tick % MEMORY_SUMMARIZE_INTERVAL === 0 && this._recentEventMessages.length > 3) {
      const events = [...this._recentEventMessages];
      this._recentEventMessages = [];
      summarizeIntoMemory(char, events, this._world.tick).catch(console.error);
    }

    // 11. Фаза дня
    if (this._world.tick % 5 === 0) {
      this._callbacks.onDayPhase();
    }

    // 12. NPC update broadcast
    if (this._world.npcs.length > 0 && this._world.tick % 3 === 0) {
      this._callbacks.onNPCUpdate();
    }
  }

  // ----------------------------------------------------------
  // Начать новое действие
  // ----------------------------------------------------------
  private _startNewAction(): void {
    const char = this._world.character;
    const tiles = this._world.tiles;

    const urgent = detectUrgentNeed(char);
    let nextAction: ActionType = 'WANDER';

    if (urgent) {
      if (urgent.includes('голод') || urgent.includes('еды') || urgent.includes('hunger') || urgent.includes('food')) {
        const hasFood = char.inventory.find(i => i.type === 'food' && i.amount > 0);
        nextAction = hasFood ? 'EAT' : 'COLLECT_FOOD';
      } else if (urgent.includes('сил') || urgent.includes('отдох') || urgent.includes('rest') || urgent.includes('energy')) {
        nextAction = 'REST';
      }
    } else if (this._pendingIntentAction) {
      nextAction = this._pendingIntentAction;
      this._pendingIntentAction = null;
    } else {
      nextAction = this._ruleBasedAction();
    }

    const { eventMessage } = startAction(char, nextAction, tiles);
    this._world.addEvent('action', eventMessage);
    this._recentEventMessages.push(eventMessage);
    this._callbacks.onNewEvent();
  }

  // ----------------------------------------------------------
  // Умное правило-основанное действие
  // ----------------------------------------------------------
  private _ruleBasedAction(): ActionType {
    const char = this._world.character;
    const inv = char.inventory;
    const foodAmt  = inv.find(i => i.type === 'food')?.amount  ?? 0;
    const woodAmt  = inv.find(i => i.type === 'wood')?.amount  ?? 0;
    const stoneAmt = inv.find(i => i.type === 'stone')?.amount ?? 0;

    // Срочные потребности
    if (char.needs.hunger < 30 && foodAmt > 0) return 'EAT';
    if (char.needs.hunger < 50 && foodAmt === 0) return 'COLLECT_FOOD';
    if (char.needs.energy < 30) return 'REST';

    // Строительство — приоритет если можно
    if (canBuild(char)) return 'BUILD';

    // Умная сборка ресурсов под следующий уровень
    const level = char.homeLevel;
    const needWood  = this._woodNeededForNextLevel(level);
    const needStone = this._stoneNeededForNextLevel(level);

    if (woodAmt < needWood) return 'COLLECT_WOOD';
    if (stoneAmt < needStone) return 'COLLECT_STONE';
    if (foodAmt < 5) return 'COLLECT_FOOD';

    // Изобретения если всё хорошо
    if (char.needs.mood > 60 && char.needs.hunger > 60 && Math.random() < 0.2) return 'INVENT';

    return Math.random() < 0.3 ? 'THINK' : 'WANDER';
  }

  private _woodNeededForNextLevel(level: number): number {
    if (level === 0) return 0;
    if (level === 1) return 5;
    if (level === 2) return 10;
    if (level === 3) return 20;
    if (level === 4) return 30;
    return 10;
  }

  private _stoneNeededForNextLevel(level: number): number {
    if (level === 0) return 0;
    if (level === 1) return 3;
    if (level === 2) return 8;
    if (level === 3) return 15;
    if (level === 4) return 20;
    return 5;
  }

  // ----------------------------------------------------------
  // NPC тик — автономное поведение
  // ----------------------------------------------------------
  private _tickNPC(npc: NPCState, tiles: import('../../../shared/types').WorldTile[][]): void {
    // Workers auto-collect resources
    if (npc.role === 'worker') {
      if (npc.needs.hunger < 20 || npc.needs.energy < 15) {
        // NPC отдыхает или ест из общих запасов
        if (npc.needs.energy < 15) {
          npc.needs.energy += 0.5;
          npc.currentTask = 'отдыхает';
        } else {
          const char = this._world.character;
          const hasFood = char.inventory.find(i => i.type === 'food' && i.amount > 0);
          if (hasFood) {
            hasFood.amount -= 1;
            if (hasFood.amount <= 0) char.inventory = char.inventory.filter(i => i.amount > 0);
            npc.needs.hunger += 20;
            npc.currentTask = 'ест';
          }
        }
        return;
      }

      // Auto-collect nearest resource
      npc.actionProgress += 5;
      if (npc.actionProgress >= 100) {
        npc.actionProgress = 0;
        // Randomly choose resource to collect
        const roll = Math.random();
        const type = roll < 0.4 ? 'wood' : roll < 0.7 ? 'stone' : 'food';
        const char = this._world.character;
        addToInventory(char, type as any, 1);
        npc.currentTask = `собрал ${type === 'wood' ? 'дерево' : type === 'stone' ? 'камень' : 'еду'}`;

        // Move NPC around slightly
        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;
        const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
        const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
        if (tiles[ny]?.[nx]?.passable) {
          npc.position = { x: nx, y: ny };
        }
      } else {
        npc.currentTask = 'работает';
      }
    }

    // Companion — active AI: wanders, collects food, interacts, follows
    if (npc.role === 'companion') {
      const char = this._world.character;
      const dist = Math.abs(npc.position.x - char.position.x) + Math.abs(npc.position.y - char.position.y);

      // Handle needs first
      if (npc.needs.hunger < 25) {
        const hasFood = char.inventory.find(i => i.type === 'food' && i.amount > 0);
        if (hasFood) {
          hasFood.amount -= 1;
          if (hasFood.amount <= 0) char.inventory = char.inventory.filter(i => i.amount > 0);
          npc.needs.hunger += 20;
          npc.currentTask = 'ест';
        } else {
          npc.currentTask = 'голодна';
        }
        return;
      }

      if (npc.needs.energy < 20) {
        npc.needs.energy += 0.5;
        npc.currentTask = 'отдыхает';
        return;
      }

      // Active behavior cycle
      npc.actionProgress += 3;
      const cycle = npc.actionProgress % 300;

      if (cycle < 80) {
        // Follow Alder
        if (dist > 2) {
          const dx = Math.sign(char.position.x - npc.position.x);
          const dy = Math.sign(char.position.y - npc.position.y);
          const nx = npc.position.x + dx;
          const ny = npc.position.y + dy;
          if (tiles[ny]?.[nx]?.passable) {
            npc.position = { x: nx, y: ny };
          }
        }
        npc.currentTask = 'рядом с ' + char.name;
        if (dist <= 2) {
          char.needs.mood = Math.min(100, char.needs.mood + 0.03);
          npc.relationship = Math.min(100, npc.relationship + 0.02);
        }
      } else if (cycle < 140) {
        // Collect food independently
        npc.currentTask = 'собирает ягоды';
        if (npc.actionProgress % 20 === 0) {
          addToInventory(char, 'food', 1);
          // Wander while collecting
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
      } else if (cycle < 200) {
        // Wander/explore
        if (Math.random() < 0.15) {
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = 'гуляет';
      } else {
        // Return to Alder and interact
        if (dist > 2) {
          const dx = Math.sign(char.position.x - npc.position.x);
          const dy = Math.sign(char.position.y - npc.position.y);
          const nx = npc.position.x + dx;
          const ny = npc.position.y + dy;
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = 'общается';
        if (dist <= 2) {
          char.needs.mood = Math.min(100, char.needs.mood + 0.05);
          npc.relationship = Math.min(100, npc.relationship + 0.03);
        }
      }
    }

    // Children — wander, play, sometimes help
    if (npc.role === 'child') {
      npc.actionProgress += 2;
      const cycle = npc.actionProgress % 200;

      if (cycle < 100) {
        // Playing around
        if (Math.random() < 0.08) {
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = 'играет';
      } else if (cycle < 150) {
        // Follow parent
        const char = this._world.character;
        const dist = Math.abs(npc.position.x - char.position.x) + Math.abs(npc.position.y - char.position.y);
        if (dist > 3) {
          const dx = Math.sign(char.position.x - npc.position.x);
          const dy = Math.sign(char.position.y - npc.position.y);
          const nx = npc.position.x + dx;
          const ny = npc.position.y + dy;
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = 'бежит к папе';
      } else {
        // Helps collect a little
        if (npc.actionProgress % 30 === 0) {
          const char = this._world.character;
          addToInventory(char, 'food', 1);
          npc.currentTask = 'помогает';
        } else {
          npc.currentTask = 'помогает';
        }
      }

      // Children eat from shared food
      if (npc.needs.hunger < 30) {
        const char = this._world.character;
        const hasFood = char.inventory.find(i => i.type === 'food' && i.amount > 0);
        if (hasFood) {
          hasFood.amount -= 1;
          if (hasFood.amount <= 0) char.inventory = char.inventory.filter(i => i.amount > 0);
          npc.needs.hunger += 25;
        }
      }
    }
  }

  // ----------------------------------------------------------
  // Регенерация ресурсов
  // ----------------------------------------------------------
  private _regenerateResources(): void {
    const tiles = this._world.tiles;
    // Count current resources
    let trees = 0, stones = 0, bushes = 0;
    const grassTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < tiles.length; y++) {
      for (let x = 0; x < tiles[y].length; x++) {
        const t = tiles[y][x];
        if (t.type === 'TREE') trees++;
        else if (t.type === 'STONE') stones++;
        else if (t.type === 'BERRY_BUSH') bushes++;
        else if (t.type === 'GRASS' && y > 0 && y < tiles.length - 1 && x > 0 && x < tiles[y].length - 1) {
          grassTiles.push({ x, y });
        }
      }
    }
    if (grassTiles.length === 0) return;

    // Regrow: small chance each cycle, favoring scarce resources
    const regenChance = 0.03;
    for (const pos of grassTiles) {
      if (Math.random() > regenChance) continue;
      const roll = Math.random();
      let newType: string;
      let resource: number;
      if (roll < 0.5 && trees < 30) {
        newType = 'TREE'; resource = 10;
      } else if (roll < 0.75 && stones < 15) {
        newType = 'STONE'; resource = 8;
      } else if (bushes < 12) {
        newType = 'BERRY_BUSH'; resource = 6;
      } else continue;

      const tile = tiles[pos.y][pos.x];
      tile.type = newType as any;
      tile.passable = false;
      tile.resource = resource;
      this._callbacks.onTileUpdate(pos.x, pos.y);
    }
  }

  // ----------------------------------------------------------
  // Проверка спавна NPC
  // ----------------------------------------------------------
  private _checkNPCSpawn(): void {
    const char = this._world.character;
    const npcs = this._world.npcs;

    // Работники появляются когда homeLevel >= 3 и нет работников
    const workers = npcs.filter(n => n.role === 'worker');
    if (char.homeLevel >= 3 && workers.length < Math.min(char.homeLevel - 1, 5)) {
      // Шанс появления работника
      if (Math.random() < 0.3) {
        const npc = createNPC('worker');
        this._world.addNPC(npc);
        this._world.addEvent('npc', `👷 К ${char.name} пришёл работник — ${npc.name}!`);
        this._callbacks.onNewEvent();
        this._callbacks.onNPCUpdate();
      }
    }

    // Спутница появляется когда homeLevel >= 4 и нет спутницы
    const companions = npcs.filter(n => n.role === 'companion');
    if (char.homeLevel >= 4 && companions.length === 0) {
      if (Math.random() < 0.2) {
        const npc = createNPC('companion');
        this._world.addNPC(npc);
        this._world.addEvent('npc', `💕 На поляну пришла ${npc.name}!`);
        this._callbacks.onNewEvent();
        this._callbacks.onNPCUpdate();
      }
    }

    // Ребёнок рождается если есть спутница и прошло 1000 тиков
    if (companions.length > 0) {
      const comp = companions[0];
      const children = npcs.filter(n => n.role === 'child');
      if (comp.tickAge > 1000 && children.length < 3 && comp.relationship > 70) {
        if (Math.random() < 0.1) {
          const child = createNPC('child', [char.name, comp.id]);
          this._world.addNPC(child);
          this._world.addEvent('npc', `👶 У ${char.name} и ${comp.name} родился ребёнок — ${child.name}!`);
          char.needs.mood = Math.min(100, char.needs.mood + 30);
          comp.relationship = Math.min(100, comp.relationship + 20);
          this._callbacks.onNewEvent();
          this._callbacks.onNPCUpdate();
        }
      }
      // Increase companion relationship over time
      comp.relationship = Math.min(100, comp.relationship + 0.01);
    }
  }

  // ----------------------------------------------------------
  // Система изобретений
  // ----------------------------------------------------------
  private async _tryInvention(): Promise<void> {
    this._inventionBusy = true;
    try {
      const char = this._world.character;
      const existingNames = this._world.getInventionNames();
      const invention = await generateInvention(char, existingNames);

      if (invention) {
        const inv: Invention = {
          id: uuidv4(),
          name: invention.name,
          type: invention.type as Invention['type'],
          description: invention.description,
          recipe: invention.recipe,
          effect: invention.effect,
          inventedAtTick: this._world.tick,
        };

        this._world.addInvention(inv);
        this._world.addEvent('invention', `💡 ${char.name} изобрёл: ${inv.name} — ${inv.description}`);
        this._callbacks.onNewEvent();
        this._callbacks.onInvention(inv);

        // Mood boost from creativity
        char.needs.mood = Math.min(100, char.needs.mood + 15);
      }
    } catch (err) {
      console.error('[Simulation] Ошибка изобретения:', err);
    } finally {
      this._inventionBusy = false;
    }
  }

  // ----------------------------------------------------------
  // Генерация мыслей
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
      console.error('[Simulation] Ошибка генерации мысли:', err);
    } finally {
      this._thoughtBusy = false;
    }
  }

  // ----------------------------------------------------------
  // Выбор намерения
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
      console.error('[Simulation] Ошибка выбора намерения:', err);
    } finally {
      this._aiThinkBusy = false;
    }
  }

  // ----------------------------------------------------------
  // Чат с игроком
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
          char.needs.mood = Math.min(char.needs.mood + 5, 100);
          char.relationship = Math.min(char.relationship + 2, 100);
        })
        .catch(err => {
          console.error('[Simulation] Ошибка ответа в чате:', err);
          onResponse('...');
        });
    });
  }

  getWorld(): WorldManager {
    return this._world;
  }
}
