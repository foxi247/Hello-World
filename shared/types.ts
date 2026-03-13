// ============================================================
// SHARED TYPES — используются и на сервере, и на клиенте
// ============================================================

export interface Position {
  x: number;
  y: number;
}

export interface CharacterNeeds {
  hunger: number;    // 0-100: 100 = сыт, 0 = очень голоден
  energy: number;    // 0-100: 100 = бодрый, 0 = без сил
  mood: number;      // 0-100: 100 = радостный, 0 = подавлен
  comfort: number;   // 0-100: 100 = комфортно, 0 = дискомфорт
}

// ============================================================
// Emotions system
// ============================================================
export interface EmotionState {
  love: number;        // 0-100: привязанность к партнёру
  loneliness: number;  // 0-100: чувство одиночества
  pride: number;       // 0-100: гордость за достижения
  grief: number;       // 0-100: горе (если кто-то умер/ушёл)
  excitement: number;  // 0-100: возбуждение/волнение
  fear: number;        // 0-100: страх (от хищников)
}

export type ResourceType = 'wood' | 'stone' | 'food' | 'meat' | 'leather';

export interface InventoryItem {
  type: ResourceType;
  amount: number;
}

export type ActionType =
  | 'IDLE'
  | 'WANDER'
  | 'COLLECT_WOOD'
  | 'COLLECT_STONE'
  | 'COLLECT_FOOD'
  | 'EAT'
  | 'REST'
  | 'BUILD'
  | 'THINK'
  | 'MOVE_TO'
  | 'INVENT'
  | 'CRAFT'
  | 'MANAGE_NPC'
  | 'HUNT'
  | 'TAME'
  | 'FARM'
  | 'FISH'
  | 'CHAT_COMMAND';

export interface CharacterState {
  name: string;
  position: Position;
  targetPosition: Position | null;
  needs: CharacterNeeds;
  emotions: EmotionState;
  inventory: InventoryItem[];
  currentAction: ActionType;
  actionProgress: number;      // 0-100
  currentThought: string;
  currentIntentLabel: string;  // human-readable intent
  homeLevel: number;           // 0=ничего, 1=костёр, 2=укрытие, 3=хижина, 4=дом, 5=мастерская
  relationship: number;        // 0-100: отношение к игроку
  tickAge: number;             // сколько тиков прожил
}

// ============================================================
// NPC Types
// ============================================================
export type NPCRole = 'worker' | 'companion' | 'child';

export interface NPCState {
  id: string;
  name: string;
  role: NPCRole;
  position: Position;
  targetPosition: Position | null;
  needs: CharacterNeeds;
  emotions: EmotionState;
  currentAction: ActionType;
  actionProgress: number;
  currentTask: string;           // что делает сейчас
  relationship: number;          // отношение к Олдеру
  tickAge: number;               // возраст в тиках
  parentIds?: string[];          // для детей — id родителей
  isFemale?: boolean;
}

// ============================================================
// Animals
// ============================================================
export type AnimalType = 'rabbit' | 'deer' | 'wolf' | 'chicken' | 'cow' | 'pig';
export type AnimalState = 'wild' | 'tamed' | 'farm';

export interface Animal {
  id: string;
  type: AnimalType;
  position: Position;
  state: AnimalState;
  health: number;        // 0-100
  hunger: number;        // 0-100
  name?: string;         // имя, если приручено
  produceTimer: number;  // для фермы: когда следующая продукция
}

// ============================================================
// Building construction
// ============================================================
export interface BuildingProject {
  id: string;
  type: string;            // wall, floor, fence, etc.
  position: Position;
  progress: number;        // 0-100
  requiredWood: number;
  requiredStone: number;
  completed: boolean;
}

// ============================================================
// Invention/Dynamic Content
// ============================================================
export interface Invention {
  id: string;
  name: string;
  type: 'tool' | 'building' | 'food' | 'decoration';
  description: string;
  recipe: Record<string, number>;  // { wood: 5, stone: 3 }
  effect: string;
  inventedAtTick: number;
}

export type TileType =
  | 'GRASS'
  | 'TREE'
  | 'STONE'
  | 'BERRY_BUSH'
  | 'WATER'
  | 'CAMPFIRE'
  | 'BED'
  | 'CHEST'
  | 'WALL'
  | 'FLOOR'
  | 'WORKSHOP'
  | 'GARDEN'
  | 'FENCE'
  | 'FARM_PLOT'
  | 'ANIMAL_PEN'
  | 'CONSTRUCTION';

export interface WorldTile {
  type: TileType;
  x: number;
  y: number;
  resource: number;   // запас ресурса (для деревьев, камней, кустов)
  passable: boolean;
  buildProgress?: number;  // 0-100 для строящихся тайлов
  targetType?: TileType;   // что будет построено
}

export interface GameEvent {
  id: string;
  tick: number;
  type: 'action' | 'thought' | 'chat_in' | 'chat_out' | 'system' | 'build' | 'invention' | 'npc' | 'animal' | 'emotion';
  message: string;
  timestamp: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'character';
  content: string;
  timestamp: number;
}

export interface WorldState {
  width: number;           // в тайлах
  height: number;
  tiles: WorldTile[][];    // [row][col]
  character: CharacterState;
  npcs: NPCState[];
  animals: Animal[];
  inventions: Invention[];
  tick: number;
  dayPhase: 'dawn' | 'day' | 'dusk' | 'night';
  dayProgress: number;     // 0-100 внутри фазы
  recentEvents: GameEvent[];
  chatHistory: ChatMessage[];
}

// ============================================================
// WebSocket messages: Server → Client
// ============================================================
export type WSServerMessage =
  | { type: 'FULL_STATE';      payload: WorldState }
  | { type: 'CHARACTER_UPDATE'; payload: CharacterState }
  | { type: 'NPC_UPDATE';      payload: NPCState[] }
  | { type: 'ANIMAL_UPDATE';   payload: Animal[] }
  | { type: 'TILE_UPDATE';     payload: { x: number; y: number; tile: WorldTile } }
  | { type: 'NEW_EVENT';       payload: GameEvent }
  | { type: 'CHAT_RESPONSE';   payload: ChatMessage }
  | { type: 'THOUGHT';         payload: string }
  | { type: 'DAY_PHASE';       payload: { phase: WorldState['dayPhase']; progress: number } }
  | { type: 'INVENTION';       payload: Invention }
  | { type: 'ERROR';           payload: string };

// ============================================================
// WebSocket messages: Client → Server
// ============================================================
export type WSClientMessage =
  | { type: 'SEND_CHAT';      payload: string }
  | { type: 'REQUEST_STATE' };
