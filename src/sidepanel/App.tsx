import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'https://api.fratgpt.co';

type Mode = 'REGULAR' | 'FAST' | 'EXPERT';
type Tab = 'consensus' | 'gemini' | 'openai' | 'claude';

// V2 types (mirroring backend types.ts)
type AnswerType = 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_IN_THE_BLANK' | 'SHORT_ANSWER' | 'CODING' | 'UNKNOWN';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string; // V1 fallback, may also be debug_raw_answer from V2
  shortAnswer?: string; // V1 fallback
  // steps?: string[]; // Deprecated/Removed
  provider?: string;
  attachments?: Array<{ imageData?: string; source: string }>;
  metadata?: { error?: string };
  providers?: Array<{
    provider: string;
    response: { shortAnswer: string; steps?: string[] };
  }>;
  
  // V2 Structured Data
  type?: AnswerType;
  contentV2?: { // Renamed to avoid conflict with content: string
    choice?: string;
    value?: boolean;
    text?: string;
    code?: string;
  };
  debug_raw_answer?: string;
}

interface ChatSession {
  id: string;
  mode: Mode;
  messages: Message[];
}

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [userPlan, setUserPlan] = useState<'FREE' | 'BASIC' | 'PRO' | null>(null);
  const [userRole, setUserRole] = useState<'USER' | 'ADMIN' | null>(null);

  const [mode, setMode] = useState<Mode>('REGULAR');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedTab, setSelectedTab] = useState<Tab>('gemini');
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  
  // Removed replyContext state since steps replies are gone
  
  const [responseTime, setResponseTime] = useState<number | null>(null); // Timer for response time
  const [v2Enabled, setV2Enabled] = useState<boolean>(false); // V2 Feature Flag

  const chatRef = useRef<HTMLDivElement>(null);
  const requestStartTime = useRef<number | null>(null); // Track when request started

  // Log mode changes
  useEffect(() => {
    console.log('[SIDEPANEL] 🔄 MODE CHANGED:', mode);
    console.log('[SIDEPANEL] 📊 Current sending state:', sending);
    console.log('[SIDEPANEL] 💼 Current session:', session?.id || 'none');
  }, [mode]);

  // Log sending state changes
  useEffect(() => {
    console.log('[SIDEPANEL] 🔄 SENDING STATE CHANGED:', sending);
    console.log('[SIDEPANEL] 🎯 Current mode:', mode);
    console.log('[SIDEPANEL] 💼 Current session:', session?.id || 'none');
    console.log('[SIDEPANEL] 🚦 Mode buttons should be:', sending ? 'DISABLED' : 'ENABLED');
  }, [sending]);

  useEffect(() => {
    // Load token and v2Enabled flag from storage
    chrome.storage.sync.get(['fratgpt_token', 'v2Enabled'], (result) => {
      if (result.fratgpt_token) {
        setToken(result.fratgpt_token);
      }
      if (typeof result.v2Enabled === 'boolean') {
        setV2Enabled(result.v2Enabled);
      }
    });

    // Listen for storage changes (token updates from website, v2Enabled toggle)
    const storageListener = (changes: any, namespace: string) => {
      if (namespace === 'sync' && changes.fratgpt_token) {
        if (changes.fratgpt_token.newValue) {
          setToken(changes.fratgpt_token.newValue);
        } else {
          setToken(null);
        }
      }
      if (namespace === 'sync' && changes.v2Enabled) {
        if (typeof changes.v2Enabled.newValue === 'boolean') {
          setV2Enabled(changes.v2Enabled.newValue);
        }
      }
    };

    chrome.storage.onChanged.addListener(storageListener);
  }, []);

  // Fetch user plan and role when token is available
  useEffect(() => {
    if (!token) {
      setUserPlan(null);
      setUserRole(null);
      return;
    }

    fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUserPlan(data.user.plan);
          setUserRole(data.user.role);
        }
      })
      .catch(err => {
        console.error('[SIDEPANEL] ❌ Failed to fetch user info:', err);
      });
  }, [token]);

  // Listen for snip completion
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'SNIP_COMPLETE') {
        handleSnipComplete(message.coords);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [token, mode, session]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [session?.messages, optimisticMessages]);

  const handleScreen = async () => {
    try {
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, resolve);
      });

      if (response.error) {
        alert('Failed to capture screen: ' + response.error);
        return;
      }

      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: 'USER',
        content: input || 'Solve this problem',
        attachments: [{
          imageData: response.imageData,
          source: 'SCREEN'
        }]
      };

      const thinkingMessage: Message = {
        id: `temp-thinking-${Date.now()}`,
        role: 'ASSISTANT',
        content: 'Thinking...',
      };

      setOptimisticMessages([userMessage, thinkingMessage]);
      setInput('');

      await sendMessage(input || 'Solve this problem', response.imageData, 'SCREEN');
    } catch (error) {
      console.error('[SCREEN] ❌ ERROR:', error);
      alert('Failed to capture screen');
      setOptimisticMessages([]);
    }
  };

  const handleSnip = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        alert('Failed to start snip mode: No active tab');
        return;
      }

      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        alert('Cannot use snip mode on this page. Please try on a regular website.');
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: 'START_SNIP' }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['content.js']
          }, () => {
            const injectionError = chrome.runtime.lastError;
            if (injectionError) {
              alert('Failed to start snip mode: Could not inject content script. Error: ' + injectionError.message);
            } else {
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id!, { type: 'START_SNIP' }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    alert('Failed to start snip mode even after injection: ' + chrome.runtime.lastError.message);
                  }
                });
              }, 100);
            }
          });
        }
      });
    } catch (error: any) {
      alert('Failed to start snip mode: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleSnipComplete = async (coords: any) => {
    try {
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SNIP', coords }, (response) => {
          resolve(response);
        });
      });

      if (response.error) {
        alert('Failed to capture snip: ' + response.error);
        return;
      }

      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: 'USER',
        content: input || 'Solve this problem',
        attachments: [{
          imageData: response.imageData,
          source: 'SNIP'
        }]
      };

      const thinkingMessage: Message = {
        id: `temp-thinking-${Date.now()}`,
        role: 'ASSISTANT',
        content: 'Thinking...',
      };

      setOptimisticMessages([userMessage, thinkingMessage]);
      setInput('');

      await sendMessage(input || 'Solve this problem', response.imageData, 'SNIP');
    } catch (error: any) {
      alert('Failed to capture snip: ' + (error?.message || 'Unknown error'));
      setOptimisticMessages([]);
    }
  };

  const sendMessage = async (text: string, imageData?: string, captureSource?: string) => {
    setSending(true);
    setError('');

    try {
      const isNewCapture = !!imageData;

      const url = isNewCapture
        ? `${API_URL}/chat/start`
        : (session
            ? `${API_URL}/chat/${session.id}/message`
            : `${API_URL}/chat/start`);

      const body: any = {
        message: text,
      };

      const shouldIncludeMode = !session || isNewCapture;
      if (shouldIncludeMode) {
        body.mode = mode;
      }

      if (imageData) {
        body.imageData = imageData;
        body.captureSource = captureSource;
      }

      // Add V2 feature flag to request body
      body.v2 = v2Enabled;

      requestStartTime.current = Date.now();

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
      
      if (requestStartTime.current) {
        const elapsedTime = (Date.now() - requestStartTime.current) / 1000;
        setResponseTime(elapsedTime);
        requestStartTime.current = null;
      }

      setOptimisticMessages([]);
      setSession(data);
      setInput('');
    } catch (err: any) {
      setError(err.message);
      setOptimisticMessages([]);
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

  const handleV2Toggle = () => {
    const newState = !v2Enabled;
    setV2Enabled(newState);
    chrome.storage.sync.set({ v2Enabled: newState });
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
        {/* Login screen content unchanged */}
        <div className="logo" style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '24px' }}>FratGPT 2.0</div>
        <div style={{ fontSize: '48px', marginBottom: '24px', filter: 'grayscale(0.3)' }}>🔒</div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '12px', color: '#111827' }}>Not Logged In</h2>
        <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px', maxWidth: '300px', lineHeight: '1.5' }}>Please log in or sign up on the FratGPT website to use the extension</p>
        <button onClick={() => window.open('https://fratgpt.co/login', '_blank')} className="btn" style={{ background: 'linear-gradient(to right, #f97316, #eab308)', color: 'white', border: 'none', padding: '12px 24px', fontSize: '15px', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', marginBottom: '12px' }}>Log In on Website</button>
        <button onClick={() => window.open('https://fratgpt.co/signup', '_blank')} className="btn" style={{ background: 'transparent', color: '#f97316', border: '2px solid #f97316', padding: '10px 24px', fontSize: '15px', fontWeight: '600', borderRadius: '8px', cursor: 'pointer' }}>Sign Up on Website</button>
        <p style={{ marginTop: '24px', fontSize: '12px', color: '#9ca3af', maxWidth: '280px', lineHeight: '1.4' }}>The extension will automatically sync with your website login</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="logo">FratGPT 2.0</div>

        <div className="mode-selector">
          <button className={`mode-btn ${mode === 'FAST' ? 'active' : ''}`} onClick={() => setMode('FAST')} disabled={sending}>Fast</button>
          <button className={`mode-btn ${mode === 'REGULAR' ? 'active' : ''}`} onClick={() => setMode('REGULAR')} disabled={sending}>Regular</button>
          <button className={`mode-btn ${mode === 'EXPERT' ? 'active' : ''}`} onClick={() => setMode('EXPERT')} disabled={sending || (userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN')} title={userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN' ? 'Expert mode is only available for PRO subscribers' : ''}>Expert {userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN' && '🔒'}</button>
        </div>

        {/* V2 Feature Toggle */}
        <div className="v2-toggle">
          <label className="switch">
            <input type="checkbox" checked={v2Enabled} onChange={handleV2Toggle} />
            <span className="slider round"></span>
          </label>
          <span className="v2-label">Beta UI</span>
        </div>

        <div className="action-buttons">
          <button className="btn" onClick={handleScreen} disabled={sending}>📸 Screen</button>
          <button className="btn" onClick={handleSnip} disabled={sending}>✂️ Snip</button>
        </div>
      </div>

      <div className="chat-container" ref={chatRef}>
        {error && <div className="error">{error}</div>}

        {!session && optimisticMessages.length === 0 && (
          <div className="empty-state">
            <h3>Welcome to FratGPT!</h3>
            <p>Select a mode and start solving homework</p>
          </div>
        )}

        {/* Render real messages from session */}
        {session?.messages.map((msg, idx) => {
          // Skip individual provider messages in Expert/Regular mode
          if ((session.mode === 'EXPERT' || session.mode === 'REGULAR') && msg.role === 'ASSISTANT') {
            const firstAssistantMsg = session.messages.find(m => m.role === 'ASSISTANT');
            if (msg.id !== firstAssistantMsg?.id) return null;
          }

          return (
            <div key={idx} className={`message ${msg.role.toLowerCase()}`}>
              {msg.attachments?.map((att, i) => (
                <img key={i} src={att.imageData} className="message-image" alt="attachment" />
              ))}

              {/* EXPERT / REGULAR MODE TABS */}
              {msg.role === 'ASSISTANT' && (session.mode === 'EXPERT' || session.mode === 'REGULAR') && (() => {
                const assistantMessages = session.messages.filter(m => m.role === 'ASSISTANT');
                const isLatestAssistant = assistantMessages[assistantMessages.length - 1]?.id === msg.id;

                return (
              <div className="answer-box" style={{ maxWidth: '100%' }}>
                {isLatestAssistant && responseTime !== null && (
                  <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '500', marginBottom: '12px', padding: '6px 12px', backgroundColor: '#ecfdf5', borderRadius: '6px', display: 'inline-block' }}>⏱️ Time to answer: {responseTime.toFixed(1)}s</div>
                )}

                <div className="tabs">
                  <button className={`tab ${selectedTab === 'gemini' ? 'active' : ''}`} onClick={() => setSelectedTab('gemini')}>Gemini</button>
                  <button className={`tab ${selectedTab === 'openai' ? 'active' : ''}`} onClick={() => setSelectedTab('openai')}>ChatGPT</button>
                  <button className={`tab ${selectedTab === 'claude' ? 'active' : ''}`} onClick={() => setSelectedTab('claude')}>Claude</button>
                </div>

                {(() => {
                  const providerMsg = session.messages.find(
                    (m) => m.provider?.toLowerCase() === selectedTab.toLowerCase() && m.role === 'ASSISTANT'
                  );

                  return providerMsg ? (
                    <>
                      <div className="answer-label">Answer from {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)}</div>
                      {(providerMsg as any).metadata?.error ? (
                        <div style={{ padding: '20px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b' }}>
                          <strong>Error from {selectedTab}:</strong>
                          <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '12px' }}>{(providerMsg as any).metadata.error}</pre>
                        </div>
                      ) : (
                        <>
                          <div className="short-answer">{providerMsg.shortAnswer}</div>
                          {/* Steps removed from here */}
                          <div className="explanation">{providerMsg.content}</div>
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>No response from this provider</div>
                  );
                })()}
              </div>
                );
              })()}

            {/* FAST MODE ANSWER */}
            {msg.role === 'ASSISTANT' && session.mode !== 'EXPERT' && session.mode !== 'REGULAR' && (() => {
              const assistantMessages = session.messages.filter(m => m.role === 'ASSISTANT');
              const isLatestAssistant = assistantMessages[assistantMessages.length - 1]?.id === msg.id;
              const isV2Response = v2Enabled && msg.type && msg.contentV2;

              return (
                <div className="answer-box">
                  {isLatestAssistant && responseTime !== null && (
                    <div style={{ fontSize: '12px', color: '#10b981', fontWeight: '500', marginTop: '8px', padding: '6px 12px', backgroundColor: '#ecfdf5', borderRadius: '6px', display: 'inline-block' }}>⏱️ Time to answer: {responseTime.toFixed(1)}s</div>
                  )}

                  {isV2Response && msg.type && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', marginBottom: '8px', display: 'inline-block', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#e0f2f7' }}>Type: {msg.type}</div>
                  )}

                  {isV2Response ? (
                    <V2AnswerRenderer message={msg} />
                  ) : (
                    <>
                      <div className="answer-label">Final Answer</div>
                      <div className="short-answer">{msg.shortAnswer}</div>
                      <div className="explanation">{msg.content}</div>
                    </>
                  )}
                </div>
              );
            })()}
            </div>
          );
        })}

        {optimisticMessages.map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role.toLowerCase()}`}>
            {msg.attachments?.map((att, i) => (
              <div key={i}>
                <img src={att.imageData} className="message-image" alt="attachment" />
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>Method: {att.source}</div>
              </div>
            ))}
            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}
      </div>

      <div className="input-container">
        <div className="input-box">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask a follow-up question..." rows={2} disabled={sending} />
          <button className="send-btn" onClick={handleSend} disabled={sending || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

// =========================================================================================================
// V2 Answer Renderer Component (NO STEPS)
// =========================================================================================================

interface V2AnswerRendererProps {
  message: Message;
}

const V2AnswerRenderer: React.FC<V2AnswerRendererProps> = ({ message }) => {
  if (!message.type || !message.contentV2) {
    return <div className="answer-box">Error: Invalid V2 response format.</div>;
  }

  switch (message.type) {
    case 'MULTIPLE_CHOICE':
      return (
        <div className="answer-box multiple-choice">
          <div className="answer-header">Multiple Choice Answer</div>
          <div className="mc-choice">{message.contentV2.choice}</div>
          <div className="short-answer">{message.debug_raw_answer || `Choice: ${message.contentV2.choice}`}</div>
        </div>
      );
    case 'TRUE_FALSE':
      return (
        <div className="answer-box true-false">
          <div className="answer-header">True/False Answer</div>
          <div className={`tf-value ${message.contentV2.value ? 'true' : 'false'}`}>
            {message.contentV2.value ? 'TRUE' : 'FALSE'}
          </div>
          <div className="short-answer">{message.debug_raw_answer || `Value: ${String(message.contentV2.value).toUpperCase()}`}</div>
        </div>
      );
    case 'FILL_IN_THE_BLANK':
      return (
        <div className="answer-box fill-blank">
          <div className="answer-header">Fill-in-the-Blank Answer</div>
          <div className="fill-blank-text">{message.contentV2.text}</div>
          <div className="short-answer">{message.debug_raw_answer || `Answer: ${message.contentV2.text}`}</div>
        </div>
      );
    case 'SHORT_ANSWER':
      return (
        <div className="answer-box short-answer-type">
          <div className="answer-header">Short Answer</div>
          <div className="short-answer-text">{message.contentV2.text}</div>
          <div className="short-answer">{message.debug_raw_answer || `Answer: ${message.contentV2.text}`}</div>
        </div>
      );
    case 'CODING':
      return (
        <div className="answer-box coding-answer">
          <div className="answer-header">Code Answer</div>
          <pre className="code-block">{message.contentV2.code}</pre>
          <div className="short-answer">{message.debug_raw_answer || 'Code provided'}</div>
        </div>
      );
    case 'UNKNOWN':
    default:
      return (
        <div className="answer-box unknown-type">
          <div className="answer-header">Answer (Unknown Type)</div>
          <div className="short-answer">{message.debug_raw_answer || message.shortAnswer || message.content}</div>
        </div>
      );
  }
};

export default App;