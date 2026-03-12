import type { CharacterState, WorldTile, ActionType, WorldState } from '../../../shared/types';
import {
  addToInventory,
  eatFood,
  applyBuild,
  isNearHome,
  getInventoryAmount,
} from './character';
import {
  findTilesOfType,
  findAdjacentPassable,
  HOME_TILES,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from './worldMap';

// ============================================================
// Result of executing one action step
// ============================================================
export interface ActionResult {
  completed: boolean;       // true = action done, pick new one
  eventMessage?: string;    // message to broadcast
  tileChanged?: WorldTile;  // if a tile was modified
}

// ============================================================
// Start a new action — sets up target, returns initial event
// ============================================================
export function startAction(
  char: CharacterState,
  action: ActionType,
  tiles: WorldTile[][]
): { eventMessage: string } {
  char.currentAction = action;
  char.actionProgress = 0;

  switch (action) {
    case 'WANDER': {
      char.targetPosition = randomPassableTile(tiles, char.position);
      char.currentIntentLabel = 'wandering around';
      return { eventMessage: 'Alder starts wandering.' };
    }
    case 'COLLECT_WOOD': {
      const trees = findTilesOfType(tiles, 'TREE', char.position);
      const adj = trees.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'looking for wood';
      return { eventMessage: 'Alder heads toward the trees.' };
    }
    case 'COLLECT_STONE': {
      const stones = findTilesOfType(tiles, 'STONE', char.position);
      const adj = stones.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'searching for stone';
      return { eventMessage: 'Alder looks for stones to gather.' };
    }
    case 'COLLECT_FOOD': {
      const bushes = findTilesOfType(tiles, 'BERRY_BUSH', char.position);
      const adj = bushes.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'foraging for berries';
      return { eventMessage: 'Alder heads to the berry bushes.' };
    }
    case 'EAT': {
      char.targetPosition = { ...HOME_TILES.campfire };
      char.currentIntentLabel = 'eating';
      return { eventMessage: 'Alder decides to eat something.' };
    }
    case 'REST': {
      char.targetPosition = { ...HOME_TILES.bed };
      char.currentIntentLabel = 'resting';
      return { eventMessage: 'Alder heads to rest.' };
    }
    case 'BUILD': {
      char.targetPosition = { ...HOME_TILES.chest };
      char.currentIntentLabel = 'building';
      return { eventMessage: 'Alder prepares to build something.' };
    }
    case 'THINK': {
      char.targetPosition = null;
      char.currentIntentLabel = 'thinking';
      return { eventMessage: 'Alder pauses, deep in thought.' };
    }
    default: {
      char.targetPosition = null;
      char.currentIntentLabel = 'idling';
      return { eventMessage: 'Alder stands still.' };
    }
  }
}

// ============================================================
// Progress an in-flight action each tick
// ============================================================
export function progressAction(
  char: CharacterState,
  tiles: WorldTile[][]
): ActionResult {
  // Move toward target if we have one
  if (char.targetPosition) {
    const dx = char.targetPosition.x - char.position.x;
    const dy = char.targetPosition.y - char.position.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist > 0) {
      stepToward(char, tiles);
      char.actionProgress = Math.min(char.actionProgress + 5, 95);
      return { completed: false };
    }
  }

  // At target — do the action
  return executeAtTarget(char, tiles);
}

// ============================================================
// Execute action at the destination
// ============================================================
function executeAtTarget(
  char: CharacterState,
  tiles: WorldTile[][]
): ActionResult {
  switch (char.currentAction) {
    case 'WANDER':
      return { completed: true, eventMessage: 'Alder had a look around.' };

    case 'COLLECT_WOOD': {
      const tree = findAdjacentResource(tiles, char.position, 'TREE');
      if (tree) {
        const gained = Math.min(2, tree.resource);
        tree.resource -= gained;
        addToInventory(char, 'wood', gained);
        if (tree.resource <= 0) tree.type = 'GRASS' as any, tree.passable = true;
        return {
          completed: true,
          eventMessage: `Alder collected ${gained} wood. (total: ${getInventoryAmount(char, 'wood')})`,
          tileChanged: tree,
        };
      }
      return { completed: true, eventMessage: 'No wood nearby to collect.' };
    }

    case 'COLLECT_STONE': {
      const stone = findAdjacentResource(tiles, char.position, 'STONE');
      if (stone) {
        const gained = Math.min(2, stone.resource);
        stone.resource -= gained;
        addToInventory(char, 'stone', gained);
        if (stone.resource <= 0) stone.type = 'GRASS' as any, stone.passable = true;
        return {
          completed: true,
          eventMessage: `Alder collected ${gained} stone. (total: ${getInventoryAmount(char, 'stone')})`,
          tileChanged: stone,
        };
      }
      return { completed: true, eventMessage: 'No stone nearby to collect.' };
    }

    case 'COLLECT_FOOD': {
      const bush = findAdjacentResource(tiles, char.position, 'BERRY_BUSH');
      if (bush) {
        const gained = Math.min(3, bush.resource);
        bush.resource -= gained;
        addToInventory(char, 'food', gained);
        if (bush.resource <= 0) bush.type = 'GRASS' as any, bush.passable = true;
        return {
          completed: true,
          eventMessage: `Alder picked ${gained} berries. (total: ${getInventoryAmount(char, 'food')})`,
          tileChanged: bush,
        };
      }
      return { completed: true, eventMessage: 'No berries nearby.' };
    }

    case 'EAT': {
      const ate = eatFood(char);
      return {
        completed: true,
        eventMessage: ate
          ? `Alder ate some food. Hunger: ${Math.round(char.needs.hunger)}`
          : 'No food to eat!',
      };
    }

    case 'REST': {
      // REST is a multi-tick action — we handle it in the loop
      char.actionProgress += 10;
      if (char.actionProgress >= 100) {
        return {
          completed: true,
          eventMessage: `Alder finished resting. Energy: ${Math.round(char.needs.energy)}`,
        };
      }
      return { completed: false };
    }

    case 'BUILD': {
      const msg = applyBuild(char);
      return {
        completed: true,
        eventMessage: msg,
      };
    }

    case 'THINK': {
      char.actionProgress += 20;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: 'Alder finishes pondering.' };
      }
      return { completed: false };
    }

    default:
      return { completed: true };
  }
}

// ============================================================
// Move one step toward target (Manhattan path)
// ============================================================
function stepToward(char: CharacterState, tiles: WorldTile[][]): void {
  if (!char.targetPosition) return;

  const dx = char.targetPosition.x - char.position.x;
  const dy = char.targetPosition.y - char.position.y;

  // Try to move in the axis with greater distance first
  const candidates: Array<{ x: number; y: number }> = [];

  if (Math.abs(dx) >= Math.abs(dy)) {
    candidates.push({ x: char.position.x + Math.sign(dx), y: char.position.y });
    candidates.push({ x: char.position.x, y: char.position.y + Math.sign(dy) });
  } else {
    candidates.push({ x: char.position.x, y: char.position.y + Math.sign(dy) });
    candidates.push({ x: char.position.x + Math.sign(dx), y: char.position.y });
  }

  for (const candidate of candidates) {
    if (
      candidate.x >= 0 && candidate.x < WORLD_WIDTH &&
      candidate.y >= 0 && candidate.y < WORLD_HEIGHT &&
      tiles[candidate.y][candidate.x].passable
    ) {
      char.position = candidate;
      return;
    }
  }
}

// ============================================================
// Find a resource tile adjacent to position
// ============================================================
function findAdjacentResource(
  tiles: WorldTile[][],
  pos: { x: number; y: number },
  type: string
): WorldTile | null {
  const dirs = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];

  for (const { dx, dy } of dirs) {
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
      const tile = tiles[ny][nx];
      if (tile.type === type && tile.resource > 0) return tile;
    }
  }

  // Also check same tile (for beds/campfire)
  const cur = tiles[pos.y]?.[pos.x];
  if (cur?.type === type) return cur;

  return null;
}

// ============================================================
// Random passable tile for wandering
// ============================================================
function randomPassableTile(
  tiles: WorldTile[][],
  near: { x: number; y: number }
): { x: number; y: number } {
  const candidates: Array<{ x: number; y: number }> = [];
  const RADIUS = 5;

  for (let dy = -RADIUS; dy <= RADIUS; dy++) {
    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      const nx = near.x + dx;
      const ny = near.y + dy;
      if (
        nx >= 1 && nx < WORLD_WIDTH - 1 &&
        ny >= 1 && ny < WORLD_HEIGHT - 1 &&
        tiles[ny][nx].passable
      ) {
        candidates.push({ x: nx, y: ny });
      }
    }
  }

  if (candidates.length === 0) return near;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
