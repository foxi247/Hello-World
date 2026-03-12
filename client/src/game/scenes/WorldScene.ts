import Phaser from 'phaser';
import type { WorldState, WorldTile, CharacterState, TileType } from '../../types';

// ============================================================
// Constants
// ============================================================
const TILE_SIZE = 32;

// Tile colors
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
  private _overlay!: Phaser.GameObjects.Rectangle;  // day/night overlay
  private _worldState: WorldState | null = null;
  private _charPos: { x: number; y: number } = { x: 0, y: 0 };
  private _isMoving = false;
  private _particles: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    this._buildTileGrid();
    this._buildCharacter();
    this._buildDayOverlay();
    this._buildAmbientParticles();
  }

  // ----------------------------------------------------------
  // Called from React to inject world state
  // ----------------------------------------------------------
  loadWorldState(state: WorldState) {
    this._worldState = state;
    this._renderTiles(state.tiles);
    this._updateCharacter(state.character);
    this._updateDayOverlay(state.dayPhase, state.dayProgress);
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

  // ----------------------------------------------------------
  // Build tile grid
  // ----------------------------------------------------------
  private _buildTileGrid() {
    if (!this._worldState) {
      // Create placeholder graphics
      const g = this.add.graphics();
      g.fillStyle(0x5a8c3e);
      g.fillRect(0, 0, 20 * TILE_SIZE, 15 * TILE_SIZE);
      return;
    }
    this._renderTiles(this._worldState.tiles);
  }

  private _renderTiles(tiles: WorldTile[][]) {
    // Clear old graphics
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

    // Base tile
    g.fillStyle(TILE_COLORS.GRASS);
    g.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    switch (tile.type) {
      case 'GRASS':
        // Subtle grass variation
        g.fillStyle(color);
        g.fillRect(px + 1, py + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        break;

      case 'TREE': {
        // Trunk
        g.fillStyle(0x8b6914);
        g.fillRect(px + 13, py + 18, 6, 14);
        // Canopy
        g.fillStyle(color);
        g.fillCircle(px + 16, py + 14, 12);
        g.fillStyle(0x1a4a10);
        g.fillCircle(px + 11, py + 16, 8);
        g.fillCircle(px + 21, py + 16, 7);
        // Resource indicator
        if (tile.resource > 0) {
          g.fillStyle(0xaa8800, 0.6);
          g.fillCircle(px + 25, py + 6, 4);
        }
        break;
      }

      case 'STONE': {
        g.fillStyle(color);
        g.fillEllipse(px + 14, py + 20, 20, 14);
        g.fillStyle(0xaaaaaa);
        g.fillEllipse(px + 10, py + 16, 14, 10);
        g.fillStyle(0x666666);
        g.fillEllipse(px + 18, py + 22, 10, 7);
        break;
      }

      case 'BERRY_BUSH': {
        g.fillStyle(color);
        g.fillCircle(px + 14, py + 18, 10);
        g.fillStyle(0x2a6020);
        g.fillCircle(px + 20, py + 16, 8);
        // Berries
        if (tile.resource > 0) {
          g.fillStyle(0xcc2222);
          g.fillCircle(px + 12, py + 16, 3);
          g.fillCircle(px + 18, py + 20, 3);
          g.fillCircle(px + 22, py + 15, 2);
        }
        break;
      }

      case 'CAMPFIRE': {
        // Base stones
        g.fillStyle(0x888888);
        g.fillCircle(px + 16, py + 22, 8);
        // Fire
        g.fillStyle(0xff8800);
        g.fillTriangle(px + 16, py + 10, px + 10, py + 22, px + 22, py + 22);
        g.fillStyle(0xffcc00);
        g.fillTriangle(px + 16, py + 14, px + 13, py + 22, px + 19, py + 22);
        g.fillStyle(0xffffff, 0.5);
        g.fillCircle(px + 16, py + 16, 3);
        break;
      }

      case 'BED': {
        // Frame
        g.fillStyle(0x8b6040);
        g.fillRect(px + 3, py + 6, 26, 20);
        // Mattress
        g.fillStyle(0xe8d8c0);
        g.fillRect(px + 5, py + 8, 22, 16);
        // Pillow
        g.fillStyle(0xffffff);
        g.fillRect(px + 6, py + 9, 10, 8);
        // Blanket
        g.fillStyle(0x6688cc);
        g.fillRect(px + 6, py + 17, 20, 6);
        break;
      }

      case 'CHEST': {
        // Body
        g.fillStyle(color);
        g.fillRect(px + 4, py + 12, 24, 16);
        // Lid
        g.fillStyle(0xe8b840);
        g.fillRect(px + 4, py + 8, 24, 6);
        // Lock
        g.fillStyle(0x888800);
        g.fillRect(px + 13, py + 15, 6, 5);
        g.fillStyle(0xcccc00);
        g.fillCircle(px + 16, py + 16, 3);
        // Border
        g.lineStyle(1, border);
        g.strokeRect(px + 4, py + 8, 24, 20);
        break;
      }

      case 'WALL': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Stone texture
        g.fillStyle(0x8a7458);
        g.fillRect(px + 2, py + 2, 12, 8);
        g.fillRect(px + 18, py + 2, 10, 8);
        g.fillRect(px + 8, py + 12, 14, 8);
        g.fillRect(px + 2, py + 22, 10, 8);
        g.fillRect(px + 20, py + 22, 8, 8);
        break;
      }

      case 'FLOOR': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        // Wood grain
        g.lineStyle(1, 0xb09070, 0.4);
        g.beginPath();
        g.moveTo(px + 4, py);
        g.lineTo(px + 4, py + TILE_SIZE);
        g.strokePath();
        g.beginPath();
        g.moveTo(px + 12, py);
        g.lineTo(px + 12, py + TILE_SIZE);
        g.strokePath();
        g.beginPath();
        g.moveTo(px + 20, py);
        g.lineTo(px + 20, py + TILE_SIZE);
        g.strokePath();
        g.beginPath();
        g.moveTo(px + 28, py);
        g.lineTo(px + 28, py + TILE_SIZE);
        g.strokePath();
        break;
      }

      case 'WATER': {
        g.fillStyle(color);
        g.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        g.fillStyle(0x5a9ace, 0.5);
        g.fillRect(px + 2, py + 8, 28, 6);
        g.fillRect(px + 2, py + 20, 28, 6);
        break;
      }
    }
  }

  // ----------------------------------------------------------
  // Build character sprite
  // ----------------------------------------------------------
  private _buildCharacter() {
    this._characterSprite = this.add.container(0, 0);
    this._characterSprite.setDepth(10);

    this._characterBody = this.add.graphics();
    this._drawCharacterBody(this._characterBody, false);
    this._characterSprite.add(this._characterBody);

    // Name tag
    this._nameText = this.add.text(0, -30, 'Alder', {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#00000088',
      padding: { x: 4, y: 2 },
    });
    this._nameText.setOrigin(0.5, 1);
    this._characterSprite.add(this._nameText);

    // Action label
    this._actionText = this.add.text(0, -18, '', {
      fontSize: '9px',
      color: '#ffffaa',
      backgroundColor: '#00000066',
      padding: { x: 3, y: 1 },
    });
    this._actionText.setOrigin(0.5, 1);
    this._characterSprite.add(this._actionText);

    // Thought bubble (hidden initially)
    this._buildThoughtBubble();

    // Default position
    this._characterSprite.setPosition(
      10 * TILE_SIZE + TILE_SIZE / 2,
      11 * TILE_SIZE + TILE_SIZE / 2
    );
  }

  private _drawCharacterBody(g: Phaser.GameObjects.Graphics, isMoving: boolean) {
    g.clear();
    const bounce = isMoving ? Math.sin(Date.now() / 150) * 2 : 0;

    // Shadow
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 10, 18, 6);

    // Body
    g.fillStyle(0x4488cc);
    g.fillRect(-6, -2 + bounce, 12, 14);

    // Head
    g.fillStyle(0xf4c898);
    g.fillCircle(0, -9 + bounce, 8);

    // Eyes
    g.fillStyle(0x333333);
    g.fillCircle(-3, -10 + bounce, 1.5);
    g.fillCircle(3, -10 + bounce, 1.5);

    // Hair
    g.fillStyle(0x8b5e2a);
    g.fillRect(-8, -17 + bounce, 16, 8);
    g.fillCircle(0, -17 + bounce, 8);

    // Legs
    g.fillStyle(0x336688);
    g.fillRect(-6, 12 + bounce, 5, 8);
    g.fillRect(1, 12 + (isMoving ? -bounce : bounce), 5, 8);

    // Feet
    g.fillStyle(0x886633);
    g.fillEllipse(-4, 20 + bounce, 6, 4);
    g.fillEllipse(4, 20 + (isMoving ? -bounce : bounce), 6, 4);
  }

  private _buildThoughtBubble() {
    this._thoughtBubble = this.add.container(0, 0);
    this._thoughtBubble.setDepth(20);
    this._thoughtBubble.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0xffffff, 0.92);
    bg.fillRoundedRect(-80, -70, 160, 50, 10);
    bg.lineStyle(2, 0xaaaaaa);
    bg.strokeRoundedRect(-80, -70, 160, 50, 10);
    // Bubble tail
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

    // Position near character
    const cx = this._characterSprite.x;
    const cy = this._characterSprite.y;
    this._thoughtBubble.setPosition(cx + 20, cy - 20);

    // Auto-hide after 6 seconds
    this.time.delayedCall(6000, () => {
      this._thoughtBubble.setVisible(false);
    });
  }

  // ----------------------------------------------------------
  // Update character position with smooth movement
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

      // Flip sprite based on direction
      if (targetX < curX) {
        this._characterSprite.setScale(-1, 1);
      } else {
        this._characterSprite.setScale(1, 1);
      }
    }

    // Update action label
    this._actionText.setText(char.currentIntentLabel || '');

    // Update thought bubble position if visible
    if (this._thoughtBubble.visible) {
      this._thoughtBubble.setPosition(
        this._characterSprite.x + 20,
        this._characterSprite.y - 20
      );
    }
  }

  // ----------------------------------------------------------
  // Day/night overlay
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
  // Ambient floating particles (fireflies at night, dust in day)
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
  // Phaser update loop
  // ----------------------------------------------------------
  update(_time: number, _delta: number) {
    if (this._isMoving) {
      this._drawCharacterBody(this._characterBody, true);
    }
  }
}
