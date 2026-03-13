import Phaser from 'phaser';
import type { WorldState, WorldTile, CharacterState, TileType, NPCState } from '../../types';

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
};

// Цвета NPC по роли
const NPC_COLORS: Record<string, { body: number; shirt: number; hair: number }> = {
  worker:    { body: 0xf4c898, shirt: 0x8B6914, hair: 0x5a3a1a },
  companion: { body: 0xf8d4b0, shirt: 0xcc4466, hair: 0x4a2a0a },
  child:     { body: 0xf8d8c0, shirt: 0x44aa66, hair: 0x8b6a3a },
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
    this._updateDayOverlay(phase as WorldState['dayPhase'], progress);
  }

  updateNPCs(npcs: NPCState[]) {
    // Удаляем спрайты отсутствующих NPC
    for (const [id, sprite] of this._npcSprites) {
      if (!npcs.find(n => n.id === id)) {
        sprite.container.destroy();
        this._npcSprites.delete(id);
      }
    }

    // Обновляем/создаём NPC спрайты
    for (const npc of npcs) {
      let sprite = this._npcSprites.get(npc.id);
      if (!sprite) {
        sprite = this._createNPCSprite(npc);
        this._npcSprites.set(npc.id, sprite);
      }
      this._updateNPCSprite(sprite, npc);
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
        // Травинки
        g.fillStyle(0x6a9c4e, 0.6);
        g.fillRect(px + 5, py + 10, 2, 6);
        g.fillRect(px + 15, py + 18, 2, 5);
        g.fillRect(px + 24, py + 8, 2, 7);
        break;

      case 'TREE': {
        // Ствол
        g.fillStyle(0x8b6914);
        g.fillRect(px + 12, py + 16, 8, 16);
        // Крона — несколько слоёв
        g.fillStyle(0x1a5a10);
        g.fillCircle(px + 16, py + 12, 14);
        g.fillStyle(color);
        g.fillCircle(px + 13, py + 10, 10);
        g.fillStyle(0x3a7a2a);
        g.fillCircle(px + 20, py + 14, 9);
        g.fillStyle(0x2a6a1a);
        g.fillCircle(px + 16, py + 8, 8);
        // Блик
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
        // Наковальня
        g.fillStyle(0x555555);
        g.fillRect(px + 8, py + 14, 16, 4);
        g.fillRect(px + 12, py + 12, 8, 8);
        // Молоток
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
    }
  }

  // ----------------------------------------------------------
  // Спрайт персонажа — улучшенный
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

    // Тень
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(0, 14, 20, 6);

    // Обувь
    g.fillStyle(0x5a3a1a);
    g.fillEllipse(-4, 18 + bounce + legSwing, 7, 4);
    g.fillEllipse(4, 18 + bounce - legSwing, 7, 4);

    // Ноги (штаны)
    g.fillStyle(0x336688);
    g.fillRect(-6, 8 + bounce, 5, 10 + legSwing * 0.3);
    g.fillRect(1, 8 + bounce, 5, 10 - legSwing * 0.3);

    // Тело (рубашка)
    g.fillStyle(0x4488cc);
    g.fillRect(-7, -4 + bounce, 14, 14);
    // Воротник
    g.fillStyle(0x5599dd);
    g.fillRect(-5, -4 + bounce, 10, 3);

    // Руки
    g.fillStyle(0xf4c898);
    g.fillRect(-9, -1 + bounce, 3, 10);
    g.fillRect(6, -1 + bounce, 3, 10);
    // Рукава
    g.fillStyle(0x4488cc);
    g.fillRect(-9, -1 + bounce, 3, 4);
    g.fillRect(6, -1 + bounce, 3, 4);

    // Голова
    g.fillStyle(0xf4c898);
    g.fillCircle(0, -11 + bounce, 9);

    // Глаза
    g.fillStyle(0x333333);
    g.fillCircle(-3, -12 + bounce, 2);
    g.fillCircle(3, -12 + bounce, 2);
    // Зрачки
    g.fillStyle(0x111111);
    g.fillCircle(-3, -12 + bounce, 1);
    g.fillCircle(3, -12 + bounce, 1);
    // Блики в глазах
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(-3.5, -12.5 + bounce, 0.5);
    g.fillCircle(2.5, -12.5 + bounce, 0.5);

    // Брови
    g.fillStyle(0x6b4a2a);
    g.fillRect(-5, -15 + bounce, 4, 1);
    g.fillRect(1, -15 + bounce, 4, 1);

    // Рот
    g.fillStyle(0xcc8866);
    g.fillEllipse(0, -7 + bounce, 3, 1.5);

    // Волосы — пышные
    g.fillStyle(0x8b5e2a);
    g.fillCircle(0, -18 + bounce, 9);
    g.fillRect(-9, -20 + bounce, 18, 8);
    // Боковые волосы
    g.fillStyle(0x7a4e1a);
    g.fillRect(-9, -16 + bounce, 3, 6);
    g.fillRect(6, -16 + bounce, 3, 6);

    // Ремень
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
    this._drawNPCBody(body, npc.role);
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

  private _drawNPCBody(g: Phaser.GameObjects.Graphics, role: string) {
    g.clear();
    const colors = NPC_COLORS[role] || NPC_COLORS.worker;
    const s = role === 'child' ? 0.7 : 1;

    // Тень
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 12 * s, 16 * s, 5 * s);

    // Обувь
    g.fillStyle(0x5a3a1a);
    g.fillEllipse(-3 * s, 16 * s, 5 * s, 3 * s);
    g.fillEllipse(3 * s, 16 * s, 5 * s, 3 * s);

    // Ноги
    g.fillStyle(0x556655);
    g.fillRect(-5 * s, 6 * s, 4 * s, 10 * s);
    g.fillRect(1 * s, 6 * s, 4 * s, 10 * s);

    // Тело
    g.fillStyle(colors.shirt);
    g.fillRect(-6 * s, -4 * s, 12 * s, 12 * s);

    // Руки
    g.fillStyle(colors.body);
    g.fillRect(-8 * s, -2 * s, 3 * s, 8 * s);
    g.fillRect(5 * s, -2 * s, 3 * s, 8 * s);

    // Голова
    g.fillStyle(colors.body);
    g.fillCircle(0, -10 * s, 8 * s);

    // Глаза
    g.fillStyle(0x333333);
    g.fillCircle(-2.5 * s, -11 * s, 1.5 * s);
    g.fillCircle(2.5 * s, -11 * s, 1.5 * s);

    // Волосы
    g.fillStyle(colors.hair);
    g.fillCircle(0, -16 * s, 8 * s);
    g.fillRect(-8 * s, -18 * s, 16 * s, 7 * s);

    // Длинные волосы для companion
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

    sprite.taskText.setText(npc.currentTask || '');
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
  // День/ночь
  // ----------------------------------------------------------
  private _buildDayOverlay() {
    const { width, height } = this.cameras.main;
    this._overlay = this.add.rectangle(
      0, 0,
      width || 640,
      height || 480,
      0x000033,
      0
    );
    this._overlay.setOrigin(0, 0);
    this._overlay.setDepth(50);
  }

  private _updateDayOverlay(phase: WorldState['dayPhase'], _progress: number) {
    const alphaMap: Record<string, number> = {
      dawn:  0.2,
      day:   0.0,
      dusk:  0.15,
      night: 0.45,
    };
    const targetAlpha = alphaMap[phase] ?? 0;

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
    for (let i = 0; i < 8; i++) {
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
    const isNight = this._worldState?.dayPhase === 'night';

    this._particles.forEach((g, i) => {
      g.clear();
      if (!isNight) return;

      const t = (Date.now() / 1000 + i * 0.7) % 1;
      const x = ((i * 97 + Date.now() / 800 + i * 33) % 620) + 10;
      const y = ((i * 67 + Date.now() / 1200 + i * 55) % 460) + 10;
      const alpha = Math.sin(t * Math.PI) * 0.8;

      g.fillStyle(0xffffaa, alpha);
      g.fillCircle(x, y, 2);
    });
  }

  // ----------------------------------------------------------
  // Action effects (mining sparks, eating, sleeping Zzz)
  // ----------------------------------------------------------
  private _actionEffectTimer = 0;
  private _actionEffectGraphics: Phaser.GameObjects.Graphics | null = null;

  private _showActionEffect(action: string, pos: { x: number; y: number }) {
    if (!this._actionEffectGraphics) {
      this._actionEffectGraphics = this.add.graphics();
      this._actionEffectGraphics.setDepth(15);
    }
    this._actionEffectGraphics.clear();

    const px = pos.x * TILE_SIZE + TILE_SIZE / 2;
    const py = pos.y * TILE_SIZE + TILE_SIZE / 2;
    const t = Date.now() / 300;

    if (action === 'COLLECT_WOOD' || action === 'COLLECT_STONE') {
      // Sparks/chips flying
      for (let i = 0; i < 3; i++) {
        const ox = Math.sin(t + i * 2) * 8;
        const oy = Math.cos(t + i * 2) * 6 - 10;
        const alpha = (Math.sin(t + i) + 1) * 0.4;
        this._actionEffectGraphics.fillStyle(action === 'COLLECT_WOOD' ? 0xddaa44 : 0xcccccc, alpha);
        this._actionEffectGraphics.fillCircle(px + ox, py + oy, 2);
      }
    } else if (action === 'EAT' || action === 'COLLECT_FOOD') {
      // Small food particles
      for (let i = 0; i < 2; i++) {
        const ox = Math.sin(t + i * 3) * 5;
        const oy = -8 - Math.abs(Math.sin(t + i)) * 6;
        this._actionEffectGraphics.fillStyle(action === 'EAT' ? 0xff8844 : 0xdd3333, 0.6);
        this._actionEffectGraphics.fillCircle(px + ox, py + oy, 2);
      }
    } else if (action === 'REST') {
      // Zzz animation
      const zCount = 3;
      for (let i = 0; i < zCount; i++) {
        const phase = (t * 0.3 + i * 0.8) % 3;
        const zx = px + 8 + phase * 4;
        const zy = py - 15 - phase * 8;
        const alpha = Math.max(0, 1 - phase / 3);
        const size = 6 + phase * 2;
        // Draw Z
        this._actionEffectGraphics.fillStyle(0xaaddff, alpha);
        this._actionEffectGraphics.fillRect(zx, zy, size, 1.5);
        this._actionEffectGraphics.fillRect(zx, zy + size * 0.4, size, 1.5);
        this._actionEffectGraphics.fillRect(zx, zy, 1.5, size * 0.4);
        this._actionEffectGraphics.fillRect(zx + size - 1.5, zy, 1.5, size * 0.4);
      }
    } else if (action === 'BUILD' || action === 'CRAFT') {
      // Hammer motion
      const swing = Math.sin(t * 2) * 6;
      this._actionEffectGraphics.fillStyle(0x888888, 0.7);
      this._actionEffectGraphics.fillRect(px + 10, py - 14 + swing, 3, 8);
      this._actionEffectGraphics.fillStyle(0xaaaaaa, 0.7);
      this._actionEffectGraphics.fillRect(px + 8, py - 16 + swing, 7, 4);
      // Sparks on hit
      if (Math.sin(t * 2) > 0.8) {
        for (let i = 0; i < 4; i++) {
          const sx = Math.random() * 10 - 5;
          const sy = Math.random() * 6;
          this._actionEffectGraphics.fillStyle(0xffcc44, 0.8);
          this._actionEffectGraphics.fillCircle(px + 12 + sx, py - 8 + sy, 1.5);
        }
      }
    } else if (action === 'INVENT') {
      // Lightbulb glow
      const glow = (Math.sin(t) + 1) * 0.3;
      this._actionEffectGraphics.fillStyle(0xffff44, glow);
      this._actionEffectGraphics.fillCircle(px, py - 20, 8);
      this._actionEffectGraphics.fillStyle(0xffffaa, glow * 0.5);
      this._actionEffectGraphics.fillCircle(px, py - 20, 12);
    }
  }

  // ----------------------------------------------------------
  // Phaser update loop
  // ----------------------------------------------------------
  update(_time: number, _delta: number) {
    if (this._isMoving) {
      this._drawCharacterBody(this._characterBody, true);
    }
  }
}
