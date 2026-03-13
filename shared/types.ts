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

export type ResourceType = 'wood' | 'stone' | 'food';

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
  | 'MANAGE_NPC';

export interface CharacterState {
  name: string;
  position: Position;
  targetPosition: Position | null;
  needs: CharacterNeeds;
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
  currentAction: ActionType;
  actionProgress: number;
  currentTask: string;           // что делает сейчас
  relationship: number;          // отношение к Олдеру
  tickAge: number;               // возраст в тиках
  parentIds?: string[];          // для детей — id родителей
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
  | 'FENCE';

export interface WorldTile {
  type: TileType;
  x: number;
  y: number;
  resource: number;   // запас ресурса (для деревьев, камней, кустов)
  passable: boolean;
}

export interface GameEvent {
  id: string;
  tick: number;
  type: 'action' | 'thought' | 'chat_in' | 'chat_out' | 'system' | 'build' | 'invention' | 'npc';
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
