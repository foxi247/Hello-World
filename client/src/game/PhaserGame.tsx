import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import type { WorldState, CharacterState, NPCState } from '../types';

// ============================================================
// Exposed ref API
// ============================================================
export interface PhaserGameRef {
  loadWorldState: (state: WorldState) => void;
  updateCharacter: (char: CharacterState) => void;
  updateTile: (x: number, y: number) => void;
  updateDayPhase: (phase: string, progress: number) => void;
  showThought: (thought: string) => void;
  updateNPCs: (npcs: NPCState[]) => void;
}

interface Props {
  width?: number;
  height?: number;
}

const TILE_SIZE = 32;
const WORLD_W = 20;
const WORLD_H = 15;

const PhaserGame = forwardRef<PhaserGameRef, Props>(({ width, height }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  const sceneRef     = useRef<WorldScene | null>(null);

  const gameWidth  = width  ?? WORLD_W * TILE_SIZE;
  const gameHeight = height ?? WORLD_H * TILE_SIZE;

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    loadWorldState(state: WorldState) {
      sceneRef.current?.loadWorldState(state);
    },
    updateCharacter(char: CharacterState) {
      sceneRef.current?.updateCharacter(char);
    },
    updateTile(x: number, y: number) {
      sceneRef.current?.updateTile(x, y);
    },
    updateDayPhase(phase: string, progress: number) {
      sceneRef.current?.updateDayPhase(phase, progress);
    },
    showThought(thought: string) {
      sceneRef.current?.showThought(thought);
    },
    updateNPCs(npcs: NPCState[]) {
      sceneRef.current?.updateNPCs(npcs);
    },
  }));

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: gameWidth,
      height: gameHeight,
      backgroundColor: '#5a8c3e',
      parent: containerRef.current,
      scene: [WorldScene],
      render: {
        pixelArt: false,
        antialias: true,
      },
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    // Get scene ref once it's created
    game.events.on(Phaser.Core.Events.READY, () => {
      const scene = game.scene.getScene('WorldScene') as WorldScene;
      sceneRef.current = scene;
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []); // eslint-disable-line

  return (
    <div
      ref={containerRef}
      style={{
        width: gameWidth,
        height: gameHeight,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        border: '2px solid #3a5a2a',
        flexShrink: 0,
      }}
    />
  );
});

PhaserGame.displayName = 'PhaserGame';
export default PhaserGame;
