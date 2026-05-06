import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

// ── Suggested prompts ─────────────────────────────────────────────────────────
const SUGGESTED = [
  { icon: '🤒', text: 'I have a headache for 3 days', sub: 'Symptom guidance' },
  { icon: '🩸', text: 'What are symptoms of diabetes?', sub: 'Disease info' },
  { icon: '😴', text: 'I feel very tired all the time', sub: 'Fatigue causes' },
  { icon: '💊', text: 'Is it safe to take ibuprofen daily?', sub: 'Medication advice' },
];

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="message-wrapper">
      <div className="msg-avatar ai-av">🩺</div>
      <div className="msg-content">
        <div className="msg-bubble ai">
          <div className="typing-bubble">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Single message ────────────────────────────────────────────────────────────
function Message({ msg, userInitial }) {
  const isUser = msg.role === 'user';
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`message-wrapper ${isUser ? 'user' : ''}`}>
      <div className={`msg-avatar ${isUser ? 'user-av' : 'ai-av'}`}>
        {isUser ? userInitial : '🩺'}
      </div>
      <div className="msg-content">
        <div className={`msg-bubble ${isUser ? 'user' : 'ai'}`}>
          {msg.text}
        </div>
        <span className="msg-time">{time}</span>
      </div>
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen({ user, onChipClick }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-icon">🩺</div>
      <h2>Hello{user?.email ? `, ${user.email.split('@')[0]}` : ''}!</h2>
      <p>
        Ask me anything about your health. I'll give you clear, personalised guidance
        based on your profile.
      </p>

      <div className="welcome-chips">
        {SUGGESTED.map((s, i) => (
          <div className="welcome-chip" key={i} onClick={() => onChipClick(s.text)}>
            <span className="chip-icon">{s.icon}</span>
            <span className="chip-text">{s.text}</span>
            <span className="chip-sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <p className="welcome-disclaimer">
        ⚠️ MediChat AI provides general information only and is not a substitute for professional
        medical advice. Always consult a qualified doctor.
      </p>
    </div>
  );
}

// ── Chat sessions helper ──────────────────────────────────────────────────────
function newSession() {
  return { id: Date.now(), title: 'New chat', messages: [] };
}

// ── Main Chat Page ────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { user, logout, apiCall } = useAuth();
  const navigate = useNavigate();

  const [sessions, setSessions]       = useState([newSession()]);
  const [activeId, setActiveId]       = useState(sessions[0].id);
  const [input, setInput]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const bottomRef  = useRef(null);
  const textareaRef = useRef(null);

  const activeSession = sessions.find((s) => s.id === activeId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [input]);

  const updateSession = (id, updater) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? updater(s) : s))
    );
  };

  const sendMessage = useCallback(async (text) => {
    const msg = text || input;
    if (!msg.trim() || loading) return;
    setInput('');

    const userMsg = { role: 'user', text: msg.trim(), timestamp: new Date().toISOString() };

    // If this is the first message, use it as the session title
    updateSession(activeId, (s) => ({
      ...s,
      title: s.messages.length === 0 ? msg.slice(0, 40) : s.title,
      messages: [...s.messages, userMsg],
    }));

    setLoading(true);
    try {
      const data = await apiCall('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: msg.trim() }),
      });

      const aiMsg = {
        role: 'assistant',
        text: data.response,
        timestamp: data.timestamp,
      };

      updateSession(activeId, (s) => ({
        ...s,
        messages: [...s.messages, aiMsg],
      }));
    } catch (err) {
      const errMsg = {
        role: 'assistant',
        text: `⚠️ Something went wrong: ${err.message}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      updateSession(activeId, (s) => ({
        ...s,
        messages: [...s.messages, errMsg],
      }));
    } finally {
      setLoading(false);
    }
  }, [input, loading, activeId, apiCall]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    const session = newSession();
    setSessions((prev) => [session, ...prev]);
    setActiveId(session.id);
  };

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const userInitial = user?.email?.[0]?.toUpperCase() || '?';
  const messages    = activeSession?.messages || [];
  const canSend     = input.trim().length > 0 && !loading;

  return (
    <div className="chat-page">
      {/* ── Sidebar ── */}
      <div className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="s-logo">🩺</div>
            <span className="s-name">MediChat AI</span>
          </div>
          <button className="btn-new-chat" onClick={startNewChat}>
            ＋ New Chat
          </button>
        </div>

        <div className="sidebar-history">
          {sessions.length > 0 && (
            <>
              <div className="history-label">Recent</div>
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={`history-item ${s.id === activeId ? 'active' : ''}`}
                  onClick={() => setActiveId(s.id)}
                >
                  <span className="h-icon">💬</span>
                  <span className="h-text">{s.title}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{userInitial}</div>
            <div className="user-info">
              <div className="user-name">{user?.email}</div>
              <div className="user-meta">
                {user?.age ? `${user.age}y` : ''}{user?.gender ? ` · ${user.gender}` : ''}{user?.weight ? ` · ${user.weight}kg` : ''}
              </div>
            </div>
            <button className="btn-logout" onClick={handleLogout} title="Log out">⎋</button>
          </div>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="chat-main">
        {/* Topbar */}
        <div className="chat-topbar">
          <button className="btn-toggle-sidebar" onClick={() => setSidebarOpen((v) => !v)} title="Toggle sidebar">
            ☰
          </button>
          <span className="topbar-title">
            {activeSession?.title === 'New chat' ? 'MediChat AI' : activeSession?.title}
          </span>
          <div className="topbar-badge">
            <div className="dot" />
            AI Online
          </div>
        </div>

        {/* Messages */}
        <div className="messages-area">
          {messages.length === 0 ? (
            <WelcomeScreen user={user} onChipClick={(text) => sendMessage(text)} />
          ) : (
            <>
              {messages.map((m, i) => (
                <Message key={i} msg={m} userInitial={userInitial} />
              ))}
              {loading && <TypingIndicator />}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="input-area">
          <div className="input-box">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask a medical question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <button className="btn-send" onClick={() => sendMessage()} disabled={!canSend} title="Send">
              ➤
            </button>
          </div>
          <p className="input-disclaimer">
            MediChat AI provides general information only — not a substitute for professional medical advice.
          </p>
        </div>
      </div>
    </div>
  );
}
