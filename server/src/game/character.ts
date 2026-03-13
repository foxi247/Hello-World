import type {
  CharacterState,
  ActionType,
  ResourceType,
  NPCState,
  NPCRole,
} from '../../../shared/types';
import { CHARACTER_START } from './worldMap';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// Начальное состояние персонажа
// ============================================================
export function createCharacter(): CharacterState {
  return {
    name: 'Олдер',
    position: { ...CHARACTER_START },
    targetPosition: null,
    needs: {
      hunger: 75,
      energy: 85,
      mood: 70,
      comfort: 60,
    },
    inventory: [],
    currentAction: 'IDLE',
    actionProgress: 0,
    currentThought: 'Ещё один день на моей поляне. С чего бы начать?',
    currentIntentLabel: 'осматривается',
    homeLevel: 1,
    relationship: 50,
    tickAge: 0,
  };
}

// ============================================================
// NPC creation
// ============================================================
const NPC_NAMES_MALE = ['Борис', 'Иван', 'Пётр', 'Фёдор', 'Григорий', 'Степан', 'Михаил', 'Данила'];
const NPC_NAMES_FEMALE = ['Мария', 'Анна', 'Елена', 'Ольга', 'Светлана', 'Наташа', 'Катерина', 'Лида'];

export function createNPC(role: NPCRole, parentIds?: string[]): NPCState {
  const isFemale = role === 'companion' || (role === 'child' && Math.random() > 0.5);
  const names = isFemale ? NPC_NAMES_FEMALE : NPC_NAMES_MALE;
  const name = names[Math.floor(Math.random() * names.length)];

  return {
    id: uuidv4(),
    name,
    role,
    position: { x: CHARACTER_START.x + Math.floor(Math.random() * 3) - 1, y: CHARACTER_START.y + Math.floor(Math.random() * 3) - 1 },
    targetPosition: null,
    needs: {
      hunger: 80,
      energy: 80,
      mood: 70,
      comfort: 50,
    },
    currentAction: 'IDLE',
    actionProgress: 0,
    currentTask: role === 'worker' ? 'ждёт указаний' : role === 'companion' ? 'обживается' : 'играет',
    relationship: role === 'child' ? 100 : 60,
    tickAge: role === 'child' ? 0 : 1000,
    parentIds,
  };
}

// ============================================================
// Деградация потребностей каждый тик
// ============================================================
export function decayNeeds(char: CharacterState): void {
  const isResting = char.currentAction === 'REST';

  char.needs.hunger = clamp(char.needs.hunger - 0.08, 0, 100);

  if (isResting) {
    char.needs.energy = clamp(char.needs.energy + 0.6, 0, 100);
  } else {
    char.needs.energy = clamp(char.needs.energy - 0.04, 0, 100);
  }

  const moodTarget = (char.needs.hunger * 0.4 + char.needs.energy * 0.4 + char.needs.comfort * 0.2);
  char.needs.mood = clamp(char.needs.mood + (moodTarget - char.needs.mood) * 0.01, 0, 100);

  char.tickAge++;
}

// ============================================================
// NPC needs decay (slower than main character)
// ============================================================
export function decayNPCNeeds(npc: NPCState): void {
  npc.needs.hunger = clamp(npc.needs.hunger - 0.05, 0, 100);
  npc.needs.energy = clamp(npc.needs.energy - 0.03, 0, 100);

  if (npc.currentAction === 'REST') {
    npc.needs.energy = clamp(npc.needs.energy + 0.5, 0, 100);
  }

  const moodTarget = (npc.needs.hunger * 0.4 + npc.needs.energy * 0.4 + npc.needs.comfort * 0.2);
  npc.needs.mood = clamp(npc.needs.mood + (moodTarget - npc.needs.mood) * 0.01, 0, 100);

  npc.tickAge++;
}

// ============================================================
// Комфорт рядом с домом
// ============================================================
export function updateComfort(char: CharacterState, nearHome: boolean): void {
  const target = nearHome ? 80 : 40;
  char.needs.comfort = clamp(char.needs.comfort + (target - char.needs.comfort) * 0.02, 0, 100);
}

// ============================================================
// Инвентарь
// ============================================================
export function getInventoryAmount(char: CharacterState, type: ResourceType): number {
  return char.inventory.find(i => i.type === type)?.amount ?? 0;
}

export function addToInventory(char: CharacterState, type: ResourceType, amount: number): void {
  const existing = char.inventory.find(i => i.type === type);
  if (existing) {
    existing.amount += amount;
  } else {
    char.inventory.push({ type, amount });
  }
}

export function consumeFromInventory(char: CharacterState, type: ResourceType, amount: number): boolean {
  const existing = char.inventory.find(i => i.type === type);
  if (!existing || existing.amount < amount) return false;
  existing.amount -= amount;
  if (existing.amount === 0) {
    char.inventory = char.inventory.filter(i => i.type !== type);
  }
  return true;
}

// ============================================================
// Определение срочной потребности (РУССКИЙ)
// ============================================================
export function detectUrgentNeed(char: CharacterState): string | null {
  if (char.needs.hunger < 20) return 'сильный голод — надо поесть';
  if (char.needs.energy < 15) return 'нет сил — надо отдохнуть';
  if (char.needs.hunger < 40 && getInventoryAmount(char, 'food') === 0)
    return 'голодает и нет еды — надо собрать ягоды';
  return null;
}

// ============================================================
// Доступные действия
// ============================================================
export function getAvailableActions(char: CharacterState): ActionType[] {
  const actions: ActionType[] = ['WANDER', 'THINK'];

  actions.push('COLLECT_FOOD', 'COLLECT_WOOD', 'COLLECT_STONE');

  if (getInventoryAmount(char, 'food') > 0) {
    actions.push('EAT');
  }

  if (char.homeLevel >= 1) {
    actions.push('REST');
  }

  if (canBuild(char)) {
    actions.push('BUILD');
  }

  // Изобретать можно если сыт, бодрый и в хорошем настроении
  if (char.needs.hunger > 50 && char.needs.energy > 40 && char.needs.mood > 40) {
    actions.push('INVENT');
  }

  return actions;
}

export function canBuild(char: CharacterState): boolean {
  const level = char.homeLevel;
  const wood  = getInventoryAmount(char, 'wood');
  const stone = getInventoryAmount(char, 'stone');
  const food  = getInventoryAmount(char, 'food');

  if (level === 0) return true;                              // костёр: бесплатно
  if (level === 1) return wood >= 5 && stone >= 3;          // укрытие
  if (level === 2) return wood >= 10 && stone >= 8 && food >= 5;  // хижина
  if (level === 3) return wood >= 20 && stone >= 15 && food >= 10; // дом
  if (level === 4) return wood >= 30 && stone >= 20;         // мастерская
  return false;
}

// ============================================================
// Еда
// ============================================================
export function eatFood(char: CharacterState): boolean {
  if (!consumeFromInventory(char, 'food', 1)) return false;
  char.needs.hunger = clamp(char.needs.hunger + 25, 0, 100);
  char.needs.mood   = clamp(char.needs.mood + 10, 0, 100);
  return true;
}

// ============================================================
// Строительство (расширенное, РУССКИЙ)
// ============================================================
export function applyBuild(char: CharacterState): string {
  const level = char.homeLevel;

  if (level === 0) {
    char.homeLevel = 1;
    return '🔥 Развёл костёр — теперь ночи будут теплее.';
  }
  if (level === 1) {
    consumeFromInventory(char, 'wood', 5);
    consumeFromInventory(char, 'stone', 3);
    char.homeLevel = 2;
    char.needs.comfort = clamp(char.needs.comfort + 20, 0, 100);
    return '🏕️ Построил укрытие — наконец-то настоящая крыша!';
  }
  if (level === 2) {
    consumeFromInventory(char, 'wood', 10);
    consumeFromInventory(char, 'stone', 8);
    consumeFromInventory(char, 'food', 5);
    char.homeLevel = 3;
    char.needs.comfort = clamp(char.needs.comfort + 30, 0, 100);
    return '🏠 Достроил хижину — теперь это настоящий дом!';
  }
  if (level === 3) {
    consumeFromInventory(char, 'wood', 20);
    consumeFromInventory(char, 'stone', 15);
    consumeFromInventory(char, 'food', 10);
    char.homeLevel = 4;
    char.needs.comfort = clamp(char.needs.comfort + 30, 0, 100);
    return '🏡 Построил дом — крепкие стены и тёплый очаг! Теперь можно принять гостей.';
  }
  if (level === 4) {
    consumeFromInventory(char, 'wood', 30);
    consumeFromInventory(char, 'stone', 20);
    char.homeLevel = 5;
    char.needs.comfort = clamp(char.needs.comfort + 20, 0, 100);
    return '⚒️ Построил мастерскую — теперь можно изобретать и мастерить!';
  }

  return 'Пока нечего строить.';
}

// ============================================================
// Утилиты
// ============================================================
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function isNearHome(char: CharacterState): boolean {
  const hx = 11;
  const hy = 12;
  return Math.abs(char.position.x - hx) + Math.abs(char.position.y - hy) <= 4;
}
