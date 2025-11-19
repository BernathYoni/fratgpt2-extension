import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:3000'; // Update this for production

type Mode = 'REGULAR' | 'FAST' | 'EXPERT';
type Tab = 'consensus' | 'gemini' | 'openai' | 'claude';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  shortAnswer?: string;
  provider?: string;
  attachments?: Array<{ imageData?: string; source: string }>;
  providers?: Array<{
    provider: string;
    response: { shortAnswer: string; explanation: string };
  }>;
}

interface ChatSession {
  id: string;
  mode: Mode;
  messages: Message[];
}

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<Mode>('REGULAR');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedTab, setSelectedTab] = useState<Tab>('consensus');

  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load token from storage
    chrome.storage.sync.get(['fratgpt_token'], (result) => {
      if (result.fratgpt_token) {
        setToken(result.fratgpt_token);
      }
    });

    // Listen for snip completion
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SNIP_COMPLETE') {
        handleSnipComplete(message.coords);
      }
    });
  }, []);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [session?.messages]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Login failed');
      }

      const data = await res.json();
      setToken(data.token);
      chrome.storage.sync.set({ fratgpt_token: data.token });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleScreen = async () => {
    try {
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, resolve);
      });

      if (response.error) {
        alert('Failed to capture screen: ' + response.error);
        return;
      }

      setInput((prev) => prev || 'Solve this problem');
      await sendMessage(input || 'Solve this problem', response.imageData, 'SCREEN');
    } catch (error) {
      alert('Failed to capture screen');
    }
  };

  const handleSnip = async () => {
    try {
      // Start snip mode in content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) return;

      await chrome.tabs.sendMessage(tab.id, { type: 'START_SNIP' });
    } catch (error) {
      alert('Failed to start snip mode');
    }
  };

  const handleSnipComplete = async (coords: any) => {
    try {
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SNIP', coords }, resolve);
      });

      if (response.error) {
        alert('Failed to capture snip: ' + response.error);
        return;
      }

      setInput((prev) => prev || 'Solve this problem');
      await sendMessage(input || 'Solve this problem', response.imageData, 'SNIP');
    } catch (error) {
      alert('Failed to capture snip');
    }
  };

  const sendMessage = async (text: string, imageData?: string, captureSource?: string) => {
    if (!text.trim() && !imageData) return;
    if (!token) return;

    setSending(true);
    setError('');

    try {
      const url = session
        ? `${API_URL}/chat/${session.id}/message`
        : `${API_URL}/chat/start`;

      const body: any = {
        message: text,
      };

      if (!session) {
        body.mode = mode;
      }

      if (imageData) {
        body.imageData = imageData;
        body.captureSource = captureSource;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.code === 'DAILY_LIMIT_REACHED') {
          setError(`Daily limit reached! Upgrade to ${error.plan === 'FREE' ? 'Basic or Pro' : 'Pro'} for more solves.`);
        } else {
          throw new Error(error.error || 'Request failed');
        }
        return;
      }

      const data = await res.json();
      setSession(data);
      setInput('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!token) {
    return (
      <div className="auth-container">
        <div className="logo" style={{ marginBottom: '24px' }}>FratGPT 2.0</div>
        <form className="auth-form" onSubmit={handleLogin}>
          {error && <div className="error">{error}</div>}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="btn"
            disabled={loading}
            style={{ background: '#2563eb', color: 'white', border: 'none' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p style={{ marginTop: '16px', fontSize: '13px', color: '#6b7280' }}>
          No account? <a href="#" style={{ color: '#2563eb' }}>Sign up on web</a>
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="logo">FratGPT 2.0</div>

        <div className="mode-selector">
          <button
            className={`mode-btn ${mode === 'FAST' ? 'active' : ''}`}
            onClick={() => setMode('FAST')}
            disabled={!!session}
          >
            Fast
          </button>
          <button
            className={`mode-btn ${mode === 'REGULAR' ? 'active' : ''}`}
            onClick={() => setMode('REGULAR')}
            disabled={!!session}
          >
            Regular
          </button>
          <button
            className={`mode-btn ${mode === 'EXPERT' ? 'active' : ''}`}
            onClick={() => setMode('EXPERT')}
            disabled={!!session}
          >
            Expert
          </button>
        </div>

        <div className="action-buttons">
          <button className="btn" onClick={handleScreen} disabled={sending}>
            📸 Screen
          </button>
          <button className="btn" onClick={handleSnip} disabled={sending}>
            ✂️ Snip
          </button>
        </div>
      </div>

      <div className="chat-container" ref={chatRef}>
        {error && <div className="error">{error}</div>}

        {!session && (
          <div className="empty-state">
            <h3>Welcome to FratGPT!</h3>
            <p>Select a mode and start solving homework</p>
          </div>
        )}

        {session?.messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role.toLowerCase()}`}>
            {msg.attachments?.map((att, i) => (
              <img key={i} src={att.imageData} className="message-image" alt="attachment" />
            ))}

            <div className="message-bubble">{msg.content}</div>

            {msg.role === 'ASSISTANT' && session.mode === 'EXPERT' && msg.provider === 'CONSENSUS' && (
              <div className="answer-box" style={{ maxWidth: '100%' }}>
                <div className="tabs">
                  <button
                    className={`tab ${selectedTab === 'consensus' ? 'active' : ''}`}
                    onClick={() => setSelectedTab('consensus')}
                  >
                    Consensus
                  </button>
                  <button
                    className={`tab ${selectedTab === 'gemini' ? 'active' : ''}`}
                    onClick={() => setSelectedTab('gemini')}
                  >
                    Gemini
                  </button>
                  <button
                    className={`tab ${selectedTab === 'openai' ? 'active' : ''}`}
                    onClick={() => setSelectedTab('openai')}
                  >
                    ChatGPT
                  </button>
                  <button
                    className={`tab ${selectedTab === 'claude' ? 'active' : ''}`}
                    onClick={() => setSelectedTab('claude')}
                  >
                    Claude
                  </button>
                </div>

                {selectedTab === 'consensus' && (
                  <>
                    <div className="answer-label">Final Answer</div>
                    <div className="short-answer">{msg.shortAnswer}</div>
                    <div className="explanation">{msg.content}</div>
                  </>
                )}

                {selectedTab !== 'consensus' && (() => {
                  const providerMsg = session.messages.find(
                    (m) => m.provider?.toLowerCase() === selectedTab.toLowerCase() && m.role === 'ASSISTANT'
                  );
                  return providerMsg ? (
                    <>
                      <div className="answer-label">Answer from {selectedTab}</div>
                      <div className="short-answer">{providerMsg.shortAnswer}</div>
                      <div className="explanation">{providerMsg.content}</div>
                    </>
                  ) : (
                    <div>No response from this provider</div>
                  );
                })()}
              </div>
            )}

            {msg.role === 'ASSISTANT' && session.mode !== 'EXPERT' && msg.shortAnswer && (
              <div className="answer-box">
                <div className="answer-label">Final Answer</div>
                <div className="short-answer">{msg.shortAnswer}</div>
                <div className="explanation">{msg.content}</div>
              </div>
            )}
          </div>
        ))}

        {sending && <div className="loading">Thinking...</div>}
      </div>

      <div className="input-container">
        <div className="input-box">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            rows={2}
            disabled={sending}
          />
          <button className="send-btn" onClick={handleSend} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
