import React, { useState, useEffect } from 'react';

interface Props {
  thought: string;
  characterName: string;
}

export function ThoughtBubble({ thought, characterName }: Props) {
  const [visible, setVisible] = useState(false);
  const [displayedThought, setDisplayedThought] = useState('');

  useEffect(() => {
    if (!thought) return;
    setDisplayedThought(thought);
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(timer);
  }, [thought]);

  return (
    <div style={{
      background: visible ? '#1a2a1a' : '#111',
      border: `1px solid ${visible ? '#3a6a3a' : '#222'}`,
      borderRadius: 8,
      padding: '8px 14px',
      minHeight: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      transition: 'all 0.4s ease',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, opacity: visible ? 1 : 0.3 }}>
        💭
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: '#557755', marginBottom: 3 }}>
          Мысли {characterName}а
        </div>
        <div style={{
          fontSize: 12,
          color: visible ? '#cceecc' : '#444',
          fontStyle: 'italic',
          lineHeight: 1.5,
          transition: 'color 0.4s ease',
          minHeight: 18,
        }}>
          {visible ? `"${displayedThought}"` : '...'}
        </div>
      </div>
    </div>
  );
}
