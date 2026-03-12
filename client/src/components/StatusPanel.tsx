import React from 'react';
import type { CharacterState } from '../types';

interface Props {
  character: CharacterState | null;
  dayPhase: string;
  tick: number;
}

interface NeedBarProps {
  label: string;
  value: number;
  color: string;
  icon: string;
}

function NeedBar({ label, value, color, icon }: NeedBarProps) {
  const pct = Math.round(value);
  const isLow = pct < 25;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: 11 }}>
        <span style={{ color: isLow ? '#ff8888' : '#cccccc' }}>
          {icon} {label}
        </span>
        <span style={{ color: isLow ? '#ff8888' : '#888888', fontFamily: 'monospace' }}>
          {pct}
        </span>
      </div>
      <div style={{
        height: 6,
        background: '#2a2a2a',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isLow
            ? `linear-gradient(to right, #cc4444, ${color})`
            : color,
          borderRadius: 3,
          transition: 'width 0.5s ease',
          animation: isLow ? 'pulse 1s ease-in-out infinite' : 'none',
        }} />
      </div>
    </div>
  );
}

const DAY_ICONS: Record<string, string> = {
  dawn: '🌅',
  day:  '☀️',
  dusk: '🌇',
  night: '🌙',
};

export function StatusPanel({ character, dayPhase, tick }: Props) {
  if (!character) {
    return (
      <div style={panelStyle}>
        <div style={{ color: '#666', fontSize: 12 }}>Loading...</div>
      </div>
    );
  }

  const day = Math.floor(tick / 400) + 1;
  const timeLabel = `Day ${day} · ${DAY_ICONS[dayPhase] ?? '?'} ${dayPhase}`;

  const inv = character.inventory;
  const wood  = inv.find(i => i.type === 'wood')?.amount  ?? 0;
  const stone = inv.find(i => i.type === 'stone')?.amount ?? 0;
  const food  = inv.find(i => i.type === 'food')?.amount  ?? 0;

  const homeLabels = ['No shelter', 'Has campfire', 'Simple shelter', 'Cozy hut'];

  return (
    <div style={panelStyle}>
      <div style={{ borderBottom: '1px solid #333', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: '#e8d4a0' }}>
          {character.name}
        </div>
        <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>
          {timeLabel}
        </div>
        <div style={{ fontSize: 10, color: '#667788', marginTop: 1 }}>
          {homeLabels[character.homeLevel] ?? 'Home'}
        </div>
      </div>

      <NeedBar label="Hunger"  value={character.needs.hunger}  color="#e8a030" icon="🍞" />
      <NeedBar label="Energy"  value={character.needs.energy}  color="#4488ee" icon="⚡" />
      <NeedBar label="Mood"    value={character.needs.mood}    color="#cc88ee" icon="😊" />
      <NeedBar label="Comfort" value={character.needs.comfort} color="#44bb88" icon="🏠" />

      <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#aaa', marginBottom: 5 }}>Inventory</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <InventoryBadge icon="🪵" amount={wood}  label="Wood" />
          <InventoryBadge icon="🪨" amount={stone} label="Stone" />
          <InventoryBadge icon="🫐" amount={food}  label="Food" />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #333', paddingTop: 8, marginTop: 8 }}>
        <div style={{ fontSize: 10, color: '#888' }}>
          📍 x{character.position.x}, y{character.position.y}
        </div>
        <div style={{ fontSize: 10, color: '#aaaaff', marginTop: 4 }}>
          ⚡ {character.currentIntentLabel}
        </div>
      </div>
    </div>
  );
}

function InventoryBadge({ icon, amount, label }: { icon: string; amount: number; label: string }) {
  return (
    <div title={label} style={{
      background: '#1a2a1a',
      border: '1px solid #334433',
      borderRadius: 6,
      padding: '4px 8px',
      fontSize: 11,
      color: amount > 0 ? '#cceecc' : '#555',
      textAlign: 'center',
      minWidth: 40,
    }}>
      <div>{icon}</div>
      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{amount}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #2a3a2a',
  borderRadius: 8,
  padding: '12px 14px',
  width: 200,
  flexShrink: 0,
};
