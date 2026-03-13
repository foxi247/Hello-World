import React, { useRef, useState, useCallback } from 'react';
import PhaserGame, { type PhaserGameRef } from './game/PhaserGame';
import { Chat } from './components/Chat';
import { StatusPanel } from './components/StatusPanel';
import { EventLog } from './components/EventLog';
import { ThoughtBubble } from './components/ThoughtBubble';
import { useWebSocket } from './hooks/useWebSocket';
import type { CharacterState, NPCState, Invention } from './types';

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
  const [npcs, setNPCs] = useState<NPCState[]>([]);
  const [inventions, setInventions] = useState<Invention[]>([]);

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

  const handleNPCUpdate = useCallback((newNPCs: NPCState[]) => {
    setNPCs(newNPCs);
    phaserRef.current?.updateNPCs(newNPCs);
  }, []);

  const handleInvention = useCallback((inv: Invention) => {
    setInventions(prev => [...prev, inv]);
  }, []);

  const { worldState, connected, recentEvents, chatHistory, sendMessage } =
    useWebSocket(
      handleCharacterUpdate,
      handleTileUpdate,
      handleThought,
      handleDayPhase,
      handleNPCUpdate,
      handleInvention
    );

  const worldStateRef = useRef<typeof worldState>(null);
  if (worldState && worldState !== worldStateRef.current) {
    worldStateRef.current = worldState;
    setTimeout(() => {
      phaserRef.current?.loadWorldState(worldState);
      setCharacter(worldState.character);
      setTick(worldState.tick);
      setDayPhase(worldState.dayPhase);
      if (worldState.npcs) setNPCs(worldState.npcs);
      if (worldState.inventions) setInventions(worldState.inventions);
    }, 100);
  }

  const handleSendChat = useCallback((text: string) => {
    sendMessage({ type: 'SEND_CHAT', payload: text });
  }, [sendMessage]);

  const char = character ?? worldState?.character ?? null;

  const dayPhaseRu: Record<string, string> = {
    dawn: 'Рассвет',
    day: 'День',
    dusk: 'Закат',
    night: 'Ночь',
  };

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
      {/* Заголовок */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #222',
      }}>
        <span style={{ fontSize: 20 }}>🌿</span>
        <span style={{ fontSize: 16, fontWeight: 'bold', color: '#aaddaa' }}>
          Мир Олдера
        </span>
        <span style={{ fontSize: 11, color: '#556655', marginLeft: 4 }}>
          Тихая жизнь в лесу
        </span>
        {npcs.length > 0 && (
          <span style={{ fontSize: 11, color: '#88aa88', marginLeft: 8 }}>
            👥 {npcs.length} {npcs.length === 1 ? 'житель' : 'жителей'}
          </span>
        )}
        {inventions.length > 0 && (
          <span style={{ fontSize: 11, color: '#aaaa44', marginLeft: 8 }}>
            💡 {inventions.length} {inventions.length === 1 ? 'изобретение' : 'изобретений'}
          </span>
        )}
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
            Подключение к серверу...
          </span>
        )}
      </div>

      {/* Основной layout */}
      <div style={{
        display: 'flex',
        gap: 12,
        flex: 1,
        minHeight: 0,
        alignItems: 'flex-start',
      }}>
        {/* Лево: игра + мысль + лог */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <PhaserGame ref={phaserRef} width={GAME_W} height={GAME_H} />

          <ThoughtBubble
            thought={currentThought}
            characterName={char?.name ?? 'Олдер'}
          />

          <EventLog events={recentEvents} />
        </div>

        {/* Право: статус + чат */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          width: 260,
          flexShrink: 0,
          height: GAME_H + 12 + 50 + 12 + 120,
        }}>
          <StatusPanel
            character={char}
            dayPhase={dayPhase}
            tick={tick}
          />

          {/* NPC панель если есть */}
          {npcs.length > 0 && (
            <div style={{
              background: '#141414',
              border: '1px solid #2a3a2a',
              borderRadius: 8,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, color: '#88cc88', fontWeight: 'bold', marginBottom: 6 }}>
                👥 Жители ({npcs.length})
              </div>
              {npcs.map(npc => (
                <div key={npc.id} style={{
                  fontSize: 10,
                  color: '#aaccaa',
                  padding: '2px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>
                    {npc.role === 'worker' ? '⛏' : npc.role === 'companion' ? '♥' : '★'}{' '}
                    {npc.name}
                  </span>
                  <span style={{ color: '#668866' }}>{npc.currentTask}</span>
                </div>
              ))}
            </div>
          )}

          {/* Изобретения если есть */}
          {inventions.length > 0 && (
            <div style={{
              background: '#141414',
              border: '1px solid #3a3a1a',
              borderRadius: 8,
              padding: '8px 10px',
              maxHeight: 100,
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 11, color: '#cccc44', fontWeight: 'bold', marginBottom: 6 }}>
                💡 Изобретения
              </div>
              {inventions.map(inv => (
                <div key={inv.id} style={{
                  fontSize: 10,
                  color: '#aaaa88',
                  padding: '2px 0',
                }}>
                  <span style={{ color: '#cccc66' }}>{inv.name}</span>
                  {' — '}
                  <span>{inv.description}</span>
                </div>
              ))}
            </div>
          )}

          <Chat
            messages={chatHistory}
            connected={connected}
            onSend={handleSendChat}
          />
        </div>
      </div>

      {/* Футер */}
      <div style={{
        fontSize: 10,
        color: '#333',
        textAlign: 'center',
        paddingTop: 8,
        borderTop: '1px solid #181818',
      }}>
        Мозг: Mistral · Хранение: SQLite · Тик: {tick} · {dayPhaseRu[dayPhase] || dayPhase}
      </div>
    </div>
  );
}
