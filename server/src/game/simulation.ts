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
  updateEmotions,
  updateNPCEmotions,
  clamp,
} from './character';
import { generateThought, selectIntent, summarizeIntoMemory, generateInvention } from '../ai/mind';
import type { ActionType, NPCState, Invention, Animal, AnimalType } from '../../../shared/types';
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
const RESOURCE_REGEN_INTERVAL = 120;
const ANIMAL_SPAWN_INTERVAL = 150;
const ANIMAL_TICK_INTERVAL = 5;
const EMOTION_UPDATE_INTERVAL = 10;
const NIGHT_SPEED_MULTIPLIER = 5;

// ============================================================
// Колбэки для WebSocket
// ============================================================
export type SimulationCallbacks = {
  onCharacterUpdate: () => void;
  onNPCUpdate: () => void;
  onAnimalUpdate: () => void;
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
  private _sleeping = false;
  private _chatCommandQueue: string[] = [];

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

  // ----------------------------------------------------------
  // Главный тик
  // ----------------------------------------------------------
  private async _tick(): Promise<void> {
    const char = this._world.character;
    const tiles = this._world.tiles;
    const dayPhase = this._world.state.dayPhase;

    // Night sleep system
    if (dayPhase === 'night' && !this._sleeping) {
      this._sleeping = true;
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
      for (let i = 0; i < NIGHT_SPEED_MULTIPLIER; i++) {
        this._world.advanceTick();
      }
      char.needs.energy = Math.min(100, char.needs.energy + 0.8);
      char.needs.mood = Math.min(100, char.needs.mood + 0.2);
      char.needs.hunger = Math.max(0, char.needs.hunger - 0.15);
      for (const npc of this._world.npcs) {
        npc.needs.energy = Math.min(100, npc.needs.energy + 0.6);
        npc.needs.hunger = Math.max(0, npc.needs.hunger - 0.1);
      }
      char.tickAge += NIGHT_SPEED_MULTIPLIER;

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

    // 4. Chat command override
    if (this._chatCommandQueue.length > 0 && char.currentAction === 'IDLE') {
      this._executeChatCommand(this._chatCommandQueue.shift()!);
    }

    // 5. Текущее действие
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

        // Post-action: handle hunt/tame results
        if (char.currentAction === 'HUNT') {
          this._resolveHunt();
        } else if (char.currentAction === 'TAME') {
          this._resolveTame();
        } else if (char.currentAction === 'FARM') {
          this._resolveFarm();
        } else if (char.currentAction === 'INVITE_NPC') {
          this._resolveInvite('auto');
        }

        char.currentAction = 'IDLE';
        char.actionProgress = 0;
        char.targetPosition = null;
      }
    }

    this._callbacks.onCharacterUpdate();

    // 6. Генерация мыслей
    if (this._ticksSinceLastThought >= AI_THOUGHT_INTERVAL && !this._thoughtBusy) {
      this._ticksSinceLastThought = 0;
      this._generateThought();
    }

    // 7. Выбор намерения
    if (this._ticksSinceLastIntent >= AI_THINK_INTERVAL && !this._aiThinkBusy) {
      this._ticksSinceLastIntent = 0;
      this._selectNextIntent();
    }

    // 8. Система изобретений
    if (this._ticksSinceLastInvention >= INVENTION_INTERVAL && !this._inventionBusy) {
      if (char.needs.hunger > 50 && char.needs.energy > 40 && char.needs.mood > 40) {
        this._ticksSinceLastInvention = 0;
        this._tryInvention();
      }
    }

    // 9. Спавн NPC
    if (this._world.tick % NPC_SPAWN_CHECK_INTERVAL === 0) {
      this._checkNPCSpawn();
    }

    // 10. Регенерация ресурсов
    if (this._world.tick % RESOURCE_REGEN_INTERVAL === 0) {
      this._regenerateResources();
    }

    // 11. Животные
    if (this._world.tick % ANIMAL_SPAWN_INTERVAL === 0) {
      this._spawnAnimals();
    }
    if (this._world.tick % ANIMAL_TICK_INTERVAL === 0) {
      this._tickAnimals();
    }

    // 12. Эмоции
    if (this._world.tick % EMOTION_UPDATE_INTERVAL === 0) {
      this._updateAllEmotions();
    }

    // 13. Сохранение
    if (this._world.tick % PERSIST_INTERVAL === 0) {
      this._world.persist();
    }

    // 14. Суммаризация памяти
    if (this._world.tick % MEMORY_SUMMARIZE_INTERVAL === 0 && this._recentEventMessages.length > 3) {
      const events = [...this._recentEventMessages];
      this._recentEventMessages = [];
      summarizeIntoMemory(char, events, this._world.tick).catch(console.error);
    }

    // 15. Фаза дня
    if (this._world.tick % 5 === 0) {
      this._callbacks.onDayPhase();
    }

    // 16. NPC update broadcast
    if (this._world.npcs.length > 0 && this._world.tick % 3 === 0) {
      this._callbacks.onNPCUpdate();
    }

    // 17. Animal update broadcast
    if (this._world.animals.length > 0 && this._world.tick % 5 === 0) {
      this._callbacks.onAnimalUpdate();
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
        const hasFood = char.inventory.find(i => (i.type === 'food' || i.type === 'meat') && i.amount > 0);
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
    const foodAmt  = (inv.find(i => i.type === 'food')?.amount ?? 0) + (inv.find(i => i.type === 'meat')?.amount ?? 0);
    const woodAmt  = inv.find(i => i.type === 'wood')?.amount  ?? 0;
    const stoneAmt = inv.find(i => i.type === 'stone')?.amount ?? 0;

    // Срочные потребности
    if (char.needs.hunger < 30 && foodAmt > 0) return 'EAT';
    if (char.needs.hunger < 50 && foodAmt === 0) {
      // Hunt if possible, else collect food
      if (this._world.animals.filter(a => a.state === 'wild').length > 0) {
        return Math.random() < 0.5 ? 'HUNT' : 'COLLECT_FOOD';
      }
      return 'COLLECT_FOOD';
    }
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

    // Tame animals if possible and have food
    const wildAnimals = this._world.animals.filter(a => a.state === 'wild');
    const tamedAnimals = this._world.animals.filter(a => a.state === 'tamed' || a.state === 'farm');
    if (wildAnimals.length > 0 && tamedAnimals.length < 5 && getInventoryAmount(char, 'food') >= 3 && Math.random() < 0.15) {
      return 'TAME';
    }

    // Farm if have farm animals
    if (tamedAnimals.length > 0 && Math.random() < 0.1) {
      return 'FARM';
    }

    // Hunt occasionally
    if (wildAnimals.length > 0 && Math.random() < 0.1) {
      return 'HUNT';
    }

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
  // Chat commands — player tells character what to do
  // ----------------------------------------------------------
  queueChatCommand(message: string): void {
    this._chatCommandQueue.push(message);
  }

  private _executeChatCommand(message: string): void {
    const char = this._world.character;
    const tiles = this._world.tiles;
    const msg = message.toLowerCase();

    // Movement commands
    if (msg.includes('дом') || msg.includes('домой') || msg.includes('home')) {
      char.currentAction = 'MOVE_TO';
      char.targetPosition = { x: 10, y: 11 };
      char.currentIntentLabel = 'идёт домой';
      this._world.addEvent('action', `${char.name} идёт домой по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('руби') || msg.includes('дерев') || msg.includes('wood') || msg.includes('chop')) {
      startAction(char, 'COLLECT_WOOD', tiles);
      this._world.addEvent('action', `${char.name} пошёл рубить дерево по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('камн') || msg.includes('stone') || msg.includes('mine')) {
      startAction(char, 'COLLECT_STONE', tiles);
      this._world.addEvent('action', `${char.name} пошёл добывать камни по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('ягод') || msg.includes('еды') || msg.includes('еда') || msg.includes('собер') || msg.includes('food') || msg.includes('berry')) {
      startAction(char, 'COLLECT_FOOD', tiles);
      this._world.addEvent('action', `${char.name} пошёл собирать ягоды по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('ешь') || msg.includes('поешь') || msg.includes('eat')) {
      startAction(char, 'EAT', tiles);
      this._world.addEvent('action', `${char.name} пошёл есть по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('спи') || msg.includes('отдых') || msg.includes('sleep') || msg.includes('rest')) {
      startAction(char, 'REST', tiles);
      this._world.addEvent('action', `${char.name} пошёл отдыхать по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('строй') || msg.includes('build')) {
      startAction(char, 'BUILD', tiles);
      this._world.addEvent('action', `${char.name} начал строить по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('охот') || msg.includes('hunt')) {
      startAction(char, 'HUNT', tiles);
      this._world.addEvent('action', `${char.name} пошёл на охоту по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('прируч') || msg.includes('tame')) {
      startAction(char, 'TAME', tiles);
      this._world.addEvent('action', `${char.name} пытается приручить животное по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    if (msg.includes('ферм') || msg.includes('farm')) {
      startAction(char, 'FARM', tiles);
      this._world.addEvent('action', `${char.name} занялся фермой по просьбе.`);
      this._callbacks.onNewEvent();
      return;
    }

    // Movement to specific coordinates
    const coordMatch = msg.match(/(?:иди|пройди|сходи|go)\s+(?:к|на|в|to)?\s*(?:\()?(\d+)\s*[,\s]\s*(\d+)/);
    if (coordMatch) {
      const tx = parseInt(coordMatch[1]);
      const ty = parseInt(coordMatch[2]);
      if (tx >= 0 && tx < WORLD_WIDTH && ty >= 0 && ty < WORLD_HEIGHT && tiles[ty]?.[tx]?.passable) {
        char.currentAction = 'MOVE_TO';
        char.targetPosition = { x: tx, y: ty };
        char.currentIntentLabel = `идёт к (${tx},${ty})`;
        this._world.addEvent('action', `${char.name} идёт к точке (${tx},${ty}) по просьбе.`);
        this._callbacks.onNewEvent();
        return;
      }
    }
  }

  // ----------------------------------------------------------
  // NPC тик — автономное поведение
  // ----------------------------------------------------------
  private _tickNPC(npc: NPCState, tiles: import('../../../shared/types').WorldTile[][]): void {
    // Ensure emotions exist
    if (!npc.emotions) {
      npc.emotions = { love: 0, loneliness: 50, pride: 20, grief: 0, excitement: 30, fear: 0 };
    }

    // Workers auto-collect resources
    if (npc.role === 'worker') {
      if (npc.needs.hunger < 20 || npc.needs.energy < 15) {
        if (npc.needs.energy < 15) {
          npc.needs.energy += 0.5;
          npc.currentTask = 'отдыхает';
        } else {
          const char = this._world.character;
          const hasFood = char.inventory.find(i => (i.type === 'food' || i.type === 'meat') && i.amount > 0);
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
        const roll = Math.random();
        const type = roll < 0.4 ? 'wood' : roll < 0.7 ? 'stone' : 'food';
        const char = this._world.character;
        addToInventory(char, type as any, 1);
        npc.currentTask = `собрал ${type === 'wood' ? 'дерево' : type === 'stone' ? 'камень' : 'еду'}`;

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

    // Companion — active AI
    if (npc.role === 'companion') {
      const char = this._world.character;
      const dist = Math.abs(npc.position.x - char.position.x) + Math.abs(npc.position.y - char.position.y);

      if (npc.needs.hunger < 25) {
        const hasFood = char.inventory.find(i => (i.type === 'food' || i.type === 'meat') && i.amount > 0);
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

      npc.actionProgress += 3;
      const cycle = npc.actionProgress % 300;

      if (cycle < 80) {
        if (dist > 2) {
          this._moveToward(npc, char.position, tiles);
        }
        npc.currentTask = 'рядом с ' + char.name;
        if (dist <= 2) {
          char.needs.mood = clamp(char.needs.mood + 0.03, 0, 100);
          npc.relationship = Math.min(100, npc.relationship + 0.02);
          // Emotional bonding
          if (npc.emotions.love > 60) {
            npc.emotions.excitement = clamp(npc.emotions.excitement + 0.04, 0, 100);
          }
        }
      } else if (cycle < 140) {
        npc.currentTask = 'собирает ягоды';
        if (npc.actionProgress % 20 === 0) {
          addToInventory(char, 'food', 1);
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
      } else if (cycle < 200) {
        if (Math.random() < 0.15) {
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = 'гуляет';
      } else {
        if (dist > 2) {
          this._moveToward(npc, char.position, tiles);
        }
        // Emotional states affect behavior
        if (npc.emotions.love > 80 && npc.emotions.excitement > 60) {
          npc.currentTask = '❤ влюблена';
        } else if (npc.emotions.love > 50) {
          npc.currentTask = 'обнимает';
        } else {
          npc.currentTask = 'общается';
        }
        if (dist <= 2) {
          char.needs.mood = clamp(char.needs.mood + 0.05, 0, 100);
          npc.relationship = Math.min(100, npc.relationship + 0.03);
        }
      }
    }

    // Children — wander, play, sometimes help
    if (npc.role === 'child') {
      npc.actionProgress += 2;
      const cycle = npc.actionProgress % 200;

      if (cycle < 100) {
        if (Math.random() < 0.08) {
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, npc.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, npc.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) npc.position = { x: nx, y: ny };
        }
        npc.currentTask = npc.emotions.excitement > 60 ? 'весело играет!' : 'играет';
      } else if (cycle < 150) {
        const char = this._world.character;
        const dist = Math.abs(npc.position.x - char.position.x) + Math.abs(npc.position.y - char.position.y);
        if (dist > 3) {
          this._moveToward(npc, char.position, tiles);
        }
        npc.currentTask = 'бежит к папе';
      } else {
        if (npc.actionProgress % 30 === 0) {
          const char = this._world.character;
          addToInventory(char, 'food', 1);
        }
        npc.currentTask = 'помогает';
      }

      if (npc.needs.hunger < 30) {
        const char = this._world.character;
        const hasFood = char.inventory.find(i => (i.type === 'food' || i.type === 'meat') && i.amount > 0);
        if (hasFood) {
          hasFood.amount -= 1;
          if (hasFood.amount <= 0) char.inventory = char.inventory.filter(i => i.amount > 0);
          npc.needs.hunger += 25;
        }
      }
    }

    // NPC-NPC interactions
    for (const other of this._world.npcs) {
      if (other.id === npc.id) continue;
      const dist = Math.abs(npc.position.x - other.position.x) + Math.abs(npc.position.y - other.position.y);
      if (dist <= 2 && Math.random() < 0.01) {
        // Brief interaction
        npc.needs.mood = clamp(npc.needs.mood + 1, 0, 100);
        other.needs.mood = clamp(other.needs.mood + 1, 0, 100);
      }
    }
  }

  private _moveToward(npc: NPCState, target: { x: number; y: number }, tiles: import('../../../shared/types').WorldTile[][]): void {
    const dx = Math.sign(target.x - npc.position.x);
    const dy = Math.sign(target.y - npc.position.y);
    const nx = npc.position.x + dx;
    const ny = npc.position.y + dy;
    if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT && tiles[ny]?.[nx]?.passable) {
      npc.position = { x: nx, y: ny };
    }
  }

  // ----------------------------------------------------------
  // Animals system
  // ----------------------------------------------------------
  private _spawnAnimals(): void {
    const animals = this._world.animals;
    const wildCount = animals.filter(a => a.state === 'wild').length;

    // Keep ~3-5 wild animals in the world
    if (wildCount < 3) {
      const types: AnimalType[] = ['rabbit', 'deer', 'chicken', 'wolf'];
      const weights = [0.35, 0.25, 0.25, 0.15];
      const roll = Math.random();
      let cumulative = 0;
      let type: AnimalType = 'rabbit';
      for (let i = 0; i < types.length; i++) {
        cumulative += weights[i];
        if (roll < cumulative) { type = i as any; type = types[i]; break; }
      }

      // Spawn at map edge
      const edge = Math.floor(Math.random() * 4);
      let x: number, y: number;
      const tiles = this._world.tiles;
      if (edge === 0) { x = 1; y = 1 + Math.floor(Math.random() * (WORLD_HEIGHT - 2)); }
      else if (edge === 1) { x = WORLD_WIDTH - 2; y = 1 + Math.floor(Math.random() * (WORLD_HEIGHT - 2)); }
      else if (edge === 2) { x = 1 + Math.floor(Math.random() * (WORLD_WIDTH - 2)); y = 1; }
      else { x = 1 + Math.floor(Math.random() * (WORLD_WIDTH - 2)); y = WORLD_HEIGHT - 2; }

      if (tiles[y]?.[x]?.passable) {
        const animal: Animal = {
          id: uuidv4(),
          type,
          position: { x, y },
          state: 'wild',
          health: 100,
          hunger: 80,
          produceTimer: 0,
        };
        this._world.addAnimal(animal);
        const animalNames: Record<AnimalType, string> = {
          rabbit: '🐰 Кролик', deer: '🦌 Олень', wolf: '🐺 Волк',
          chicken: '🐔 Курица', cow: '🐄 Корова', pig: '🐷 Свинья'
        };
        this._world.addEvent('animal', `${animalNames[type]} появился на поляне!`);
        this._callbacks.onNewEvent();
        this._callbacks.onAnimalUpdate();
      }
    }
  }

  private _tickAnimals(): void {
    const tiles = this._world.tiles;
    const char = this._world.character;
    const toRemove: string[] = [];

    for (const animal of this._world.animals) {
      animal.hunger = Math.max(0, animal.hunger - 0.1);

      if (animal.state === 'wild') {
        // Wild animals wander
        if (Math.random() < 0.2) {
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, animal.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, animal.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) animal.position = { x: nx, y: ny };
        }

        // Wolf attacks if near character
        if (animal.type === 'wolf') {
          const dist = Math.abs(animal.position.x - char.position.x) + Math.abs(animal.position.y - char.position.y);
          if (dist <= 2) {
            char.needs.mood = clamp(char.needs.mood - 5, 0, 100);
            char.emotions.fear = clamp(char.emotions.fear + 15, 0, 100);
            if (Math.random() < 0.3) {
              char.needs.energy = clamp(char.needs.energy - 10, 0, 100);
              this._world.addEvent('animal', `🐺 Волк напал на ${char.name}!`);
              this._callbacks.onNewEvent();
            }
          }
          // Wolf moves toward character sometimes
          if (dist > 2 && dist <= 6 && Math.random() < 0.3) {
            const dx = Math.sign(char.position.x - animal.position.x);
            const dy = Math.sign(char.position.y - animal.position.y);
            const nx = animal.position.x + dx;
            const ny = animal.position.y + dy;
            if (tiles[ny]?.[nx]?.passable) animal.position = { x: nx, y: ny };
          }
        }

        // Flee from character
        if (animal.type !== 'wolf') {
          const dist = Math.abs(animal.position.x - char.position.x) + Math.abs(animal.position.y - char.position.y);
          if (dist <= 3 && Math.random() < 0.4) {
            const dx = Math.sign(animal.position.x - char.position.x);
            const dy = Math.sign(animal.position.y - char.position.y);
            const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, animal.position.x + dx));
            const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, animal.position.y + dy));
            if (tiles[ny]?.[nx]?.passable) animal.position = { x: nx, y: ny };
          }
        }

        // Despawn if hungry too long
        if (animal.hunger <= 0) {
          toRemove.push(animal.id);
        }
      } else if (animal.state === 'tamed' || animal.state === 'farm') {
        // Tamed animals stay near home
        const homeX = 10;
        const homeY = 11;
        const dist = Math.abs(animal.position.x - homeX) + Math.abs(animal.position.y - homeY);
        if (dist > 5) {
          const dx = Math.sign(homeX - animal.position.x);
          const dy = Math.sign(homeY - animal.position.y);
          const nx = animal.position.x + dx;
          const ny = animal.position.y + dy;
          if (tiles[ny]?.[nx]?.passable) animal.position = { x: nx, y: ny };
        } else if (Math.random() < 0.1) {
          // Small wander near home
          const dx = Math.floor(Math.random() * 3) - 1;
          const dy = Math.floor(Math.random() * 3) - 1;
          const nx = Math.max(1, Math.min(WORLD_WIDTH - 2, animal.position.x + dx));
          const ny = Math.max(1, Math.min(WORLD_HEIGHT - 2, animal.position.y + dy));
          if (tiles[ny]?.[nx]?.passable) animal.position = { x: nx, y: ny };
        }

        // Produce resources
        animal.produceTimer++;
        if (animal.produceTimer >= 50) {
          animal.produceTimer = 0;
          if (animal.type === 'chicken') {
            addToInventory(char, 'food', 2);
            this._world.addEvent('animal', `🥚 ${animal.name || 'Курица'} снесла яйца!`);
            this._callbacks.onNewEvent();
          } else if (animal.type === 'cow') {
            addToInventory(char, 'food', 3);
            this._world.addEvent('animal', `🥛 ${animal.name || 'Корова'} дала молоко!`);
            this._callbacks.onNewEvent();
          } else if (animal.type === 'pig') {
            addToInventory(char, 'food', 2);
            this._world.addEvent('animal', `🐷 ${animal.name || 'Свинья'} нашла трюфели!`);
            this._callbacks.onNewEvent();
          }
        }

        // Tamed animals boost mood
        char.emotions.loneliness = clamp(char.emotions.loneliness - 0.01, 0, 100);
      }
    }

    for (const id of toRemove) {
      this._world.removeAnimal(id);
    }
  }

  private _resolveHunt(): void {
    const char = this._world.character;
    const wildAnimals = this._world.animals.filter(a => a.state === 'wild' && a.type !== 'wolf');

    // Find nearest wild animal
    let nearest: Animal | null = null;
    let minDist = Infinity;
    for (const a of wildAnimals) {
      const d = Math.abs(a.position.x - char.position.x) + Math.abs(a.position.y - char.position.y);
      if (d < minDist) { minDist = d; nearest = a; }
    }

    if (nearest && minDist <= 8) {
      const success = Math.random() < 0.6;
      if (success) {
        addToInventory(char, 'meat', nearest.type === 'deer' ? 5 : 2);
        addToInventory(char, 'leather', nearest.type === 'deer' ? 2 : 1);
        const animalNames: Record<string, string> = {
          rabbit: 'кролика', deer: 'оленя', chicken: 'курицу',
        };
        this._world.addEvent('animal', `🏹 ${char.name} поймал ${animalNames[nearest.type] || 'животное'}! (+мясо, +кожа)`);
        this._world.removeAnimal(nearest.id);
        char.emotions.pride = clamp(char.emotions.pride + 10, 0, 100);
        this._callbacks.onNewEvent();
        this._callbacks.onAnimalUpdate();
      } else {
        this._world.addEvent('animal', `${char.name} не смог поймать добычу.`);
        this._callbacks.onNewEvent();
      }
    }

    // Wolf hunting
    const wolves = this._world.animals.filter(a => a.state === 'wild' && a.type === 'wolf');
    if (wolves.length > 0) {
      const wolf = wolves.find(w => Math.abs(w.position.x - char.position.x) + Math.abs(w.position.y - char.position.y) <= 5);
      if (wolf && Math.random() < 0.4) {
        addToInventory(char, 'meat', 3);
        addToInventory(char, 'leather', 3);
        this._world.addEvent('animal', `⚔️ ${char.name} победил волка! (+мясо, +кожа)`);
        this._world.removeAnimal(wolf.id);
        char.emotions.pride = clamp(char.emotions.pride + 20, 0, 100);
        char.emotions.fear = 0;
        this._callbacks.onNewEvent();
        this._callbacks.onAnimalUpdate();
      }
    }
  }

  private _resolveTame(): void {
    const char = this._world.character;
    const wildAnimals = this._world.animals.filter(a => a.state === 'wild' && a.type !== 'wolf');

    let nearest: Animal | null = null;
    let minDist = Infinity;
    for (const a of wildAnimals) {
      const d = Math.abs(a.position.x - char.position.x) + Math.abs(a.position.y - char.position.y);
      if (d < minDist) { minDist = d; nearest = a; }
    }

    if (nearest && getInventoryAmount(char, 'food') >= 3) {
      // Consume food to tame
      char.inventory.find(i => i.type === 'food')!.amount -= 3;
      char.inventory = char.inventory.filter(i => i.amount > 0);

      const chance = nearest.type === 'rabbit' ? 0.7 : nearest.type === 'chicken' ? 0.6 : nearest.type === 'deer' ? 0.3 : 0.1;
      if (Math.random() < chance) {
        nearest.state = 'tamed';
        const animalNames: Record<string, string> = {
          rabbit: 'Кролик', deer: 'Олень', chicken: 'Курица',
          cow: 'Корова', pig: 'Свинья',
        };
        const petNames = ['Пушок', 'Звёздочка', 'Рыжик', 'Снежок', 'Умка', 'Белка', 'Мурка'];
        nearest.name = petNames[Math.floor(Math.random() * petNames.length)];
        this._world.addEvent('animal', `🎉 ${char.name} приручил ${animalNames[nearest.type] || 'животное'}! Имя: ${nearest.name}`);
        char.emotions.excitement = clamp(char.emotions.excitement + 30, 0, 100);
        char.needs.mood = clamp(char.needs.mood + 15, 0, 100);
        this._callbacks.onNewEvent();
        this._callbacks.onAnimalUpdate();
      } else {
        this._world.addEvent('animal', `${char.name} не смог приручить животное. Оно убежало.`);
        this._callbacks.onNewEvent();
      }
    }
  }

  private _resolveFarm(): void {
    const char = this._world.character;
    const farmed = this._world.animals.filter(a => a.state === 'tamed' || a.state === 'farm');

    for (const animal of farmed) {
      animal.hunger = Math.min(100, animal.hunger + 20);
      animal.state = 'farm';
    }

    if (farmed.length > 0) {
      addToInventory(char, 'food', farmed.length);
      this._world.addEvent('animal', `🌾 ${char.name} покормил ${farmed.length} животных и собрал продукты.`);
      this._callbacks.onNewEvent();
    }
  }

  // ----------------------------------------------------------
  // Resolve invite NPC (called by AI action or manual WebSocket)
  // ----------------------------------------------------------
  private _resolveInvite(role: 'worker' | 'companion' | 'auto'): void {
    const char = this._world.character;
    const npcs = this._world.npcs;
    const hasCompanion = npcs.some(n => n.role === 'companion');
    const workers = npcs.filter(n => n.role === 'worker');

    let spawnRole: 'worker' | 'companion';
    if (role === 'auto') {
      // Auto-decide based on state
      if (!hasCompanion && char.homeLevel >= 3) {
        spawnRole = Math.random() < 0.4 ? 'companion' : 'worker';
      } else {
        spawnRole = 'worker';
      }
    } else {
      spawnRole = role;
    }

    // Companion: only one allowed
    if (spawnRole === 'companion' && hasCompanion) {
      spawnRole = 'worker';
    }

    // Workers: max 5
    if (spawnRole === 'worker' && workers.length >= 5) {
      this._world.addEvent('npc', `${char.name} не нашёл никого в лесу...`);
      this._callbacks.onNewEvent();
      return;
    }

    const npc = createNPC(spawnRole);
    if (spawnRole === 'companion') {
      npc.emotions.love = 20;
      npc.emotions.excitement = 60;
    }
    this._world.addNPC(npc);

    const msg = spawnRole === 'companion'
      ? `💕 ${char.name} нашёл спутницу — ${npc.name}!`
      : `👷 ${char.name} нашёл работника — ${npc.name}!`;

    this._world.addEvent('npc', msg);
    char.emotions.excitement = clamp(char.emotions.excitement + 30, 0, 100);
    char.emotions.loneliness = clamp(char.emotions.loneliness - 25, 0, 100);
    this._callbacks.onNewEvent();
    this._callbacks.onNPCUpdate();
  }

  // Public method for WebSocket: player manually invites NPC
  public inviteNPC(role: 'worker' | 'companion'): void {
    this._resolveInvite(role);
  }

  // ----------------------------------------------------------
  // Emotions update
  // ----------------------------------------------------------
  private _updateAllEmotions(): void {
    const char = this._world.character;
    const npcs = this._world.npcs;
    const hasCompanion = npcs.some(n => n.role === 'companion');
    const hasChildren = npcs.some(n => n.role === 'child');
    const animalCount = this._world.animals.filter(a => a.state === 'tamed' || a.state === 'farm').length;

    updateEmotions(char, hasCompanion, hasChildren, animalCount);

    // Emit emotion events occasionally
    if (char.emotions.loneliness > 80 && Math.random() < 0.05) {
      this._world.addEvent('emotion', `😔 ${char.name} чувствует себя одиноким...`);
      this._callbacks.onNewEvent();
    }
    if (char.emotions.love > 80 && hasCompanion && Math.random() < 0.03) {
      const comp = npcs.find(n => n.role === 'companion');
      if (comp) {
        this._world.addEvent('emotion', `❤️ ${char.name} нежно смотрит на ${comp.name}.`);
        this._callbacks.onNewEvent();
      }
    }
    if (char.emotions.pride > 80 && Math.random() < 0.02) {
      this._world.addEvent('emotion', `💪 ${char.name} горд своими достижениями!`);
      this._callbacks.onNewEvent();
    }
    if (char.emotions.fear > 50 && Math.random() < 0.05) {
      this._world.addEvent('emotion', `😰 ${char.name} боится... Что-то рядом.`);
      this._callbacks.onNewEvent();
    }

    // Update NPC emotions
    for (const npc of npcs) {
      if (!npc.emotions) {
        npc.emotions = { love: 0, loneliness: 50, pride: 20, grief: 0, excitement: 30, fear: 0 };
      }
      const nearPartner = Math.abs(npc.position.x - char.position.x) + Math.abs(npc.position.y - char.position.y) <= 3;
      const nearChildren = npcs.some(n => n.role === 'child' &&
        Math.abs(n.position.x - npc.position.x) + Math.abs(n.position.y - npc.position.y) <= 3
      );
      updateNPCEmotions(npc, nearPartner, nearChildren);

      // Companion emotional events
      if (npc.role === 'companion' && npc.emotions.love > 70 && npc.emotions.excitement > 70 && Math.random() < 0.03) {
        this._world.addEvent('emotion', `💕 ${npc.name} счастлива рядом с ${char.name}!`);
        this._callbacks.onNewEvent();
      }
      if (npc.role === 'companion' && npc.emotions.loneliness > 70 && Math.random() < 0.04) {
        this._world.addEvent('emotion', `😢 ${npc.name} скучает по ${char.name}...`);
        this._callbacks.onNewEvent();
      }
    }
  }

  // ----------------------------------------------------------
  // Регенерация ресурсов
  // ----------------------------------------------------------
  private _regenerateResources(): void {
    const tiles = this._world.tiles;
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
      this._callbacks.onTileChanged(pos.x, pos.y);
    }
  }

  // ----------------------------------------------------------
  // Проверка спавна NPC
  // ----------------------------------------------------------
  private _checkNPCSpawn(): void {
    const char = this._world.character;
    const npcs = this._world.npcs;

    const workers = npcs.filter(n => n.role === 'worker');
    if (char.homeLevel >= 3 && workers.length < Math.min(char.homeLevel - 1, 5)) {
      if (Math.random() < 0.3) {
        const npc = createNPC('worker');
        this._world.addNPC(npc);
        this._world.addEvent('npc', `👷 К ${char.name} пришёл работник — ${npc.name}!`);
        char.emotions.excitement = clamp(char.emotions.excitement + 20, 0, 100);
        this._callbacks.onNewEvent();
        this._callbacks.onNPCUpdate();
      }
    }

    const companions = npcs.filter(n => n.role === 'companion');
    if (char.homeLevel >= 4 && companions.length === 0) {
      if (Math.random() < 0.2) {
        const npc = createNPC('companion');
        npc.emotions.love = 30;
        npc.emotions.excitement = 60;
        this._world.addNPC(npc);
        this._world.addEvent('npc', `💕 На поляну пришла ${npc.name}!`);
        char.emotions.excitement = clamp(char.emotions.excitement + 40, 0, 100);
        char.emotions.loneliness = clamp(char.emotions.loneliness - 30, 0, 100);
        this._callbacks.onNewEvent();
        this._callbacks.onNPCUpdate();
      }
    }

    if (companions.length > 0) {
      const comp = companions[0];
      const children = npcs.filter(n => n.role === 'child');
      if (comp.tickAge > 1000 && children.length < 3 && comp.relationship > 70 && comp.emotions.love > 60) {
        if (Math.random() < 0.1) {
          const child = createNPC('child', [char.name, comp.id]);
          this._world.addNPC(child);
          this._world.addEvent('npc', `👶 У ${char.name} и ${comp.name} родился ребёнок — ${child.name}!`);
          char.needs.mood = clamp(char.needs.mood + 30, 0, 100);
          char.emotions.love = clamp(char.emotions.love + 20, 0, 100);
          char.emotions.pride = clamp(char.emotions.pride + 25, 0, 100);
          comp.emotions.love = clamp(comp.emotions.love + 30, 0, 100);
          comp.relationship = Math.min(100, comp.relationship + 20);
          this._callbacks.onNewEvent();
          this._callbacks.onNPCUpdate();
        }
      }
      comp.relationship = Math.min(100, comp.relationship + 0.01);
      comp.emotions.love = clamp(comp.emotions.love + 0.005, 0, 100);
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
        char.needs.mood = clamp(char.needs.mood + 15, 0, 100);
        char.emotions.pride = clamp(char.emotions.pride + 15, 0, 100);
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
    // Check if this is a command
    const isCommand = this._isCommand(message);
    if (isCommand) {
      this.queueChatCommand(message);
    }

    import('../ai/mind').then(({ generateChatResponse }) => {
      const char = this._world.character;
      const recentChat = this._world.getRecentChatRaw();
      const recentEvents = this._world.state.recentEvents.slice(-5);

      generateChatResponse(char, message, recentChat, recentEvents)
        .then(response => {
          onResponse(response);
          char.needs.mood = clamp(char.needs.mood + 5, 0, 100);
          char.relationship = Math.min(char.relationship + 2, 100);
        })
        .catch(err => {
          console.error('[Simulation] Ошибка ответа в чате:', err);
          onResponse('...');
        });
    });
  }

  private _isCommand(msg: string): boolean {
    const keywords = [
      'иди', 'пройди', 'сходи', 'руби', 'собери', 'поешь', 'ешь', 'спи', 'отдохни',
      'строй', 'охот', 'прируч', 'ферм', 'go', 'chop', 'eat', 'sleep', 'build', 'hunt', 'tame', 'farm',
      'дом', 'домой', 'дерев', 'камн', 'ягод', 'еды', 'еда',
    ];
    const lower = msg.toLowerCase();
    return keywords.some(k => lower.includes(k));
  }

  getWorld(): WorldManager {
    return this._world;
  }
}
