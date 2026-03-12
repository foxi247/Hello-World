import type {
  CharacterState,
  ActionType,
  ResourceType,
  InventoryItem,
} from '../../../shared/types';
import { CHARACTER_START } from './worldMap';

// ============================================================
// Default character state
// ============================================================
export function createCharacter(): CharacterState {
  return {
    name: 'Alder',
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
    currentThought: 'Another day in my clearing. What shall I do first?',
    currentIntentLabel: 'Taking in the morning',
    homeLevel: 1,   // starts with campfire
    relationship: 50,
    tickAge: 0,
  };
}

// ============================================================
// Needs decay per tick (called every 1s)
// ============================================================
export function decayNeeds(char: CharacterState): void {
  const isResting = char.currentAction === 'REST';
  const isEating  = char.currentAction === 'EAT';

  // Hunger decreases slowly always
  char.needs.hunger = clamp(char.needs.hunger - 0.08, 0, 100);

  // Energy decreases unless resting
  if (isResting) {
    char.needs.energy = clamp(char.needs.energy + 0.6, 0, 100);
  } else {
    char.needs.energy = clamp(char.needs.energy - 0.04, 0, 100);
  }

  // Mood affected by other needs
  const moodTarget = (char.needs.hunger * 0.4 + char.needs.energy * 0.4 + char.needs.comfort * 0.2);
  char.needs.mood = clamp(char.needs.mood + (moodTarget - char.needs.mood) * 0.01, 0, 100);

  // Comfort increases near home (caller checks this separately)
  char.tickAge++;
}

// ============================================================
// Update comfort based on proximity to home
// ============================================================
export function updateComfort(char: CharacterState, isNearHome: boolean): void {
  const target = isNearHome ? 80 : 40;
  char.needs.comfort = clamp(char.needs.comfort + (target - char.needs.comfort) * 0.02, 0, 100);
}

// ============================================================
// Inventory helpers
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
// Urgent need detection
// ============================================================
export function detectUrgentNeed(char: CharacterState): string | null {
  if (char.needs.hunger < 20) return 'low hunger — need to eat';
  if (char.needs.energy < 15) return 'low energy — need to rest';
  if (char.needs.hunger < 40 && getInventoryAmount(char, 'food') === 0)
    return 'getting hungry and no food — need to collect food';
  return null;
}

// ============================================================
// Get available actions based on current state
// ============================================================
export function getAvailableActions(char: CharacterState): ActionType[] {
  const actions: ActionType[] = ['WANDER', 'THINK'];

  // Always can collect
  actions.push('COLLECT_FOOD', 'COLLECT_WOOD', 'COLLECT_STONE');

  // Can eat if has food
  if (getInventoryAmount(char, 'food') > 0) {
    actions.push('EAT');
  }

  // Can rest if has somewhere to sleep (homeLevel >= 1 = campfire)
  if (char.homeLevel >= 1) {
    actions.push('REST');
  }

  // Can build if has enough resources
  if (canBuild(char)) {
    actions.push('BUILD');
  }

  return actions;
}

export function canBuild(char: CharacterState): boolean {
  const level = char.homeLevel;
  const wood  = getInventoryAmount(char, 'wood');
  const stone = getInventoryAmount(char, 'stone');
  const food  = getInventoryAmount(char, 'food');

  if (level === 0) return true;           // campfire: free
  if (level === 1) return wood >= 5 && stone >= 3;  // shelter
  if (level === 2) return wood >= 10 && stone >= 8 && food >= 5;  // hut
  return false;
}

// ============================================================
// Apply eating
// ============================================================
export function eatFood(char: CharacterState): boolean {
  if (!consumeFromInventory(char, 'food', 1)) return false;
  char.needs.hunger = clamp(char.needs.hunger + 25, 0, 100);
  char.needs.mood   = clamp(char.needs.mood + 10, 0, 100);
  return true;
}

// ============================================================
// Apply building
// ============================================================
export function applyBuild(char: CharacterState): string {
  const level = char.homeLevel;

  if (level === 0) {
    char.homeLevel = 1;
    return 'Built a campfire — now the nights feel warmer.';
  }
  if (level === 1) {
    consumeFromInventory(char, 'wood', 5);
    consumeFromInventory(char, 'stone', 3);
    char.homeLevel = 2;
    char.needs.comfort = clamp(char.needs.comfort + 20, 0, 100);
    return 'Built a simple shelter — finally some real cover.';
  }
  if (level === 2) {
    consumeFromInventory(char, 'wood', 10);
    consumeFromInventory(char, 'stone', 8);
    consumeFromInventory(char, 'food', 5);
    char.homeLevel = 3;
    char.needs.comfort = clamp(char.needs.comfort + 30, 0, 100);
    return 'Finished the hut — this is a real home now.';
  }

  return 'Nothing more to build for now.';
}

// ============================================================
// Util
// ============================================================
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function isNearHome(char: CharacterState): boolean {
  const hx = 11;  // home center
  const hy = 12;
  return Math.abs(char.position.x - hx) + Math.abs(char.position.y - hy) <= 4;
}
