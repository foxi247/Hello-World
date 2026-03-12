import type { WorldTile, TileType } from '../../../shared/types';

// ============================================================
// World dimensions
// ============================================================
export const WORLD_WIDTH = 20;   // tiles
export const WORLD_HEIGHT = 15;  // tiles

// ============================================================
// Initial world layout
// Legend:
//   . = grass      T = tree       S = stone
//   B = berry bush W = water      C = campfire
//   D = bed        X = chest      # = wall
//   F = floor
// ============================================================
const MAP_LAYOUT: string[] = [
  'TTTTTTTTTTTTTTTTTTTT',
  'T..................T',
  'T..T.....S......B..T',
  'T.....T............T',
  'T..B.....S.........T',
  'T..................T',
  'T.....T.......T....T',
  'T..S...............T',
  'T..........S....B..T',
  'T..................T',
  'T.......####.......T',
  'T.......#FF#.......T',
  'T..B....#FC#.......T',
  'T.......D..X.......T',
  'TTTTTTTTTTTTTTTTTTTT',
];

// Tile passability и ресурсы
const TILE_CONFIG: Record<string, { type: TileType; passable: boolean; resource: number }> = {
  '.': { type: 'GRASS', passable: true, resource: 0 },
  T:  { type: 'TREE',  passable: false, resource: 10 },
  S:  { type: 'STONE', passable: false, resource: 8 },
  B:  { type: 'BERRY_BUSH', passable: false, resource: 6 },
  W:  { type: 'WATER', passable: false, resource: 0 },
  C:  { type: 'CAMPFIRE', passable: true, resource: 0 },
  D:  { type: 'BED',   passable: true, resource: 0 },
  X:  { type: 'CHEST', passable: true, resource: 0 },
  '#': { type: 'WALL', passable: false, resource: 0 },
  F:  { type: 'FLOOR', passable: true, resource: 0 },
};

// ============================================================
// Build initial tile grid
// ============================================================
export function buildInitialWorld(): WorldTile[][] {
  const tiles: WorldTile[][] = [];

  for (let row = 0; row < WORLD_HEIGHT; row++) {
    const rowData: WorldTile[] = [];
    const line = MAP_LAYOUT[row] ?? '';

    for (let col = 0; col < WORLD_WIDTH; col++) {
      const char = line[col] ?? '.';
      const config = TILE_CONFIG[char] ?? TILE_CONFIG['.'];
      rowData.push({
        type: config.type,
        x: col,
        y: row,
        resource: config.resource,
        passable: config.passable,
      });
    }
    tiles.push(rowData);
  }

  return tiles;
}

// ============================================================
// Helper: find tiles of a given type within radius
// ============================================================
export function findTilesOfType(
  tiles: WorldTile[][],
  type: TileType,
  near: { x: number; y: number },
  maxRadius = 15
): WorldTile[] {
  const results: WorldTile[] = [];

  for (let row = 0; row < WORLD_HEIGHT; row++) {
    for (let col = 0; col < WORLD_WIDTH; col++) {
      const tile = tiles[row][col];
      if (tile.type === type && tile.resource > 0) {
        const dist = Math.abs(col - near.x) + Math.abs(row - near.y);
        if (dist <= maxRadius) results.push(tile);
      }
    }
  }

  // Sort by proximity
  results.sort((a, b) => {
    const da = Math.abs(a.x - near.x) + Math.abs(a.y - near.y);
    const db = Math.abs(b.x - near.x) + Math.abs(b.y - near.y);
    return da - db;
  });

  return results;
}

// ============================================================
// Helper: find nearest passable tile next to target
// ============================================================
export function findAdjacentPassable(
  tiles: WorldTile[][],
  target: { x: number; y: number }
): { x: number; y: number } | null {
  const directions = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  ];

  for (const { dx, dy } of directions) {
    const nx = target.x + dx;
    const ny = target.y + dy;
    if (nx >= 0 && nx < WORLD_WIDTH && ny >= 0 && ny < WORLD_HEIGHT) {
      if (tiles[ny][nx].passable) {
        return { x: nx, y: ny };
      }
    }
  }

  return null;
}

// ============================================================
// Character starting position (near the home area)
// ============================================================
export const CHARACTER_START: { x: number; y: number } = { x: 10, y: 11 };

// ============================================================
// Home tile positions
// ============================================================
export const HOME_TILES = {
  campfire: { x: 12, y: 12 },
  bed:      { x: 7,  y: 13 },
  chest:    { x: 11, y: 13 },
};
