import type { CharacterState, WorldTile, ActionType } from '../../../shared/types';
import {
  addToInventory,
  eatFood,
  applyBuild,
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
// Результат выполнения одного шага действия
// ============================================================
export interface ActionResult {
  completed: boolean;
  eventMessage?: string;
  tileChanged?: WorldTile;
}

// ============================================================
// Начать новое действие (РУССКИЙ)
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
      char.currentIntentLabel = 'гуляет';
      return { eventMessage: `${char.name} решил прогуляться.` };
    }
    case 'COLLECT_WOOD': {
      const trees = findTilesOfType(tiles, 'TREE', char.position);
      const adj = trees.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'рубит дерево';
      return { eventMessage: `${char.name} направился к деревьям.` };
    }
    case 'COLLECT_STONE': {
      const stones = findTilesOfType(tiles, 'STONE', char.position);
      const adj = stones.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'добывает камень';
      return { eventMessage: `${char.name} ищет камни.` };
    }
    case 'COLLECT_FOOD': {
      const bushes = findTilesOfType(tiles, 'BERRY_BUSH', char.position);
      const adj = bushes.map(t => findAdjacentPassable(tiles, t)).find(Boolean);
      char.targetPosition = adj ?? char.position;
      char.currentIntentLabel = 'собирает ягоды';
      return { eventMessage: `${char.name} пошёл за ягодами.` };
    }
    case 'EAT': {
      char.targetPosition = { ...HOME_TILES.campfire };
      char.currentIntentLabel = 'ест';
      return { eventMessage: `${char.name} решил поесть.` };
    }
    case 'REST': {
      char.targetPosition = { ...HOME_TILES.bed };
      char.currentIntentLabel = 'ложится спать';
      return { eventMessage: `${char.name} пошёл отдыхать.` };
    }
    case 'BUILD': {
      char.targetPosition = { ...HOME_TILES.chest };
      char.currentIntentLabel = 'строит';
      return { eventMessage: `${char.name} готовится строить.` };
    }
    case 'THINK': {
      char.targetPosition = null;
      char.currentIntentLabel = 'думает';
      return { eventMessage: `${char.name} задумался.` };
    }
    case 'INVENT': {
      char.targetPosition = null;
      char.currentIntentLabel = 'изобретает';
      return { eventMessage: `${char.name} размышляет о новом изобретении...` };
    }
    case 'CRAFT': {
      char.targetPosition = { ...HOME_TILES.chest };
      char.currentIntentLabel = 'мастерит';
      return { eventMessage: `${char.name} начал мастерить.` };
    }
    case 'MANAGE_NPC': {
      char.targetPosition = null;
      char.currentIntentLabel = 'управляет';
      return { eventMessage: `${char.name} раздаёт указания.` };
    }
    case 'HUNT': {
      char.targetPosition = randomPassableTile(tiles, char.position, 8);
      char.currentIntentLabel = 'охотится';
      return { eventMessage: `${char.name} вышел на охоту.` };
    }
    case 'TAME': {
      char.targetPosition = null;
      char.currentIntentLabel = 'приручает';
      return { eventMessage: `${char.name} пытается приручить животное.` };
    }
    case 'FARM': {
      char.targetPosition = null;
      char.currentIntentLabel = 'ухаживает за фермой';
      return { eventMessage: `${char.name} занялся фермой.` };
    }
    case 'CHAT_COMMAND': {
      char.currentIntentLabel = 'выполняет просьбу';
      return { eventMessage: `${char.name} слушает Голос.` };
    }
    default: {
      char.targetPosition = null;
      char.currentIntentLabel = 'стоит';
      return { eventMessage: `${char.name} стоит на месте.` };
    }
  }
}

// ============================================================
// Продвижение действия каждый тик
// ============================================================
export function progressAction(
  char: CharacterState,
  tiles: WorldTile[][]
): ActionResult {
  if (char.targetPosition) {
    const dx = char.targetPosition.x - char.position.x;
    const dy = char.targetPosition.y - char.position.y;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist > 0) {
      const moved = stepToward(char, tiles);
      if (!moved) {
        return { completed: true, eventMessage: 'Путь заблокирован.' };
      }
      char.actionProgress = Math.min(char.actionProgress + 5, 95);
      return { completed: false };
    }
  }

  return executeAtTarget(char, tiles);
}

// ============================================================
// Выполнение действия на месте
// ============================================================
function executeAtTarget(
  char: CharacterState,
  tiles: WorldTile[][]
): ActionResult {
  switch (char.currentAction) {
    case 'WANDER':
      return { completed: true, eventMessage: `${char.name} осмотрелся.` };

    case 'COLLECT_WOOD': {
      const tree = findAdjacentResource(tiles, char.position, 'TREE');
      if (tree) {
        const gained = Math.min(2, tree.resource);
        tree.resource -= gained;
        addToInventory(char, 'wood', gained);
        if (tree.resource <= 0) tree.type = 'GRASS' as any, tree.passable = true;
        return {
          completed: true,
          eventMessage: `${char.name} нарубил ${gained} дерева. (всего: ${getInventoryAmount(char, 'wood')})`,
          tileChanged: tree,
        };
      }
      return { completed: true, eventMessage: 'Рядом нет деревьев.' };
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
          eventMessage: `${char.name} собрал ${gained} камня. (всего: ${getInventoryAmount(char, 'stone')})`,
          tileChanged: stone,
        };
      }
      return { completed: true, eventMessage: 'Рядом нет камней.' };
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
          eventMessage: `${char.name} собрал ${gained} ягод. (всего: ${getInventoryAmount(char, 'food')})`,
          tileChanged: bush,
        };
      }
      return { completed: true, eventMessage: 'Ягод поблизости нет.' };
    }

    case 'EAT': {
      const ate = eatFood(char);
      return {
        completed: true,
        eventMessage: ate
          ? `${char.name} поел. Голод: ${Math.round(char.needs.hunger)}`
          : 'Нечего есть!',
      };
    }

    case 'REST': {
      char.actionProgress += 10;
      if (char.actionProgress >= 100) {
        return {
          completed: true,
          eventMessage: `${char.name} отдохнул. Энергия: ${Math.round(char.needs.energy)}`,
        };
      }
      return { completed: false };
    }

    case 'BUILD': {
      // Multi-step building: progress over several ticks
      char.actionProgress += 8;
      if (char.actionProgress >= 100) {
        const msg = applyBuild(char);
        return { completed: true, eventMessage: msg };
      }
      char.currentIntentLabel = `строит (${char.actionProgress}%)`;
      return { completed: false };
    }

    case 'THINK': {
      char.actionProgress += 20;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} закончил размышлять.` };
      }
      return { completed: false };
    }

    case 'INVENT': {
      char.actionProgress += 10;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} закончил думать над изобретением.` };
      }
      return { completed: false };
    }

    case 'CRAFT': {
      char.actionProgress += 15;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} закончил мастерить.` };
      }
      return { completed: false };
    }

    case 'MANAGE_NPC': {
      char.actionProgress += 25;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} раздал указания.` };
      }
      return { completed: false };
    }

    case 'HUNT': {
      char.actionProgress += 8;
      char.currentIntentLabel = `охотится (${char.actionProgress}%)`;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} закончил охоту.` };
      }
      return { completed: false };
    }

    case 'TAME': {
      char.actionProgress += 5;
      char.currentIntentLabel = `приручает (${char.actionProgress}%)`;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} попытался приручить животное.` };
      }
      return { completed: false };
    }

    case 'FARM': {
      char.actionProgress += 10;
      char.currentIntentLabel = `фермерство (${char.actionProgress}%)`;
      if (char.actionProgress >= 100) {
        return { completed: true, eventMessage: `${char.name} поухаживал за фермой.` };
      }
      return { completed: false };
    }

    case 'CHAT_COMMAND': {
      // Executed externally
      return { completed: true, eventMessage: `${char.name} выполнил просьбу.` };
    }

    default:
      return { completed: true };
  }
}

// ============================================================
// Передвижение через BFS
// ============================================================
function stepToward(char: CharacterState, tiles: WorldTile[][]): boolean {
  if (!char.targetPosition) return false;
  const next = bfsNextStep(tiles, char.position, char.targetPosition);
  if (next) {
    char.position = next;
    return true;
  }
  return false;
}

function bfsNextStep(
  tiles: WorldTile[][],
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number } | null {
  if (start.x === end.x && start.y === end.y) return null;

  const dirs = [
    { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
  ];

  const queue: Array<{ x: number; y: number }> = [start];
  const parent = new Map<string, { x: number; y: number } | null>();
  parent.set(`${start.x},${start.y}`, null);

  while (queue.length > 0) {
    const cur = queue.shift()!;

    for (const { dx, dy } of dirs) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;

      if (nx < 0 || nx >= WORLD_WIDTH || ny < 0 || ny >= WORLD_HEIGHT) continue;
      if (parent.has(key)) continue;
      if (!tiles[ny][nx].passable) continue;

      parent.set(key, cur);

      if (nx === end.x && ny === end.y) {
        let node = { x: nx, y: ny };
        while (true) {
          const p = parent.get(`${node.x},${node.y}`)!;
          if (p === null || (p.x === start.x && p.y === start.y)) return node;
          node = p;
        }
      }

      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}

// ============================================================
// Поиск ресурса рядом
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

  const cur = tiles[pos.y]?.[pos.x];
  if (cur?.type === type) return cur;

  return null;
}

// ============================================================
// Случайный проходимый тайл для прогулки
// ============================================================
function randomPassableTile(
  tiles: WorldTile[][],
  near: { x: number; y: number },
  radius = 5
): { x: number; y: number } {
  const candidates: Array<{ x: number; y: number }> = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
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
