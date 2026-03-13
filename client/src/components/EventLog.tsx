import React, { useRef, useEffect } from 'react';
import type { GameEvent } from '../types';

interface Props {
  events: GameEvent[];
}

const EVENT_ICONS: Record<string, string> = {
  action:    '⚙️',
  thought:   '💭',
  chat_in:   '💬',
  chat_out:  '🗣️',
  system:    '📋',
  build:     '🔨',
  invention: '💡',
  npc:       '👥',
};

const EVENT_COLORS: Record<string, string> = {
  action:   '#8899aa',
  thought:  '#bb88ee',
  chat_in:  '#aaddff',
  chat_out: '#aaffcc',
  system:   '#888888',
  build:    '#ffcc66',
};

export function EventLog({ events }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events]);

  return (
    <div style={{
      background: '#111',
      border: '1px solid #2a3a2a',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '6px 12px',
        background: '#1a1a1a',
        borderBottom: '1px solid #2a3a2a',
        fontSize: 11,
        color: '#668866',
        fontWeight: 'bold',
      }}>
        📋 Журнал событий
      </div>
      <div ref={scrollRef} style={{
        height: 120,
        overflowY: 'auto',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
      }}>
        {events.slice(-30).map(event => (
          <div
            key={event.id}
            style={{
              fontSize: 10,
              color: EVENT_COLORS[event.type] ?? '#888',
              lineHeight: 1.4,
              display: 'flex',
              gap: 5,
            }}
          >
            <span style={{ flexShrink: 0, opacity: 0.7 }}>
              {EVENT_ICONS[event.type] ?? '•'}
            </span>
            <span style={{ opacity: 0.8 }}>
              [t{event.tick}]
            </span>
            <span>{event.message}</span>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{ color: '#444', fontSize: 10, fontStyle: 'italic' }}>
            No events yet...
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
