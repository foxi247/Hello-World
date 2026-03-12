import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  connected: boolean;
  onSend: (text: string) => void;
}

export function Chat({ messages, connected, onSend }: Props) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || !connected || sending) return;
    setSending(true);
    onSend(text);
    setInput('');
    // Allow sending again after a moment
    setTimeout(() => setSending(false), 1500);
  }, [input, connected, sending, onSend]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      background: '#141414',
      border: '1px solid #2a3a2a',
      borderRadius: 8,
      overflow: 'hidden',
      flex: 1,
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        background: '#1e2e1e',
        borderBottom: '1px solid #2a3a2a',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: '#88cc88', fontWeight: 'bold' }}>
          💬 Speak to Alder
        </span>
        <span style={{
          marginLeft: 'auto',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: connected ? '#44cc44' : '#cc4444',
          display: 'inline-block',
          boxShadow: connected ? '0 0 6px #44cc44' : 'none',
        }} />
        <span style={{ fontSize: 10, color: connected ? '#44cc44' : '#cc4444' }}>
          {connected ? 'connected' : 'connecting...'}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {messages.length === 0 && (
          <div style={{
            color: '#555',
            fontSize: 11,
            textAlign: 'center',
            marginTop: 20,
            lineHeight: 1.6,
          }}>
            Alder is going about his day.<br />
            Say something to get his attention.
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 10px',
        borderTop: '1px solid #2a3a2a',
        display: 'flex',
        gap: 8,
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Say something..."
          disabled={!connected}
          rows={2}
          style={{
            flex: 1,
            background: '#1a2a1a',
            border: '1px solid #334433',
            borderRadius: 6,
            color: '#ddeedd',
            padding: '6px 10px',
            fontSize: 12,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!connected || !input.trim() || sending}
          style={{
            background: connected && input.trim() ? '#2a5a2a' : '#1a2a1a',
            border: '1px solid #334433',
            borderRadius: 6,
            color: connected && input.trim() ? '#88ee88' : '#444',
            padding: '6px 12px',
            cursor: connected && input.trim() && !sending ? 'pointer' : 'not-allowed',
            fontSize: 14,
            transition: 'all 0.2s',
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        fontSize: 9,
        color: '#555',
        marginBottom: 2,
        paddingLeft: isUser ? 0 : 4,
        paddingRight: isUser ? 4 : 0,
      }}>
        {isUser ? 'You' : 'Alder'} · {time}
      </div>
      <div style={{
        maxWidth: '85%',
        background: isUser ? '#1a3a5a' : '#1e3e1e',
        border: `1px solid ${isUser ? '#2a5a8a' : '#2a5a2a'}`,
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        padding: '7px 11px',
        fontSize: 12,
        color: isUser ? '#aaccee' : '#aaccaa',
        lineHeight: 1.5,
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  );
}
