import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'https://api.fratgpt.co';

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
  const [error, setError] = useState('');

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

    // Listen for storage changes (token updates from website)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.fratgpt_token) {
        if (changes.fratgpt_token.newValue) {
          setToken(changes.fratgpt_token.newValue);
        } else {
          setToken(null);
        }
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
      <div className="auth-container" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '32px',
        textAlign: 'center'
      }}>
        <div className="logo" style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px' }}>
          FratGPT 2.0
        </div>

        <div style={{
          fontSize: '48px',
          marginBottom: '24px',
          filter: 'grayscale(0.3)'
        }}>
          🔒
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>
          Not Logged In
        </h2>

        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '300px', lineHeight: '1.5' }}>
          Please log in or sign up on the FratGPT website to use the extension
        </p>

        <button
          onClick={() => window.open('https://fratgpt.co/login', '_blank')}
          className="btn"
          style={{
            background: 'linear-gradient(to right, #f97316, #eab308)',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            fontSize: '15px',
            fontWeight: '600',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: '12px'
          }}
        >
          Log In on Website
        </button>

        <button
          onClick={() => window.open('https://fratgpt.co/signup', '_blank')}
          className="btn"
          style={{
            background: 'transparent',
            color: '#f97316',
            border: '2px solid #f97316',
            padding: '10px 24px',
            fontSize: '15px',
            fontWeight: '600',
            borderRadius: '8px',
            cursor: 'pointer'
          }}
        >
          Sign Up on Website
        </button>

        <p style={{ marginTop: '24px', fontSize: '12px', color: '#9ca3af', maxWidth: '280px', lineHeight: '1.4' }}>
          The extension will automatically sync with your website login
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
