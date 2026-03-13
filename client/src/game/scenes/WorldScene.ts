import Phaser from 'phaser';
import type { WorldState, WorldTile, CharacterState, TileType, NPCState, Animal } from '../../types';

// ============================================================
// Константы
// ============================================================
const TILE_SIZE = 32;

const TILE_COLORS: Record<TileType, number> = {
  GRASS:      0x5a8c3e,
  TREE:       0x2d5a1e,
  STONE:      0x8a8a8a,
  BERRY_BUSH: 0x3a7a2a,
  WATER:      0x3a7ab5,
  CAMPFIRE:   0xff6600,
  BED:        0xa07855,
  CHEST:      0xd4a830,
  WALL:       0x7a6548,
  FLOOR:      0xc4a882,
  WORKSHOP:   0x8B7355,
  GARDEN:     0x4a9a3a,
  FENCE:      0x9a7a4a,
  FARM_PLOT:  0x6a5a2a,
  ANIMAL_PEN: 0x8a7a4a,
  CONSTRUCTION: 0x998866,
};

const TILE_BORDER: Record<TileType, number> = {
  GRASS:      0x4a7a2e,
  TREE:       0x1a3a10,
  STONE:      0x6a6a6a,
  BERRY_BUSH: 0x2a6a1a,
  WATER:      0x2a6aa0,
  CAMPFIRE:   0xcc4400,
  BED:        0x806040,
  CHEST:      0xb08820,
  WALL:       0x5a4530,
  FLOOR:      0xb09870,
  WORKSHOP:   0x6a5a3a,
  GARDEN:     0x3a8a2a,
  FENCE:      0x7a5a3a,
  FARM_PLOT:  0x4a3a1a,
  ANIMAL_PEN: 0x6a5a3a,
  CONSTRUCTION: 0x776644,
};

// NPC colors by role
const NPC_COLORS: Record<string, { body: number; shirt: number; hair: number }> = {
  worker:    { body: 0xf4c898, shirt: 0x8B6914, hair: 0x5a3a1a },
  companion: { body: 0xf8d4b0, shirt: 0xcc4466, hair: 0x4a2a0a },
  child:     { body: 0xf8d8c0, shirt: 0x44aa66, hair: 0x8b6a3a },
};

// Animal emoji/colors
const ANIMAL_COLORS: Record<string, { primary: number; secondary: number }> = {
  rabbit:  { primary: 0xccaa88, secondary: 0xffffff },
  deer:    { primary: 0x8b6040, secondary: 0xccaa80 },
  wolf:    { primary: 0x666666, secondary: 0x444444 },
  chicken: { primary: 0xffffff, secondary: 0xff4444 },
  cow:     { primary: 0xeeeeee, secondary: 0x333333 },
  pig:     { primary: 0xffaaaa, secondary: 0xff8888 },
};

// ============================================================
// World Scene
// ============================================================
export class WorldScene extends Phaser.Scene {
  private _tileGraphics: Phaser.GameObjects.Graphics[][] = [];
  private _characterSprite!: Phaser.GameObjects.Container;
  private _characterBody!: Phaser.GameObjects.Graphics;
  private _thoughtBubble!: Phaser.GameObjects.Container;
  private _thoughtText!: Phaser.GameObjects.Text;
  private _nameText!: Phaser.GameObjects.Text;
  private _actionText!: Phaser.GameObjects.Text;
  private _overlay!: Phaser.GameObjects.Rectangle;
  private _worldState: WorldState | null = null;
  private _isMoving = false;
  private _particles: Phaser.GameObjects.Graphics[] = [];
  private _npcSprites: Map<string, { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text; taskText: Phaser.GameObjects.Text }> = new Map();
  private _animalSprites: Map<string, { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text }> = new Map();
  private _actionEffectGraphics: Phaser.GameObjects.Graphics | null = null;
  private _currentAction: string = 'IDLE';
  private _currentDayPhase: string = 'day';

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    this._buildTileGrid();
    this._buildCharacter();
    this._buildDayOverlay();
    this._buildAmbientParticles();
  }

  loadWorldState(state: WorldState) {
    this._worldState = state;
    this._renderTiles(state.tiles);
    this._updateCharacter(state.character);
    this._updateDayOverlay(state.dayPhase, state.dayProgress);
    if (state.npcs) {
      this.updateNPCs(state.npcs);
    }
    if (state.animals) {
      this.updateAnimals(state.animals);
    }
  }

  updateCharacter(char: CharacterState) {
    this._updateCharacter(char);
  }

  updateTile(x: number, y: number) {
    if (!this._worldState) return;
    const tile = this._worldState.tiles[y]?.[x];
    if (tile) this._drawTile(tile, x, y);
  }

  updateDayPhase(phase: string, progress: number) {
    this._currentDayPhase = phase;
    this._updateDayOverlay(phase as WorldState['dayPhase'], progress);
  }

  updateNPCs(npcs: NPCState[]) {
    for (const [id, sprite] of this._npcSprites) {
      if (!npcs.find(n => n.id === id)) {
        sprite.container.destroy();
        this._npcSprites.delete(id);
      }
    }

    for (const npc of npcs) {
      let sprite = this._npcSprites.get(npc.id);
      if (!sprite) {
        sprite = this._createNPCSprite(npc);
        this._npcSprites.set(npc.id, sprite);
      }
      this._updateNPCSprite(sprite, npc);
    }
  }

  updateAnimals(animals: Animal[]) {
    for (const [id, sprite] of this._animalSprites) {
      if (!animals.find(a => a.id === id)) {
        sprite.container.destroy();
        this._animalSprites.delete(id);
      }
    }

    for (const animal of animals) {
      let sprite = this._animalSprites.get(animal.id);
      if (!sprite) {
        sprite = this._createAnimalSprite(animal);
        this._animalSprites.set(animal.id, sprite);
      }
      this._updateAnimalSprite(sprite, animal);
    }
  }

  // ----------------------------------------------------------
  // Тайлы
  // ----------------------------------------------------------
  private _buildTileGrid() {
    if (!this._worldState) {
      const g = this.add.graphics();
      g.fillStyle(0x5a8c3e);
      g.fillRect(0, 0, 20 * TILE_SIZE, 15 * TILE_SIZE);
      return;
    }
    this._renderTiles(this._worldState.tiles);
  }

  private _renderTiles(tiles: WorldTile[][]) {
    for (const row of this._tileGraphics) {
      for (const g of row) g?.destroy();
    }
    this._tileGraphics = [];

    for (let row = 0; row < tiles.length; row++) {
      this._tileGraphics[row] = [];
      for (let col = 0; col < tiles[row].length; col++) {
        const tile = tiles[row][col];
        const g = this.add.graphics();
        this._tileGraphics[row][col] = g;
        this._drawTileGraphic(g, tile, col, row);
      }
    }
  }

  private _drawTile(tile: WorldTile, col: number, row: number) {
    const g = this._tileGraphics[row]?.[col];
    if (!g) return;
    g.clear();
    this._drawTileGraphic(g, tile, col, row);
  }

  private _drawTileGraphic(g: Phaser.GameObjects.Graphics, tile: WorldTile, col: number, row: number) {
    const px = col * TILE_SIZE;
    const py = row * TILE_SIZE;
    const color = TILE_COLORS[tile.type] ?? 0x5a8c3e;
    const border = TILE_BORDER[tile.type] ?? 0x4a7a2e;

    g.fillStyle(TILE_COLORS.GRASS);
    g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    switch (tile.type) {
      case 'GRASS':
        g.fillStyle(color);
        g.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        g.fillStyle(0x6a9c4e, 0.6);
        g.fillRect(px + 5, py + 10, 2, 6);
        g.fillRect(px + 15, py + 18, 2, 5);
        g.fillRect(px + 24, py + 8, 2, 7);
        break;

      case 'TREE': {
        g.fillStyle(0x8b6914);
        g.fillRect(px + 12, py + 16, 8, 16);
        g.fillStyle(0x1a5a10);
        g.fillCircle(px + 16, py + 12, 14);
        g.fillStyle(color);
        g.fillCircle(px + 13, py + 10, 10);
        g.fillStyle(0x3a7a2a);
        g.fillCircle(px + 20, py + 14, 9);
        g.fillStyle(0x2a6a1a);
        g.fillCircle(px + 16, py + 8, 8);
        g.fillStyle(0x4a9a3a, 0.5);
        g.fillCircle(px + 11, py + 7, 4);
        if (tile.resource > 0) {
          g.fillStyle(0xaa8800, 0.6);
          g.fillCircle(px + 25, py + 6, 4);
        }
        break;
      }

      case 'STONE': {
        g.fillStyle(0x999999);
        g.fillEllipse(px + 16, py + 18, 22, 16);
        g.fillStyle(0xbbbbbb);
        g.fillEllipse(px + 12, py + 14, 14, 10);
        g.fillStyle(0x777777);
        g.fillEllipse(px + 20, py + 22, 12, 8);
        g.fillStyle(0xdddddd, 0.4);
        g.fillEllipse(px + 10, py + 12, 6, 4);
        break;
      }

      case 'BERRY_BUSH': {
        g.fillStyle(0x2a6a1a);
        g.fillCircle(px + 16, py + 18, 12);
        g.fillStyle(color);
        g.fillCircle(px + 12, py + 16, 9);
        g.fillCircle(px + 22, py + 17, 8);
        if (tile.resource > 0) {
          g.fillStyle(0xdd2222);
          g.fillCircle(px + 10, py + 14, 3);
          g.fillCircle(px + 18, py + 20, 3);
          g.fillCircle(px + 24, py + 14, 3);
          g.fillCircle(px + 14, py + 22, 2);
          g.fillCircle(px + 22, py + 10, 2);
        }
        break;
      }

      case 'CAMPFIRE': {
        g.fillStyle(0x888888);
        g.fillCircle(px + 16, py + 22, 9);
        g.fillStyle(0x666666);
        g.fillCircle(px + 10, py + 22, 4);
        g.fillCircle(px + 22, py + 22, 4);
        g.fillStyle(0xff4400, 0.3);
        g.fillCircle(px + 16, py + 16, 12);
        g.fillStyle(0xff6600);
        g.fillTriangle(px + 16, py + 8, px + 8, py + 22, px + 24, py + 22);
        g.fillStyle(0xffaa00);
        g.fillTriangle(px + 16, py + 12, px + 11, py + 22, px + 21, py + 22);
        g.fillStyle(0xffdd00);
        g.fillTriangle(px + 16, py + 15, px + 13, py + 22, px + 19, py + 22);
        g.fillStyle(0xffff88, 0.8);
        g.fillCircle(px + 12, py + 10, 1.5);
        g.fillCircle(px + 20, py + 8, 1);
        break;
      }

      case 'BED': {
        g.fillStyle(0x8b6040);
        g.fillRect(px + 2, py + 5, 28, 22);
        g.fillStyle(0xe8d8c0);
        g.fillRect(px + 4, py + 7, 24, 18);
        g.fillStyle(0xffffff);
        g.fillRect(px + 5, py + 8, 10, 8);
        g.fillStyle(0x5577bb);
        g.fillRect(px + 5, py + 16, 22, 8);
        g.fillStyle(0xddddcc);
        g.fillRect(px + 5, py + 14, 10, 2);
        break;
      }

      case 'CHEST': {
        g.fillStyle(color);
        g.fillRect(px + 3, py + 11, 26, 17);
        g.fillStyle(0xe8b840);
        g.fillRect(px + 3, py + 7, 26, 6);
        g.fillStyle(0x886600);
        g.fillRect(px + 3, py + 13, 26, 2);
        g.fillStyle(0xccaa00);
        g.fillCircle(px + 16, py + 18, 3);
        g.fillStyle(0xffdd44);
        g.fillCircle(px + 16, py + 18, 1.5);
        g.lineStyle(1, border);
        g.strokeRect(px + 3, py + 7, 26, 21);
        break;
      }

      case 'WALL': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x8a7458);
        g.fillRect(px + 1, py + 1, 13, 9);
        g.fillRect(px + 17, py + 1, 12, 9);
        g.fillRect(px + 7, py + 12, 15, 9);
        g.fillRect(px + 1, py + 23, 11, 8);
        g.fillRect(px + 19, py + 23, 10, 8);
        g.lineStyle(1, 0x5a4530, 0.5);
        g.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        break;
      }

      case 'FLOOR': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.lineStyle(1, 0xb09070, 0.3);
        for (let i = 4; i < TILE_SIZE; i += 8) {
          g.beginPath();
          g.moveTo(px + i, py);
          g.lineTo(px + i, py + TILE_SIZE);
          g.strokePath();
        }
        break;
      }

      case 'WATER': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x5a9ace, 0.4);
        g.fillRect(px + 2, py + 6, 28, 5);
        g.fillRect(px + 4, py + 18, 24, 5);
        g.fillStyle(0x88bbee, 0.3);
        g.fillRect(px + 8, py + 12, 16, 3);
        break;
      }

      case 'WORKSHOP': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x555555);
        g.fillRect(px + 8, py + 14, 16, 4);
        g.fillRect(px + 12, py + 12, 8, 8);
        g.fillStyle(0x8b6914);
        g.fillRect(px + 22, py + 6, 3, 12);
        g.fillStyle(0x888888);
        g.fillRect(px + 20, py + 4, 7, 4);
        break;
      }

      case 'GARDEN': {
        g.fillStyle(0x4a7a2a);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x2a5a1a);
        for (let i = 0; i < 4; i++) {
          g.fillRect(px + 2, py + 4 + i * 8, 28, 3);
        }
        g.fillStyle(0x66aa44);
        for (let i = 0; i < 4; i++) {
          g.fillCircle(px + 8, py + 5 + i * 8, 3);
          g.fillCircle(px + 16, py + 5 + i * 8, 3);
          g.fillCircle(px + 24, py + 5 + i * 8, 3);
        }
        break;
      }

      case 'FENCE': {
        g.fillStyle(TILE_COLORS.GRASS);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(color);
        g.fillRect(px + 2, py + 10, 28, 4);
        g.fillRect(px + 2, py + 20, 28, 4);
        g.fillRect(px + 4, py + 4, 4, 24);
        g.fillRect(px + 14, py + 4, 4, 24);
        g.fillRect(px + 24, py + 4, 4, 24);
        break;
      }

      case 'FARM_PLOT': {
        g.fillStyle(0x6a5a2a);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x5a4a1a);
        for (let i = 0; i < 4; i++) {
          g.fillRect(px + 2, py + 4 + i * 8, 28, 3);
        }
        g.fillStyle(0x88aa44);
        g.fillCircle(px + 8, py + 12, 3);
        g.fillCircle(px + 16, py + 20, 3);
        g.fillCircle(px + 24, py + 10, 3);
        break;
      }

      case 'ANIMAL_PEN': {
        g.fillStyle(0x5a8c3e);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x9a7a4a);
        g.fillRect(px, py, TILE_SIZE, 3);
        g.fillRect(px, py + TILE_SIZE - 3, TILE_SIZE, 3);
        g.fillRect(px, py, 3, TILE_SIZE);
        g.fillRect(px + TILE_SIZE - 3, py, 3, TILE_SIZE);
        break;
      }

      case 'CONSTRUCTION': {
        g.fillStyle(0x998866);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Scaffolding
        g.fillStyle(0x8b6914);
        g.fillRect(px + 2, py + 2, 3, 28);
        g.fillRect(px + 27, py + 2, 3, 28);
        g.fillRect(px + 2, py + 14, 28, 3);
        // Progress indicator
        const progress = tile.buildProgress ?? 0;
        const barWidth = Math.floor(24 * progress / 100);
        g.fillStyle(0x44aa44);
        g.fillRect(px + 4, py + 26, barWidth, 3);
        g.fillStyle(0x222222);
        g.fillRect(px + 4 + barWidth, py + 26, 24 - barWidth, 3);
        break;
      }
    }
  }

  // ----------------------------------------------------------
  // Спрайт персонажа
  // ----------------------------------------------------------
  private _buildCharacter() {
    this._characterSprite = this.add.container(0, 0);
    this._characterSprite.setDepth(10);

    this._characterBody = this.add.graphics();
    this._drawCharacterBody(this._characterBody, false);
    this._characterSprite.add(this._characterBody);

    this._nameText = this.add.text(0, -34, 'Олдер', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    });
    this._nameText.setOrigin(0.5, 1);
    this._characterSprite.add(this._nameText);

    this._actionText = this.add.text(0, -22, '', {
      fontSize: '9px',
      color: '#ffffaa',
      backgroundColor: '#00000066',
      padding: { x: 3, y: 1 },
    });
    this._actionText.setOrigin(0.5, 1);
    this._characterSprite.add(this._actionText);

    this._buildThoughtBubble();

    this._characterSprite.setPosition(
      10 * TILE_SIZE + TILE_SIZE / 2,
      11 * TILE_SIZE + TILE_SIZE / 2
    );
  }

  private _drawCharacterBody(g: Phaser.GameObjects.Graphics, isMoving: boolean) {
    g.clear();
    const bounce = isMoving ? Math.sin(Date.now() / 150) * 2 : 0;
    const legSwing = isMoving ? Math.sin(Date.now() / 120) * 3 : 0;
    const isSleeping = this._currentAction === 'REST';
    const isBuilding = this._currentAction === 'BUILD';
    const isChopping = this._currentAction === 'COLLECT_WOOD';
    const isMining = this._currentAction === 'COLLECT_STONE';
    const isEating = this._currentAction === 'EAT';
    const isHunting = this._currentAction === 'HUNT';

    if (isSleeping) {
      // Lying down pose
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(0, 8, 28, 8);

      // Body horizontal
      g.fillStyle(0x4488cc);
      g.fillRect(-14, 0, 28, 8);
      // Blanket
      g.fillStyle(0x5577bb);
      g.fillRect(-12, 2, 24, 6);
      // Head
      g.fillStyle(0xf4c898);
      g.fillCircle(-16, 2, 7);
      // Eyes closed
      g.fillStyle(0x333333);
      g.fillRect(-19, 1, 3, 1);
      g.fillRect(-15, 1, 3, 1);
      // Hair
      g.fillStyle(0x8b5e2a);
      g.fillCircle(-16, -3, 7);
      g.fillRect(-23, -5, 14, 5);
      // Pillow
      g.fillStyle(0xffffff);
      g.fillRect(-22, 3, 10, 6);
      return;
    }

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 14, 20, 6);

    // Shoes
    g.fillStyle(0x5a3a1a);
    g.fillEllipse(-4, 18 + bounce + legSwing, 7, 4);
    g.fillEllipse(4, 18 + bounce - legSwing, 7, 4);

    // Legs (pants)
    g.fillStyle(0x336688);
    g.fillRect(-6, 8 + bounce, 5, 10 + legSwing * 0.3);
    g.fillRect(1, 8 + bounce, 5, 10 - legSwing * 0.3);

    // Body (shirt)
    g.fillStyle(0x4488cc);
    g.fillRect(-7, -4 + bounce, 14, 14);
    // Collar
    g.fillStyle(0x5599dd);
    g.fillRect(-5, -4 + bounce, 10, 3);

    // Arms — animated based on action
    const armSwing = isBuilding ? Math.sin(Date.now() / 200) * 8 : 0;
    const chopSwing = isChopping ? Math.sin(Date.now() / 180) * 10 : 0;
    const mineSwing = isMining ? Math.sin(Date.now() / 160) * 10 : 0;
    const eatAnim = isEating ? Math.sin(Date.now() / 300) * 3 : 0;
    const huntAim = isHunting ? Math.sin(Date.now() / 400) * 2 : 0;

    g.fillStyle(0xf4c898);
    if (isBuilding) {
      // Arms up with hammer
      g.fillRect(-9, -6 + bounce - armSwing, 3, 12);
      g.fillRect(6, -1 + bounce, 3, 10);
      // Hammer in hand
      g.fillStyle(0x8b6914);
      g.fillRect(-10, -12 + bounce - armSwing, 3, 8);
      g.fillStyle(0x888888);
      g.fillRect(-12, -14 + bounce - armSwing, 7, 4);
    } else if (isChopping) {
      // Axe swing
      g.fillRect(-9, -3 + bounce - chopSwing * 0.3, 3, 12);
      g.fillRect(6, -1 + bounce, 3, 10);
      // Axe
      g.fillStyle(0x8b6914);
      g.fillRect(-10, -10 + bounce - chopSwing * 0.5, 3, 10);
      g.fillStyle(0xaaaaaa);
      g.fillRect(-13, -12 + bounce - chopSwing * 0.5, 6, 4);
    } else if (isMining) {
      // Pickaxe swing
      g.fillRect(-9, -3 + bounce - mineSwing * 0.3, 3, 12);
      g.fillRect(6, -1 + bounce, 3, 10);
      // Pickaxe
      g.fillStyle(0x8b6914);
      g.fillRect(-10, -10 + bounce - mineSwing * 0.5, 3, 10);
      g.fillStyle(0x888888);
      g.fillRect(-14, -12 + bounce - mineSwing * 0.5, 8, 3);
      g.fillStyle(0x666666);
      g.fillRect(-14, -12 + bounce - mineSwing * 0.5, 3, 5);
    } else if (isEating) {
      // One arm to mouth
      g.fillRect(-9, -1 + bounce, 3, 10);
      g.fillRect(4, -6 + bounce + eatAnim, 3, 8);
      // Food in hand
      g.fillStyle(0xdd4444);
      g.fillCircle(6, -7 + bounce + eatAnim, 3);
    } else if (isHunting) {
      // Bow pose
      g.fillRect(-9, -2 + bounce + huntAim, 3, 10);
      g.fillRect(6, -3 + bounce - huntAim, 3, 10);
      // Bow
      g.fillStyle(0x8b6914);
      g.lineStyle(2, 0x8b6914);
      g.beginPath();
      g.arc(10, 2 + bounce, 10, -1.2, 1.2);
      g.strokePath();
      // String
      g.lineStyle(1, 0xccccaa);
      g.beginPath();
      g.moveTo(10, -8 + bounce);
      g.lineTo(6, 2 + bounce);
      g.lineTo(10, 12 + bounce);
      g.strokePath();
    } else {
      g.fillRect(-9, -1 + bounce, 3, 10);
      g.fillRect(6, -1 + bounce, 3, 10);
    }

    // Sleeves
    g.fillStyle(0x4488cc);
    g.fillRect(-9, -1 + bounce, 3, 4);
    g.fillRect(6, -1 + bounce, 3, 4);

    // Head
    g.fillStyle(0xf4c898);
    g.fillCircle(0, -11 + bounce, 9);

    // Eyes
    g.fillStyle(0x333333);
    g.fillCircle(-3, -12 + bounce, 2);
    g.fillCircle(3, -12 + bounce, 2);
    g.fillStyle(0x111111);
    g.fillCircle(-3, -12 + bounce, 1);
    g.fillCircle(3, -12 + bounce, 1);
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-3.5, -12.5 + bounce, 0.5);
    g.fillCircle(2.5, -12.5 + bounce, 0.5);

    // Eyebrows
    g.fillStyle(0x6b4a2a);
    g.fillRect(-5, -15 + bounce, 4, 1);
    g.fillRect(1, -15 + bounce, 4, 1);

    // Mouth
    g.fillStyle(0xcc8866);
    g.fillEllipse(0, -7 + bounce, 3, 1.5);

    // Hair
    g.fillStyle(0x8b5e2a);
    g.fillCircle(0, -18 + bounce, 9);
    g.fillRect(-9, -20 + bounce, 18, 8);
    g.fillStyle(0x7a4e1a);
    g.fillRect(-9, -16 + bounce, 3, 6);
    g.fillRect(6, -16 + bounce, 3, 6);

    // Belt
    g.fillStyle(0x6b4a1a);
    g.fillRect(-7, 7 + bounce, 14, 2);
    g.fillStyle(0xccaa44);
    g.fillRect(-1, 7 + bounce, 2, 2);
  }

  // ----------------------------------------------------------
  // NPC спрайты
  // ----------------------------------------------------------
  private _createNPCSprite(npc: NPCState): { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text; taskText: Phaser.GameObjects.Text } {
    const container = this.add.container(
      npc.position.x * TILE_SIZE + TILE_SIZE / 2,
      npc.position.y * TILE_SIZE + TILE_SIZE / 2
    );
    container.setDepth(9);

    const body = this.add.graphics();
    this._drawNPCBody(body, npc.role, npc.currentAction === 'REST');
    container.add(body);

    const roleEmoji = npc.role === 'worker' ? '⛏' : npc.role === 'companion' ? '♥' : '★';
    const nameText = this.add.text(0, -30, `${roleEmoji} ${npc.name}`, {
      fontSize: '9px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 1 },
    });
    nameText.setOrigin(0.5, 1);
    container.add(nameText);

    const taskText = this.add.text(0, -19, npc.currentTask || '', {
      fontSize: '8px',
      color: '#aaffaa',
      backgroundColor: '#00000066',
      padding: { x: 2, y: 1 },
    });
    taskText.setOrigin(0.5, 1);
    container.add(taskText);

    return { container, body, nameText, taskText };
  }

  private _drawNPCBody(g: Phaser.GameObjects.Graphics, role: string, sleeping = false) {
    g.clear();
    const colors = NPC_COLORS[role] || NPC_COLORS.worker;
    const s = role === 'child' ? 0.7 : 1;

    if (sleeping) {
      // Lying down
      g.fillStyle(0x000000, 0.15);
      g.fillEllipse(0, 6 * s, 22 * s, 6 * s);
      g.fillStyle(colors.shirt);
      g.fillRect(-12 * s, 0, 24 * s, 6 * s);
      g.fillStyle(colors.body);
      g.fillCircle(-14 * s, 1, 6 * s);
      g.fillStyle(colors.hair);
      g.fillCircle(-14 * s, -3 * s, 6 * s);
      return;
    }

    // Shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 12 * s, 16 * s, 5 * s);

    // Shoes
    g.fillStyle(0x5a3a1a);
    g.fillEllipse(-3 * s, 16 * s, 5 * s, 3 * s);
    g.fillEllipse(3 * s, 16 * s, 5 * s, 3 * s);

    // Legs
    g.fillStyle(0x556655);
    g.fillRect(-5 * s, 6 * s, 4 * s, 10 * s);
    g.fillRect(1 * s, 6 * s, 4 * s, 10 * s);

    // Body
    g.fillStyle(colors.shirt);
    g.fillRect(-6 * s, -4 * s, 12 * s, 12 * s);

    // Arms
    g.fillStyle(colors.body);
    g.fillRect(-8 * s, -2 * s, 3 * s, 8 * s);
    g.fillRect(5 * s, -2 * s, 3 * s, 8 * s);

    // Head
    g.fillStyle(colors.body);
    g.fillCircle(0, -10 * s, 8 * s);

    // Eyes
    g.fillStyle(0x333333);
    g.fillCircle(-2.5 * s, -11 * s, 1.5 * s);
    g.fillCircle(2.5 * s, -11 * s, 1.5 * s);

    // Hair
    g.fillStyle(colors.hair);
    g.fillCircle(0, -16 * s, 8 * s);
    g.fillRect(-8 * s, -18 * s, 16 * s, 7 * s);

    // Long hair for companion
    if (role === 'companion') {
      g.fillRect(-8 * s, -14 * s, 3 * s, 14 * s);
      g.fillRect(5 * s, -14 * s, 3 * s, 14 * s);
    }
  }

  private _updateNPCSprite(sprite: { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text; taskText: Phaser.GameObjects.Text }, npc: NPCState) {
    const targetX = npc.position.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = npc.position.y * TILE_SIZE + TILE_SIZE / 2;

    if (Math.abs(targetX - sprite.container.x) > 1 || Math.abs(targetY - sprite.container.y) > 1) {
      this.tweens.killTweensOf(sprite.container);
      this.tweens.add({
        targets: sprite.container,
        x: targetX,
        y: targetY,
        duration: 600,
        ease: 'Linear',
      });
    }

    // Redraw body if sleeping state changed
    const isSleeping = npc.currentAction === 'REST' || npc.currentTask === 'спит';
    this._drawNPCBody(sprite.body, npc.role, isSleeping);

    sprite.taskText.setText(npc.currentTask || '');
  }

  // ----------------------------------------------------------
  // Animal sprites
  // ----------------------------------------------------------
  private _createAnimalSprite(animal: Animal): { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text } {
    const container = this.add.container(
      animal.position.x * TILE_SIZE + TILE_SIZE / 2,
      animal.position.y * TILE_SIZE + TILE_SIZE / 2
    );
    container.setDepth(8);

    const body = this.add.graphics();
    this._drawAnimalBody(body, animal);
    container.add(body);

    const label = animal.name || '';
    const nameText = this.add.text(0, -16, label, {
      fontSize: '8px',
      color: animal.state === 'wild' ? '#ffaaaa' : '#aaffaa',
      backgroundColor: '#00000066',
      padding: { x: 2, y: 1 },
    });
    nameText.setOrigin(0.5, 1);
    if (label) container.add(nameText);

    return { container, body, nameText };
  }

  private _drawAnimalBody(g: Phaser.GameObjects.Graphics, animal: Animal) {
    g.clear();
    const colors = ANIMAL_COLORS[animal.type] || ANIMAL_COLORS.rabbit;
    const wild = animal.state === 'wild';

    switch (animal.type) {
      case 'rabbit': {
        // Small fluffy body
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(0, 8, 10, 3);
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 10, 8);
        // Head
        g.fillCircle(0, -4, 5);
        // Ears
        g.fillEllipse(-2, -10, 2, 5);
        g.fillEllipse(2, -10, 2, 5);
        g.fillStyle(0xffcccc);
        g.fillEllipse(-2, -10, 1, 3);
        g.fillEllipse(2, -10, 1, 3);
        // Eyes
        g.fillStyle(0x333333);
        g.fillCircle(-2, -4, 1);
        g.fillCircle(2, -4, 1);
        // Tail
        g.fillStyle(colors.secondary);
        g.fillCircle(-5, 4, 3);
        break;
      }
      case 'deer': {
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(0, 10, 14, 4);
        // Body
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 16, 10);
        // Legs
        g.fillStyle(0x6a4a30);
        g.fillRect(-6, 6, 2, 8);
        g.fillRect(-2, 6, 2, 8);
        g.fillRect(2, 6, 2, 8);
        g.fillRect(6, 6, 2, 8);
        // Head
        g.fillStyle(colors.primary);
        g.fillCircle(0, -6, 5);
        // Antlers
        g.fillStyle(0x8b6914);
        g.fillRect(-3, -14, 2, 6);
        g.fillRect(-5, -14, 4, 2);
        g.fillRect(1, -14, 2, 6);
        g.fillRect(1, -14, 4, 2);
        // Eyes
        g.fillStyle(0x333333);
        g.fillCircle(-2, -6, 1);
        g.fillCircle(2, -6, 1);
        // Belly
        g.fillStyle(colors.secondary);
        g.fillEllipse(0, 4, 10, 5);
        break;
      }
      case 'wolf': {
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(0, 10, 14, 4);
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 16, 10);
        // Legs
        g.fillStyle(0x555555);
        g.fillRect(-6, 6, 2, 8);
        g.fillRect(-2, 6, 2, 8);
        g.fillRect(2, 6, 2, 8);
        g.fillRect(6, 6, 2, 8);
        // Head — more angular
        g.fillStyle(colors.primary);
        g.fillCircle(0, -6, 6);
        // Ears pointed
        g.fillTriangle(-4, -12, -6, -6, -2, -6);
        g.fillTriangle(4, -12, 2, -6, 6, -6);
        // Eyes — menacing
        g.fillStyle(0xff4444);
        g.fillCircle(-2, -7, 1.5);
        g.fillCircle(2, -7, 1.5);
        g.fillStyle(0x000000);
        g.fillCircle(-2, -7, 0.7);
        g.fillCircle(2, -7, 0.7);
        // Snout
        g.fillStyle(0x444444);
        g.fillEllipse(0, -3, 4, 3);
        // Tail
        g.fillStyle(colors.secondary);
        g.fillEllipse(-8, 0, 6, 3);
        break;
      }
      case 'chicken': {
        g.fillStyle(0x000000, 0.1);
        g.fillEllipse(0, 8, 8, 3);
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 10, 8);
        // Head
        g.fillCircle(0, -4, 4);
        // Beak
        g.fillStyle(0xffaa00);
        g.fillTriangle(0, -3, 4, -4, 0, -5);
        // Comb
        g.fillStyle(colors.secondary);
        g.fillCircle(-1, -8, 2);
        g.fillCircle(1, -8, 2);
        g.fillCircle(0, -9, 2);
        // Eye
        g.fillStyle(0x333333);
        g.fillCircle(-1, -4, 1);
        // Legs
        g.fillStyle(0xffaa00);
        g.fillRect(-2, 6, 1, 4);
        g.fillRect(2, 6, 1, 4);
        break;
      }
      case 'cow': {
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(0, 12, 18, 5);
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 20, 12);
        // Spots
        g.fillStyle(colors.secondary);
        g.fillCircle(-4, 0, 4);
        g.fillCircle(5, 3, 3);
        // Legs
        g.fillStyle(0xcccccc);
        g.fillRect(-8, 7, 3, 8);
        g.fillRect(-3, 7, 3, 8);
        g.fillRect(3, 7, 3, 8);
        g.fillRect(7, 7, 3, 8);
        // Head
        g.fillStyle(colors.primary);
        g.fillCircle(0, -7, 6);
        // Horns
        g.fillStyle(0xccaa88);
        g.fillRect(-5, -13, 2, 5);
        g.fillRect(3, -13, 2, 5);
        // Eyes
        g.fillStyle(0x333333);
        g.fillCircle(-2, -7, 1);
        g.fillCircle(2, -7, 1);
        // Nose
        g.fillStyle(0xffaaaa);
        g.fillEllipse(0, -4, 4, 2);
        break;
      }
      case 'pig': {
        g.fillStyle(0x000000, 0.15);
        g.fillEllipse(0, 10, 14, 4);
        g.fillStyle(colors.primary);
        g.fillEllipse(0, 2, 16, 10);
        // Legs
        g.fillStyle(0xee9999);
        g.fillRect(-5, 7, 2, 6);
        g.fillRect(-1, 7, 2, 6);
        g.fillRect(2, 7, 2, 6);
        g.fillRect(5, 7, 2, 6);
        // Head
        g.fillStyle(colors.primary);
        g.fillCircle(0, -5, 5);
        // Snout
        g.fillStyle(colors.secondary);
        g.fillEllipse(0, -3, 4, 3);
        g.fillStyle(0x333333);
        g.fillCircle(-1, -3, 0.5);
        g.fillCircle(1, -3, 0.5);
        // Ears
        g.fillStyle(colors.primary);
        g.fillTriangle(-4, -10, -6, -5, -2, -6);
        g.fillTriangle(4, -10, 2, -6, 6, -5);
        // Eyes
        g.fillStyle(0x333333);
        g.fillCircle(-2, -6, 1);
        g.fillCircle(2, -6, 1);
        // Tail
        g.lineStyle(2, colors.secondary);
        g.beginPath();
        g.arc(-8, 2, 3, 0, Math.PI * 1.5);
        g.strokePath();
        break;
      }
    }

    // Danger indicator for wild wolves
    if (wild && animal.type === 'wolf') {
      g.fillStyle(0xff0000, 0.3 + Math.sin(Date.now() / 300) * 0.2);
      g.fillCircle(0, 0, 14);
    }

    // Tamed heart indicator
    if (!wild) {
      g.fillStyle(0xff4466, 0.6);
      g.fillCircle(6, -12, 3);
    }
  }

  private _updateAnimalSprite(sprite: { container: Phaser.GameObjects.Container; body: Phaser.GameObjects.Graphics; nameText: Phaser.GameObjects.Text }, animal: Animal) {
    const targetX = animal.position.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = animal.position.y * TILE_SIZE + TILE_SIZE / 2;

    if (Math.abs(targetX - sprite.container.x) > 1 || Math.abs(targetY - sprite.container.y) > 1) {
      this.tweens.killTweensOf(sprite.container);
      this.tweens.add({
        targets: sprite.container,
        x: targetX,
        y: targetY,
        duration: 800,
        ease: 'Linear',
      });
    }

    if (animal.name && sprite.nameText.text !== animal.name) {
      sprite.nameText.setText(animal.name);
      sprite.nameText.setColor(animal.state === 'wild' ? '#ffaaaa' : '#aaffaa');
    }
  }

  // ----------------------------------------------------------
  // Облачко мыслей
  // ----------------------------------------------------------
  private _buildThoughtBubble() {
    this._thoughtBubble = this.add.container(0, 0);
    this._thoughtBubble.setDepth(20);
    this._thoughtBubble.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(-80, -70, 160, 50, 10);
    bg.lineStyle(2, 0xaaaaaa);
    bg.strokeRoundedRect(-80, -70, 160, 50, 10);
    bg.fillStyle(0xffffff, 0.92);
    bg.fillCircle(-20, -22, 5);
    bg.fillCircle(-12, -14, 3);
    bg.fillCircle(-6, -8, 2);

    this._thoughtBubble.add(bg);

    this._thoughtText = this.add.text(0, -46, '', {
      fontSize: '10px',
      color: '#333333',
      wordWrap: { width: 148 },
      align: 'center',
    });
    this._thoughtText.setOrigin(0.5, 0.5);
    this._thoughtBubble.add(this._thoughtText);

    this.add.existing(this._thoughtBubble);
  }

  showThought(thought: string) {
    const truncated = thought.length > 80 ? thought.substring(0, 77) + '...' : thought;
    this._thoughtText.setText(truncated);
    this._thoughtBubble.setVisible(true);

    const cx = this._characterSprite.x;
    const cy = this._characterSprite.y;
    this._thoughtBubble.setPosition(cx + 20, cy - 20);

    this.time.delayedCall(6000, () => {
      this._thoughtBubble.setVisible(false);
    });
  }

  // ----------------------------------------------------------
  // Обновление позиции персонажа
  // ----------------------------------------------------------
  private _updateCharacter(char: CharacterState) {
    this._currentAction = char.currentAction;
    const targetX = char.position.x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = char.position.y * TILE_SIZE + TILE_SIZE / 2;

    const curX = this._characterSprite.x;
    const curY = this._characterSprite.y;

    if (Math.abs(targetX - curX) > 1 || Math.abs(targetY - curY) > 1) {
      this._isMoving = true;

      this.tweens.killTweensOf(this._characterSprite);
      this.tweens.add({
        targets: this._characterSprite,
        x: targetX,
        y: targetY,
        duration: 800,
        ease: 'Linear',
        onComplete: () => { this._isMoving = false; },
      });

      // Only flip the body graphics, not the text
      if (targetX < curX) {
        this._characterBody.setScale(-1, 1);
      } else {
        this._characterBody.setScale(1, 1);
      }
    }

    this._actionText.setText(char.currentIntentLabel || '');

    // Show action particles
    this._showActionEffect(char.currentAction, char.position);

    if (this._thoughtBubble.visible) {
      this._thoughtBubble.setPosition(
        this._characterSprite.x + 20,
        this._characterSprite.y - 20
      );
    }
  }

  // ----------------------------------------------------------
  // День/ночь — enhanced darkness
  // ----------------------------------------------------------
  private _buildDayOverlay() {
    const { width, height } = this.cameras.main;
    this._overlay = this.add.rectangle(
      0, 0,
      width || 640,
      height || 480,
      0x000022,
      0
    );
    this._overlay.setOrigin(0, 0);
    this._overlay.setDepth(50);
  }

  private _updateDayOverlay(phase: WorldState['dayPhase'], _progress: number) {
    const alphaMap: Record<string, number> = {
      dawn:  0.25,
      day:   0.0,
      dusk:  0.2,
      night: 0.6,
    };
    const colorMap: Record<string, number> = {
      dawn:  0x1a0a2a,
      day:   0x000000,
      dusk:  0x2a1a0a,
      night: 0x000022,
    };

    const targetAlpha = alphaMap[phase] ?? 0;
    this._overlay.setFillStyle(colorMap[phase] ?? 0x000022);

    this.tweens.add({
      targets: this._overlay,
      alpha: targetAlpha,
      duration: 3000,
      ease: 'Sine.easeInOut',
    });
  }

  // ----------------------------------------------------------
  // Атмосферные частицы
  // ----------------------------------------------------------
  private _buildAmbientParticles() {
    for (let i = 0; i < 12; i++) {
      const g = this.add.graphics();
      g.setDepth(55);
      this._particles.push(g);
    }

    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: this._animateParticles,
      callbackScope: this,
    });
  }

  private _animateParticles() {
    const phase = this._currentDayPhase;

    this._particles.forEach((g, i) => {
      g.clear();

      if (phase === 'night') {
        // Stars
        const t = (Date.now() / 1000 + i * 0.7) % 1;
        const x = ((i * 97 + Date.now() / 2000 + i * 33) % 620) + 10;
        const y = ((i * 67 + Date.now() / 3000 + i * 55) % 200) + 10;
        const alpha = Math.sin(t * Math.PI) * 0.8;
        g.fillStyle(0xffffaa, alpha);
        g.fillCircle(x, y, 1.5);
        // Some stars twinkle bigger
        if (i % 3 === 0) {
          g.fillStyle(0xffffcc, alpha * 0.5);
          g.fillCircle(x, y, 3);
        }
      } else if (phase === 'dawn') {
        // Morning mist
        const x = ((i * 80 + Date.now() / 600) % 660) - 10;
        const y = 350 + Math.sin(i * 2 + Date.now() / 1000) * 30;
        const alpha = 0.15 + Math.sin(Date.now() / 1500 + i) * 0.1;
        g.fillStyle(0xffffff, alpha);
        g.fillEllipse(x, y, 40 + i * 5, 12);
      } else if (phase === 'dusk') {
        // Fireflies
        const t = (Date.now() / 1200 + i * 1.1) % 1;
        const x = ((i * 73 + Date.now() / 500) % 620) + 10;
        const y = 200 + Math.sin(Date.now() / 800 + i * 3) * 100;
        const alpha = Math.sin(t * Math.PI) * 0.6;
        g.fillStyle(0xffee44, alpha);
        g.fillCircle(x, y, 2);
        g.fillStyle(0xffff88, alpha * 0.3);
        g.fillCircle(x, y, 5);
      }
      // Day: no particles
    });
  }

  // ----------------------------------------------------------
  // Action effects — detailed
  // ----------------------------------------------------------
  private _showActionEffect(action: string, pos: { x: number; y: number }) {
    if (!this._actionEffectGraphics) {
      this._actionEffectGraphics = this.add.graphics();
      this._actionEffectGraphics.setDepth(15);
    }
    this._actionEffectGraphics.clear();

    const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
    const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
    const t = Date.now() / 300;

    if (action === 'COLLECT_WOOD') {
      // Wood chips flying
      for (let i = 0; i < 5; i++) {
        const phase = (t + i * 1.3) % 2;
        const ox = Math.sin(t + i * 2) * (8 + phase * 4);
        const oy = -10 - phase * 6 + Math.cos(t + i) * 4;
        const alpha = Math.max(0, 1 - phase / 2);
        this._actionEffectGraphics.fillStyle(0xddaa44, alpha);
        // Chip shape
        this._actionEffectGraphics.fillRect(px + ox - 2, py + oy - 1, 4, 2);
      }
      // Impact lines
      if (Math.sin(t * 3) > 0.5) {
        this._actionEffectGraphics.lineStyle(1, 0xccaa33, 0.5);
        for (let i = 0; i < 3; i++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
          const len = 6 + Math.random() * 6;
          this._actionEffectGraphics.beginPath();
          this._actionEffectGraphics.moveTo(px, py - 8);
          this._actionEffectGraphics.lineTo(px + Math.cos(angle) * len, py - 8 + Math.sin(angle) * len);
          this._actionEffectGraphics.strokePath();
        }
      }
    } else if (action === 'COLLECT_STONE') {
      // Stone fragments
      for (let i = 0; i < 4; i++) {
        const phase = (t + i * 1.5) % 2;
        const ox = Math.sin(t + i * 2.5) * (6 + phase * 5);
        const oy = -8 - phase * 5 + Math.cos(t + i * 1.7) * 3;
        const alpha = Math.max(0, 1 - phase / 2);
        this._actionEffectGraphics.fillStyle(0xcccccc, alpha);
        this._actionEffectGraphics.fillCircle(px + ox, py + oy, 2);
      }
      // Spark
      if (Math.sin(t * 4) > 0.7) {
        this._actionEffectGraphics.fillStyle(0xffff88, 0.8);
        this._actionEffectGraphics.fillCircle(px + Math.random() * 10 - 5, py - 10 + Math.random() * 6, 1.5);
      }
    } else if (action === 'EAT' || action === 'COLLECT_FOOD') {
      // Food particles & crumbs
      for (let i = 0; i < 3; i++) {
        const ox = Math.sin(t + i * 3) * 5;
        const oy = -8 - Math.abs(Math.sin(t * 0.5 + i)) * 8;
        const color = action === 'EAT' ? 0xff8844 : 0xdd3333;
        this._actionEffectGraphics.fillStyle(color, 0.7);
        this._actionEffectGraphics.fillCircle(px + ox, py + oy, 2);
      }
      // Happy stars when eating
      if (action === 'EAT') {
        for (let i = 0; i < 2; i++) {
          const starX = px + Math.sin(t * 0.8 + i * 4) * 12;
          const starY = py - 16 - Math.abs(Math.sin(t * 0.4 + i * 2)) * 8;
          const alpha = (Math.sin(t + i * 2) + 1) * 0.3;
          this._actionEffectGraphics.fillStyle(0xffdd44, alpha);
          this._drawStar(this._actionEffectGraphics, starX, starY, 3);
        }
      }
    } else if (action === 'REST') {
      // Zzz animation — more elaborate
      for (let i = 0; i < 3; i++) {
        const phase = (t * 0.2 + i * 0.8) % 3;
        const zx = px + 10 + phase * 5;
        const zy = py - 12 - phase * 10;
        const alpha = Math.max(0, 1 - phase / 3);
        const size = 5 + phase * 2;
        this._actionEffectGraphics.fillStyle(0x88bbff, alpha);
        // Z shape with lines
        this._actionEffectGraphics.fillRect(zx, zy, size, 1.5);
        this._actionEffectGraphics.fillRect(zx + size * 0.3, zy + size * 0.2, size * 0.4, 1.5);
        this._actionEffectGraphics.fillRect(zx, zy + size * 0.4, size, 1.5);
      }
    } else if (action === 'BUILD') {
      // Building effect — hammer + sparks + dust
      const swing = Math.sin(t * 2.5);
      // Dust clouds
      for (let i = 0; i < 3; i++) {
        const dx = Math.sin(t * 0.5 + i * 2) * 12;
        const dy = 8 + Math.abs(Math.sin(t * 0.3 + i)) * 4;
        const alpha = 0.2 + Math.sin(t + i) * 0.1;
        this._actionEffectGraphics.fillStyle(0xccbb99, alpha);
        this._actionEffectGraphics.fillCircle(px + dx, py + dy, 4);
      }
      // Sparks on impact
      if (swing > 0.8) {
        for (let i = 0; i < 5; i++) {
          const sx = (Math.random() - 0.5) * 16;
          const sy = (Math.random() - 0.5) * 10 - 5;
          this._actionEffectGraphics.fillStyle(0xffcc44, 0.8);
          this._actionEffectGraphics.fillCircle(px + sx, py + sy, 1.5);
        }
      }
      // Progress ring
      const progress = this._worldState?.character?.actionProgress ?? 0;
      this._actionEffectGraphics.lineStyle(2, 0x44cc44, 0.5);
      this._actionEffectGraphics.beginPath();
      this._actionEffectGraphics.arc(px, py + 16, 8, -Math.PI / 2, -Math.PI / 2 + (progress / 100) * Math.PI * 2);
      this._actionEffectGraphics.strokePath();
    } else if (action === 'CRAFT') {
      // Crafting sparks
      const swing = Math.sin(t * 3);
      this._actionEffectGraphics.fillStyle(0x888888, 0.5);
      this._actionEffectGraphics.fillRect(px + 8, py - 12 + swing * 4, 3, 8);
      this._actionEffectGraphics.fillStyle(0xaaaaaa, 0.5);
      this._actionEffectGraphics.fillRect(px + 6, py - 14 + swing * 4, 7, 4);
      if (swing > 0.7) {
        for (let i = 0; i < 3; i++) {
          this._actionEffectGraphics.fillStyle(0xffaa44, 0.8);
          this._actionEffectGraphics.fillCircle(px + 10 + Math.random() * 8 - 4, py - 6 + Math.random() * 6, 1);
        }
      }
    } else if (action === 'INVENT') {
      // Lightbulb with idea particles
      const glow = (Math.sin(t * 0.8) + 1) * 0.35;
      this._actionEffectGraphics.fillStyle(0xffff44, glow);
      this._actionEffectGraphics.fillCircle(px, py - 22, 7);
      this._actionEffectGraphics.fillStyle(0xffffaa, glow * 0.4);
      this._actionEffectGraphics.fillCircle(px, py - 22, 12);
      // Floating exclamation marks
      for (let i = 0; i < 2; i++) {
        const ex = px + Math.sin(t * 0.6 + i * 3) * 15;
        const ey = py - 28 - Math.abs(Math.sin(t * 0.3 + i * 2)) * 8;
        const alpha = (Math.sin(t + i * 4) + 1) * 0.3;
        this._actionEffectGraphics.fillStyle(0xffdd44, alpha);
        this._actionEffectGraphics.fillRect(ex, ey, 2, 5);
        this._actionEffectGraphics.fillCircle(ex + 1, ey + 7, 1);
      }
    } else if (action === 'HUNT') {
      // Tracking lines
      const scan = (t * 2) % 4;
      this._actionEffectGraphics.lineStyle(1, 0xffaa44, 0.4);
      for (let i = 0; i < 3; i++) {
        const angle = scan + i * 0.5;
        this._actionEffectGraphics.beginPath();
        this._actionEffectGraphics.moveTo(px + 8, py);
        this._actionEffectGraphics.lineTo(px + 8 + Math.cos(angle) * 15, py + Math.sin(angle) * 15);
        this._actionEffectGraphics.strokePath();
      }
      // Crosshair
      this._actionEffectGraphics.lineStyle(1, 0xff4444, 0.3);
      this._actionEffectGraphics.strokeCircle(px + 12, py - 5, 6);
      this._actionEffectGraphics.fillStyle(0xff4444, 0.5);
      this._actionEffectGraphics.fillCircle(px + 12, py - 5, 1);
    } else if (action === 'TAME') {
      // Hearts floating
      for (let i = 0; i < 3; i++) {
        const phase = (t * 0.3 + i * 1) % 3;
        const hx = px + Math.sin(t * 0.5 + i * 2) * 10;
        const hy = py - 15 - phase * 8;
        const alpha = Math.max(0, 1 - phase / 3);
        this._actionEffectGraphics.fillStyle(0xff4466, alpha);
        this._drawHeart(this._actionEffectGraphics, hx, hy, 3 + phase);
      }
      // Food offering
      this._actionEffectGraphics.fillStyle(0xdd4444, 0.6);
      this._actionEffectGraphics.fillCircle(px + 10, py + 2, 3);
    } else if (action === 'FARM') {
      // Farming particles
      for (let i = 0; i < 3; i++) {
        const dx = Math.sin(t + i * 2) * 10;
        const dy = 5 + Math.abs(Math.sin(t * 0.5 + i)) * 5;
        this._actionEffectGraphics.fillStyle(0x88aa44, 0.5);
        this._actionEffectGraphics.fillCircle(px + dx, py + dy, 2);
      }
    }
  }

  private _drawStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number) {
    g.fillRect(x - r, y - 0.5, r * 2, 1);
    g.fillRect(x - 0.5, y - r, 1, r * 2);
    g.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, 1);
    g.fillRect(x - r * 0.6, y + r * 0.6 - 1, r * 1.2, 1);
  }

  private _drawHeart(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number) {
    g.fillCircle(x - size * 0.3, y - size * 0.2, size * 0.4);
    g.fillCircle(x + size * 0.3, y - size * 0.2, size * 0.4);
    g.fillTriangle(x - size * 0.6, y, x + size * 0.6, y, x, y + size * 0.6);
  }

  // ----------------------------------------------------------
  // Phaser update loop
  // ----------------------------------------------------------
  update(_time: number, _delta: number) {
    if (this._isMoving || this._currentAction !== 'IDLE') {
      this._drawCharacterBody(this._characterBody, this._isMoving);
    }

    // Update animal animations
    for (const [id, sprite] of this._animalSprites) {
      // Simple breathing animation
      const t = Date.now() / 1000;
      sprite.body.setScale(1, 1 + Math.sin(t + id.charCodeAt(0)) * 0.02);
    }
  }
}
