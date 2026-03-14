import React, { useRef, useState, useCallback } from 'react';
import PhaserGame, { type PhaserGameRef } from './game/PhaserGame';
import { Chat } from './components/Chat';
import { StatusPanel } from './components/StatusPanel';
import { EventLog } from './components/EventLog';
import { ThoughtBubble } from './components/ThoughtBubble';
import { useWebSocket } from './hooks/useWebSocket';
import type { CharacterState, NPCState, Invention, Animal } from './types';

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
  const [animals, setAnimals] = useState<Animal[]>([]);
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

  const handleAnimalUpdate = useCallback((newAnimals: Animal[]) => {
    setAnimals(newAnimals);
    phaserRef.current?.updateAnimals(newAnimals);
  }, []);

  const { worldState, connected, recentEvents, chatHistory, sendMessage } =
    useWebSocket(
      handleCharacterUpdate,
      handleTileUpdate,
      handleThought,
      handleDayPhase,
      handleNPCUpdate,
      handleInvention,
      handleAnimalUpdate
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
      if (worldState.animals) setAnimals(worldState.animals);
      if (worldState.inventions) setInventions(worldState.inventions);
    }, 100);
  }

  const handleSendChat = useCallback((text: string) => {
    sendMessage({ type: 'SEND_CHAT', payload: text });
  }, [sendMessage]);

  const handleInviteNPC = useCallback((role: 'worker' | 'companion') => {
    sendMessage({ type: 'INVITE_NPC', payload: role });
  }, [sendMessage]);

  const char = character ?? worldState?.character ?? null;

  const dayPhaseRu: Record<string, string> = {
    dawn: 'Рассвет',
    day: 'День',
    dusk: 'Закат',
    night: 'Ночь',
  };

  const tamedAnimals = animals.filter(a => a.state === 'tamed' || a.state === 'farm');
  const wildAnimals = animals.filter(a => a.state === 'wild');

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'auto',
      WebkitOverflowScrolling: 'touch',
      background: '#0d0d0d',
      color: '#cccccc',
      fontFamily: '"Segoe UI", system-ui, sans-serif',
      padding: 'clamp(8px, 2vw, 16px)',
      gap: 10,
      boxSizing: 'border-box',
    }}>
      {/* Заголовок */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        paddingBottom: 6,
        borderBottom: '1px solid #222',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 18 }}>🌿</span>
        <span style={{ fontSize: 14, fontWeight: 'bold', color: '#aaddaa' }}>
          Мир Олдера
        </span>
        <span style={{ fontSize: 10, color: '#556655' }}>
          Тихая жизнь в лесу
        </span>
        {npcs.length > 0 && (
          <span style={{ fontSize: 10, color: '#88aa88' }}>
            👥{npcs.length}
          </span>
        )}
        {animals.length > 0 && (
          <span style={{ fontSize: 10, color: '#aa8844' }}>
            🐾{tamedAnimals.length}/{animals.length}
          </span>
        )}
        {inventions.length > 0 && (
          <span style={{ fontSize: 10, color: '#aaaa44' }}>
            💡{inventions.length}
          </span>
        )}
        {!connected && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 10,
            color: '#cc4444',
            background: '#2a1010',
            border: '1px solid #441111',
            padding: '2px 6px',
            borderRadius: 4,
          }}>
            Подключение...
          </span>
        )}
      </div>

      {/* Основной layout — responsive */}
      <div style={{
        display: 'flex',
        gap: 10,
        flex: 1,
        minHeight: 0,
        flexWrap: 'wrap',
      }}>
        {/* Лево: игра + мысль + лог */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: '1 1 400px',
          minWidth: 0,
        }}>
          <PhaserGame ref={phaserRef} width={GAME_W} height={GAME_H} />

          <ThoughtBubble
            thought={currentThought}
            characterName={char?.name ?? 'Олдер'}
          />

          <EventLog events={recentEvents} />
        </div>

        {/* Право: статус + панели + чат */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: '0 0 auto',
          width: 'clamp(200px, 25vw, 260px)',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
        }}>
          <StatusPanel
            character={char}
            dayPhase={dayPhase}
            tick={tick}
          />

          {/* Эмоции */}
          {char?.emotions && (
            <div style={{
              background: '#141414',
              border: '1px solid #2a2a3a',
              borderRadius: 8,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, color: '#cc88cc', fontWeight: 'bold', marginBottom: 6 }}>
                💜 Чувства
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {char.emotions.love > 10 && (
                  <EmotionBadge icon="❤" label="Любовь" value={char.emotions.love} color="#ff4466" />
                )}
                {char.emotions.loneliness > 20 && (
                  <EmotionBadge icon="😔" label="Одиночество" value={char.emotions.loneliness} color="#6688cc" />
                )}
                {char.emotions.pride > 20 && (
                  <EmotionBadge icon="💪" label="Гордость" value={char.emotions.pride} color="#ffaa44" />
                )}
                {char.emotions.grief > 10 && (
                  <EmotionBadge icon="😢" label="Горе" value={char.emotions.grief} color="#8888cc" />
                )}
                {char.emotions.excitement > 20 && (
                  <EmotionBadge icon="✨" label="Волнение" value={char.emotions.excitement} color="#ffdd44" />
                )}
                {char.emotions.fear > 10 && (
                  <EmotionBadge icon="😰" label="Страх" value={char.emotions.fear} color="#cc4444" />
                )}
              </div>
            </div>
          )}

          {/* NPC панель */}
          <div style={{
            background: '#141414',
            border: '1px solid #2a3a2a',
            borderRadius: 8,
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: 11, color: '#88cc88', fontWeight: 'bold', marginBottom: 6 }}>
              👥 Жители {npcs.length > 0 ? `(${npcs.length})` : ''}
            </div>
            {npcs.map(npc => (
              <div key={npc.id} style={{
                fontSize: 10,
                color: '#aaccaa',
                padding: '2px 0',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 4,
              }}>
                <span style={{ whiteSpace: 'nowrap' }}>
                  {npc.role === 'worker' ? '⛏' : npc.role === 'companion' ? '♥' : '★'}{' '}
                  {npc.name}
                </span>
                <span style={{ color: '#668866', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {npc.currentTask}
                </span>
              </div>
            ))}
            {npcs.length === 0 && (
              <div style={{ fontSize: 10, color: '#556655', marginBottom: 6 }}>
                Пока никого нет...
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              <button
                onClick={() => handleInviteNPC('worker')}
                disabled={!connected || npcs.filter(n => n.role === 'worker').length >= 5}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 10,
                  background: '#1a2a1a',
                  border: '1px solid #3a5a3a',
                  borderRadius: 4,
                  color: '#88cc88',
                  cursor: 'pointer',
                  opacity: !connected || npcs.filter(n => n.role === 'worker').length >= 5 ? 0.4 : 1,
                }}
              >
                ⛏ Рабочий
              </button>
              <button
                onClick={() => handleInviteNPC('companion')}
                disabled={!connected || npcs.some(n => n.role === 'companion')}
                style={{
                  flex: 1,
                  padding: '4px 6px',
                  fontSize: 10,
                  background: '#2a1a2a',
                  border: '1px solid #5a3a5a',
                  borderRadius: 4,
                  color: '#cc88cc',
                  cursor: 'pointer',
                  opacity: !connected || npcs.some(n => n.role === 'companion') ? 0.4 : 1,
                }}
              >
                💕 Спутница
              </button>
            </div>
          </div>

          {/* Животные панель */}
          {animals.length > 0 && (
            <div style={{
              background: '#141414',
              border: '1px solid #3a2a1a',
              borderRadius: 8,
              padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, color: '#ccaa66', fontWeight: 'bold', marginBottom: 6 }}>
                🐾 Животные ({animals.length})
              </div>
              {tamedAnimals.map(a => (
                <div key={a.id} style={{ fontSize: 10, color: '#aaccaa', padding: '1px 0' }}>
                  {animalEmoji(a.type)} {a.name || a.type} <span style={{ color: '#668866' }}>— ферма</span>
                </div>
              ))}
              {wildAnimals.length > 0 && (
                <div style={{ fontSize: 10, color: '#ccaaaa', marginTop: 3 }}>
                  🌲 Дикие: {wildAnimals.map(a => animalEmoji(a.type)).join(' ')}
                </div>
              )}
            </div>
          )}

          {/* Изобретения */}
          {inventions.length > 0 && (
            <div style={{
              background: '#141414',
              border: '1px solid #3a3a1a',
              borderRadius: 8,
              padding: '8px 10px',
              maxHeight: 80,
              overflowY: 'auto',
            }}>
              <div style={{ fontSize: 11, color: '#cccc44', fontWeight: 'bold', marginBottom: 6 }}>
                💡 Изобретения
              </div>
              {inventions.map(inv => (
                <div key={inv.id} style={{
                  fontSize: 10,
                  color: '#aaaa88',
                  padding: '1px 0',
                }}>
                  <span style={{ color: '#cccc66' }}>{inv.name}</span>
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
        fontSize: 9,
        color: '#333',
        textAlign: 'center',
        paddingTop: 6,
        borderTop: '1px solid #181818',
        flexShrink: 0,
      }}>
        Тик: {tick} · {dayPhaseRu[dayPhase] || dayPhase} · 🐾{animals.length}
      </div>
    </div>
  );
}

function EmotionBadge({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div title={`${label}: ${Math.round(value)}`} style={{
      background: '#1a1a2a',
      border: `1px solid ${color}33`,
      borderRadius: 4,
      padding: '2px 5px',
      fontSize: 10,
      color,
      display: 'flex',
      alignItems: 'center',
      gap: 3,
    }}>
      <span>{icon}</span>
      <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{Math.round(value)}</span>
    </div>
  );
}

function animalEmoji(type: string): string {
  const map: Record<string, string> = {
    rabbit: '🐰', deer: '🦌', wolf: '🐺',
    chicken: '🐔', cow: '🐄', pig: '🐷',
  };
  return map[type] || '🐾';
}
