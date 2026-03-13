import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { WSClientMessage, WSServerMessage } from '../../../shared/types';
import type { Simulation } from '../game/simulation';
import type { WorldManager } from '../game/world';

// ============================================================
// WebSocket broadcast manager
// ============================================================
export class WSHandler {
  private _wss: WebSocketServer;
  private _simulation: Simulation;
  private _world: WorldManager;

  constructor(wss: WebSocketServer, simulation: Simulation) {
    this._wss = wss;
    this._simulation = simulation;
    this._world = simulation.getWorld();

    this._setupSimulationCallbacks();
    this._wss.on('connection', (ws, req) => this._onConnection(ws, req));
  }

  // ----------------------------------------------------------
  // Setup callbacks from simulation
  // ----------------------------------------------------------
  private _setupSimulationCallbacks(): void {
    // These are set on the simulation already, handled via broadcast methods
  }

  // ----------------------------------------------------------
  // New client connects
  // ----------------------------------------------------------
  private _onConnection(ws: WebSocket, _req: IncomingMessage): void {
    console.log('[WS] Client connected. Total:', this._wss.clients.size);

    // Send full world state immediately
    this._send(ws, {
      type: 'FULL_STATE',
      payload: this._world.getSnapshot(),
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSClientMessage;
        this._handleClientMessage(ws, msg);
      } catch (err) {
        console.error('[WS] Bad message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected. Total:', this._wss.clients.size);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });
  }

  // ----------------------------------------------------------
  // Handle messages from client
  // ----------------------------------------------------------
  private _handleClientMessage(ws: WebSocket, msg: WSClientMessage): void {
    switch (msg.type) {
      case 'REQUEST_STATE': {
        this._send(ws, {
          type: 'FULL_STATE',
          payload: this._world.getSnapshot(),
        });
        break;
      }

      case 'SEND_CHAT': {
        const text = (msg.payload ?? '').toString().trim();
        if (!text) return;

        // Add user message
        const userMsg = this._world.addChatMessage('user', text);
        this._broadcast({ type: 'CHAT_RESPONSE', payload: userMsg });
        this._world.addEvent('chat_in', `Ты: ${text}`);
        this._broadcastNewEvents();

        // Generate character response
        this._simulation.handleChat(text, (response) => {
          const charMsg = this._world.addChatMessage('character', response);
          this._broadcast({ type: 'CHAT_RESPONSE', payload: charMsg });
          this._world.addEvent('chat_out', `${this._world.character.name}: ${response}`);
          this._broadcastNewEvents();
        });
        break;
      }
    }
  }

  // ----------------------------------------------------------
  // Broadcast to all connected clients
  // ----------------------------------------------------------
  broadcast(msg: WSServerMessage): void {
    this._broadcast(msg);
  }

  private _broadcast(msg: WSServerMessage): void {
    const data = JSON.stringify(msg);
    this._wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, (err) => {
          if (err) console.error('[WS] Send error:', err.message);
        });
      }
    });
  }

  private _send(ws: WebSocket, msg: WSServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg), (err) => {
        if (err) console.error('[WS] Send error:', err.message);
      });
    }
  }

  broadcastCharacterUpdate(): void {
    this._broadcast({
      type: 'CHARACTER_UPDATE',
      payload: this._world.character,
    });
  }

  broadcastNewEvents(): void {
    this._broadcastNewEvents();
  }

  private _broadcastNewEvents(): void {
    const events = this._world.drainNewEvents();
    for (const event of events) {
      this._broadcast({ type: 'NEW_EVENT', payload: event });
    }
  }

  broadcastThought(thought: string): void {
    this._broadcast({ type: 'THOUGHT', payload: thought });
  }

  broadcastDayPhase(): void {
    this._broadcast({
      type: 'DAY_PHASE',
      payload: {
        phase: this._world.state.dayPhase,
        progress: this._world.state.dayProgress,
      },
    });
  }

  broadcastTileChanged(x: number, y: number): void {
    const tile = this._world.tiles[y]?.[x];
    if (tile) {
      this._broadcast({ type: 'TILE_UPDATE', payload: { x, y, tile } });
    }
  }

  broadcastNPCUpdate(): void {
    this._broadcast({
      type: 'NPC_UPDATE',
      payload: this._world.npcs,
    });
  }

  broadcastInvention(invention: import('../../../shared/types').Invention): void {
    this._broadcast({ type: 'INVENTION', payload: invention });
  }
}
