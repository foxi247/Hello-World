import { useEffect, useRef, useCallback, useState } from 'react';
import type { WSServerMessage, WSClientMessage, WorldState, CharacterState, GameEvent, ChatMessage, NPCState, Invention } from '../types';

// Подключаемся к тому же хосту и порту что и сам сайт (работает через туннель)
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${protocol}//${window.location.host}`;
const RECONNECT_DELAY_MS = 3000;

export interface GameStateSlice {
  worldState: WorldState | null;
  connected: boolean;
  recentEvents: GameEvent[];
  chatHistory: ChatMessage[];
}

export function useWebSocket(
  onCharacterUpdate: (c: CharacterState) => void,
  onTileUpdate: (x: number, y: number) => void,
  onThought: (t: string) => void,
  onDayPhase: (phase: string, progress: number) => void,
  onNPCUpdate?: (npcs: NPCState[]) => void,
  onInvention?: (inv: Invention) => void,
) {
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [connected, setConnected] = useState(false);
  const [recentEvents, setRecentEvents] = useState<GameEvent[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        console.log('[WS] Connected');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as WSServerMessage;
          handleMessage(msg);
        } catch (err) {
          console.error('[WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        console.log('[WS] Disconnected — reconnecting in', RECONNECT_DELAY_MS, 'ms');
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (err) {
      console.error('[WS] Connection failed:', err);
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }
  }, []); // eslint-disable-line

  const handleMessage = useCallback((msg: WSServerMessage) => {
    switch (msg.type) {
      case 'FULL_STATE':
        setWorldState(msg.payload);
        setRecentEvents(msg.payload.recentEvents.slice(-50));
        setChatHistory(msg.payload.chatHistory.slice(-50));
        break;

      case 'CHARACTER_UPDATE':
        setWorldState(prev => prev ? { ...prev, character: msg.payload } : prev);
        onCharacterUpdate(msg.payload);
        break;

      case 'TILE_UPDATE':
        setWorldState(prev => {
          if (!prev) return prev;
          const newTiles = prev.tiles.map(row => [...row]);
          newTiles[msg.payload.y][msg.payload.x] = msg.payload.tile;
          onTileUpdate(msg.payload.x, msg.payload.y);
          return { ...prev, tiles: newTiles };
        });
        break;

      case 'NEW_EVENT':
        setRecentEvents(prev => {
          const next = [...prev, msg.payload];
          return next.slice(-50);
        });
        setWorldState(prev => {
          if (!prev) return prev;
          const events = [...prev.recentEvents, msg.payload].slice(-50);
          return { ...prev, recentEvents: events };
        });
        break;

      case 'CHAT_RESPONSE':
        setChatHistory(prev => {
          const next = [...prev, msg.payload];
          return next.slice(-50);
        });
        setWorldState(prev => {
          if (!prev) return prev;
          const chat = [...prev.chatHistory, msg.payload].slice(-50);
          return { ...prev, chatHistory: chat };
        });
        break;

      case 'THOUGHT':
        onThought(msg.payload);
        break;

      case 'DAY_PHASE':
        onDayPhase(msg.payload.phase, msg.payload.progress);
        setWorldState(prev =>
          prev ? { ...prev, dayPhase: msg.payload.phase as WorldState['dayPhase'], dayProgress: msg.payload.progress } : prev
        );
        break;

      case 'NPC_UPDATE':
        setWorldState(prev => prev ? { ...prev, npcs: msg.payload } : prev);
        onNPCUpdate?.(msg.payload);
        break;

      case 'INVENTION':
        setWorldState(prev => prev ? { ...prev, inventions: [...(prev.inventions || []), msg.payload] } : prev);
        onInvention?.(msg.payload);
        break;

      case 'ERROR':
        console.error('[WS] Server error:', msg.payload);
        break;
    }
  }, [onCharacterUpdate, onTileUpdate, onThought, onDayPhase, onNPCUpdate, onInvention]);

  const sendMessage = useCallback((msg: WSClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] Not connected, cannot send message');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { worldState, connected, recentEvents, chatHistory, sendMessage };
}
