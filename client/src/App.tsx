import React, { useRef, useState, useCallback } from 'react';
import PhaserGame, { type PhaserGameRef } from './game/PhaserGame';
import { Chat } from './components/Chat';
import { StatusPanel } from './components/StatusPanel';
import { EventLog } from './components/EventLog';
import { ThoughtBubble } from './components/ThoughtBubble';
import { useWebSocket } from './hooks/useWebSocket';
import type { CharacterState } from './types';

const TILE_SIZE = 32;
const WORLD_W = 20;
const WORLD_H = 15;
const GAME_W = WORLD_W * TILE_SIZE; // 640
const GAME_H = WORLD_H * TILE_SIZE; // 480

export default function App() {
  const phaserRef = useRef<PhaserGameRef>(null);
  const [currentThought, setCurrentThought] = useState('');
  const [dayPhase, setDayPhase] = useState('day');
  const [tick, setTick] = useState(0);
  const [character, setCharacter] = useState<CharacterState | null>(null);

  // ----------------------------------------------------------
  // WebSocket callbacks
  // ----------------------------------------------------------
  const handleCharacterUpdate = useCallback((char: CharacterState) => {
    setCharacter(char);
    setTick(char.tickAge);
    phaserRef.current?.updateCharacter(char);
  }, []);

  const handleTileUpdate = useCallback((x: number, y: number) => {
    phaserRef.current?.updateTile(x, y);
  }, []);

  const handleThought = useCallback((thought: string) => {
    setCurrentThought(thought);
    phaserRef.current?.showThought(thought);
  }, []);

  const handleDayPhase = useCallback((phase: string, progress: number) => {
    setDayPhase(phase);
    phaserRef.current?.updateDayPhase(phase, progress);
  }, []);

  const { worldState, connected, recentEvents, chatHistory, sendMessage } =
    useWebSocket(
      handleCharacterUpdate,
      handleTileUpdate,
      handleThought,
      handleDayPhase
    );

  // Load world state into Phaser once received
  const worldStateRef = useRef<typeof worldState>(null);
  if (worldState && worldState !== worldStateRef.current) {
    worldStateRef.current = worldState;
    // Defer to next frame so Phaser scene is ready
    setTimeout(() => {
      phaserRef.current?.loadWorldState(worldState);
      setCharacter(worldState.character);
      setTick(worldState.tick);
      setDayPhase(worldState.dayPhase);
    }, 100);
  }

  const handleSendChat = useCallback((text: string) => {
    sendMessage({ type: 'SEND_CHAT', payload: text });
  }, [sendMessage]);

  const char = character ?? worldState?.character ?? null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: '#0d0d0d',
      color: '#cccccc',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      padding: 16,
      gap: 12,
      boxSizing: 'border-box',
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #222',
      }}>
        <span style={{ fontSize: 20 }}>🌿</span>
        <span style={{ fontSize: 16, fontWeight: 'bold', color: '#aaddaa' }}>
          Alder's World
        </span>
        <span style={{ fontSize: 11, color: '#556655', marginLeft: 4 }}>
          A small life, quietly lived
        </span>
        {!connected && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: '#cc4444',
            background: '#2a1010',
            border: '1px solid #441111',
            padding: '3px 8px',
            borderRadius: 4,
          }}>
            ⚠ Connecting to server...
          </span>
        )}
      </div>

      {/* Main layout */}
      <div style={{
        display: 'flex',
        gap: 12,
        flex: 1,
        minHeight: 0,
        alignItems: 'flex-start',
      }}>
        {/* Left: game + thought + event log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhaserGame ref={phaserRef} width={GAME_W} height={GAME_H} />

          <ThoughtBubble
            thought={currentThought}
            characterName={char?.name ?? 'Alder'}
          />

          <EventLog events={recentEvents} />
        </div>

        {/* Right: status + chat */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 260,
          flexShrink: 0,
          height: GAME_H + 12 + 50 + 12 + 120,  // match left column height
        }}>
          <StatusPanel
            character={char}
            dayPhase={dayPhase}
            tick={tick}
          />

          <Chat
            messages={chatHistory}
            connected={connected}
            onSend={handleSendChat}
          />
        </div>
      </div>

      {/* Footer */}
      <div style={{
        fontSize: 10,
        color: '#333',
        textAlign: 'center',
        paddingTop: 8,
        borderTop: '1px solid #181818',
      }}>
        AI brain: Mistral Large · Persistence: SQLite · Tick: {tick}
      </div>
    </div>
  );
}
