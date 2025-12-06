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
  steps?: string[];
  provider?: string;
  attachments?: Array<{ imageData?: string; source: string }>;
  metadata?: { error?: string };
  providers?: Array<{
    provider: string;
    response: { shortAnswer: string; steps: string[] };
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
  const [replyContext, setReplyContext] = useState<{
    messageId: string;
    stepIndex: number;
    stepText: string;
  } | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null); // Timer for response time
  const [v2Enabled, setV2Enabled] = useState<boolean>(false); // V2 Feature Flag

  const chatRef = useRef<HTMLDivElement>(null);
  const requestStartTime = useRef<number | null>(null); // Track when request started

  // Helper function to parse steps from message content
  const parseSteps = (msg: Message): string[] => {
    // Prefer V2 steps if available
    if (msg.steps && msg.steps.length > 0) {
      return msg.steps;
    }
    // Fallback to V1 content parsing if V2 steps are not present but V1-like content is
    try {
      // NOTE: This assumes msg.content might contain a V1-like JSON.
      // If V2 is enabled, msg.content will actually contain debug_raw_answer from the backend.
      // We should really be checking msg.shortAnswer for V1 fallback.
      if (!msg.type && msg.shortAnswer) { // Check if it's a V1 message
        return msg.steps || [];
      }

      // If it's V2 but steps are empty, ensure it returns empty.
      if (msg.type && (!msg.steps || msg.steps.length === 0)) {
        return [];
      }

    } catch (e) {
      // Not JSON, ignore
    }

    return [];
  };

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
    console.log('='.repeat(80));
    console.log('[SIDEPANEL] 🎬 Sidepanel mounted, loading token...');
    console.log('[SIDEPANEL] ⏰ Time:', new Date().toISOString());

    // Load token and v2Enabled flag from storage
    console.log('[SIDEPANEL] 📦 Reading from chrome.storage.sync...');
    chrome.storage.sync.get(['fratgpt_token', 'v2Enabled'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('[SIDEPANEL] ❌ Error reading storage:', chrome.runtime.lastError);
      }

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
    console.log('[SIDEPANEL] ✓ Storage change listener registered');
  }, []);

  // Fetch user plan and role when token is available
  useEffect(() => {
    if (!token) {
      setUserPlan(null);
      setUserRole(null);
      return;
    }

    console.log('[SIDEPANEL] 📊 Fetching user plan and role...');
    // Fetch from /auth/me to get both plan and role
    fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          console.log('[SIDEPANEL] ✅ User plan:', data.user.plan);
          console.log('[SIDEPANEL] ✅ User role:', data.user.role);
          setUserPlan(data.user.plan);
          setUserRole(data.user.role);
        }
      })
      .catch(err => {
        console.error('[SIDEPANEL] ❌ Failed to fetch user info:', err);
      });
  }, [token]);

  // Listen for snip completion - separate useEffect so it has access to current token, mode, and session
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
  }, [token, mode, session]); // Re-register when token, mode, or session changes to capture fresh values in closure

  useEffect(() => {
    // Scroll to bottom when messages change
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [session?.messages, optimisticMessages]);

  const handleScreen = async () => {
    const startTime = Date.now();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[SCREEN] [${new Date().toISOString()}] 🎬 handleScreen START`);

    try {
      const captureStart = Date.now();
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

  const handleReplyToStep = (messageId: string, stepIndex: number, stepText: string) => {
    setReplyContext({
      messageId,
      stepIndex,
      stepText,
    });
  };

  const handleSend = () => {
    const messageText = replyContext
      ? `Regarding Step ${replyContext.stepIndex + 1}: ${input}`
      : input;

    sendMessage(messageText);
    setReplyContext(null); // Clear reply context after sending
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
            disabled={sending}
          >
            Fast
          </button>
          <button
            className={`mode-btn ${mode === 'REGULAR' ? 'active' : ''}`}
            onClick={() => setMode('REGULAR')}
            disabled={sending}
          >
            Regular
          </button>
          <button
            className={`mode-btn ${mode === 'EXPERT' ? 'active' : ''}`}
            onClick={() => setMode('EXPERT')}
            disabled={sending || (userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN')}
            title={
              userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN'
                ? 'Expert mode is only available for PRO subscribers'
                : (userPlan === null ? 'Loading plan...' : '')
            }
          >
            Expert {userPlan !== null && userRole !== null && userPlan !== 'PRO' && userRole !== 'ADMIN' && '🔒'}
          </button>
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

        {!session && optimisticMessages.length === 0 && (
          <div className="empty-state">
            <h3>Welcome to FratGPT!</h3>
            <p>Select a mode and start solving homework</p>
          </div>
        )}

        {/* Render real messages from session */}
        {session?.messages.map((msg, idx) => {
          // In EXPERT and REGULAR modes, skip individual provider messages (GEMINI, OPENAI, CLAUDE)
          // Show USER messages and a placeholder for the tabbed interface
          if ((session.mode === 'EXPERT' || session.mode === 'REGULAR') && msg.role === 'ASSISTANT') {
            // Skip individual provider messages, we'll show all of them together in tabs
            // Only render once when we see the first assistant message
            const firstAssistantMsg = session.messages.find(m => m.role === 'ASSISTANT');
            if (msg.id !== firstAssistantMsg?.id) {
              return null;
            }
          }

          return (
            <div key={idx} className={`message ${msg.role.toLowerCase()}`}>
              {msg.attachments?.map((att, i) => (
                <img key={i} src={att.imageData} className="message-image" alt="attachment" />
              ))}

              {/* In EXPERT and REGULAR modes with first ASSISTANT message, show tabbed interface */}
              {msg.role === 'ASSISTANT' && (session.mode === 'EXPERT' || session.mode === 'REGULAR') && (() => {
                // Check if this is the most recent assistant message to show timer
                const assistantMessages = session.messages.filter(m => m.role === 'ASSISTANT');
                const isLatestAssistant = assistantMessages[assistantMessages.length - 1]?.id === msg.id;

                return (
              <div className="answer-box" style={{ maxWidth: '100%' }}>
                {/* ⏱️ Display response time for latest expert message */}
                {isLatestAssistant && responseTime !== null && (
                  <div style={{
                    fontSize: '12px',
                    color: '#10b981',
                    fontWeight: '500',
                    marginBottom: '12px',
                    padding: '6px 12px',
                    backgroundColor: '#ecfdf5',
                    borderRadius: '6px',
                    display: 'inline-block'
                  }}>
                    ⏱️ Time to answer: {responseTime.toFixed(1)}s
                  </div>
                )}

                <div className="tabs">
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

                {(() => {
                  console.log('[EXPERT TAB] 🔍 Looking for provider:', selectedTab);
                  console.log('[EXPERT TAB] 📋 All messages:', session.messages.map(m => ({
                    role: m.role,
                    provider: m.provider,
                    hasShortAnswer: !!m.shortAnswer,
                    hasContent: !!m.content,
                    contentLength: m.content?.length || 0
                  })));

                  const providerMsg = session.messages.find(
                    (m) => m.provider?.toLowerCase() === selectedTab.toLowerCase() && m.role === 'ASSISTANT'
                  );

                  console.log('[EXPERT TAB] 🎯 Found message for', selectedTab, ':', !!providerMsg);
                  if (providerMsg) {
                    console.log('[EXPERT TAB] ✅ Message details:', {
                      provider: providerMsg.provider,
                      shortAnswer: providerMsg.shortAnswer,
                      contentLength: providerMsg.content?.length,
                      hasError: !!(providerMsg as any).metadata?.error
                    });
                    if ((providerMsg as any).metadata?.error) {
                      console.error('[EXPERT TAB] ❌ Provider error found:', (providerMsg as any).metadata.error);
                    }
                  } else {
                    console.warn('[EXPERT TAB] ⚠️ No message found for provider:', selectedTab);
                  }

                  const providerSteps = providerMsg ? parseSteps(providerMsg) : [];

                  return providerMsg ? (
                    <>
                      <div className="answer-label">Answer from {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)}</div>
                      {(providerMsg as any).metadata?.error ? (
                        <div style={{ padding: '20px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b' }}>
                          <strong>Error from {selectedTab}:</strong>
                          <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                            {(providerMsg as any).metadata.error}
                          </pre>
                        </div>
                      ) : (
                        <>
                          <div className="short-answer">{providerMsg.shortAnswer}</div>
                          {providerSteps.length > 0 ? (
                            <div className="steps">
                              {providerSteps.map((step, idx) => (
                                <div key={idx} className="step">
                                  <div className="step-header">
                                    <strong>Step {idx + 1}:</strong>
                                    <button
                                      className="reply-btn"
                                      onClick={() => handleReplyToStep(providerMsg.id, idx, step)}
                                    >
                                      Reply
                                    </button>
                                  </div>
                                  <div className="step-content">{step}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="explanation">{providerMsg.content}</div>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                      No response from this provider
                    </div>
                  );
                })()}
              </div>
                );
              })()}

            {msg.role === 'ASSISTANT' && session.mode !== 'EXPERT' && session.mode !== 'REGULAR' && (() => {
              const msgSteps = parseSteps(msg);
              // Check if this is the most recent assistant message to show timer
              const assistantMessages = session.messages.filter(m => m.role === 'ASSISTANT');
              const isLatestAssistant = assistantMessages[assistantMessages.length - 1]?.id === msg.id;

              const isV2Response = v2Enabled && msg.type && msg.contentV2;

              return (
                <div className="answer-box">
                  {/* ⏱️ Display response time for latest message */}
                  {isLatestAssistant && responseTime !== null && (
                    <div style={{
                      fontSize: '12px',
                      color: '#10b981',
                      fontWeight: '500',
                      marginTop: '8px',
                      padding: '6px 12px',
                      backgroundColor: '#ecfdf5',
                      borderRadius: '6px',
                      display: 'inline-block'
                    }}>
                      ⏱️ Time to answer: {responseTime.toFixed(1)}s
                    </div>
                  )}

                  {/* Debug Info for V2 */}
                  {isV2Response && msg.type && (
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', marginBottom: '8px', display: 'inline-block', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#e0f2f7' }}>
                      Type: {msg.type}
                    </div>
                  )}

                  {isV2Response ? (
                    // Render V2 Answer based on type
                    <V2AnswerRenderer message={msg} handleReplyToStep={handleReplyToStep} />
                  ) : (
                    // Render V1 Answer
                    <>
                      <div className="answer-label">Final Answer</div>
                      <div className="short-answer">{msg.shortAnswer}</div>
                      {msgSteps.length > 0 ? (
                        <div className="steps">
                          {msgSteps.map((step, idx) => (
                            <div key={idx} className="step">
                              <div className="step-header">
                                <strong>Step {idx + 1}:</strong>
                                <button
                                  className="reply-btn"
                                  onClick={() => handleReplyToStep(msg.id, idx, step)}
                                >
                                  Reply
                                </button>
                              </div>
                              <div className="step-content">{step}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="explanation">{msg.content}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}
            </div>
          );
        })}

        {/* Render optimistic messages (user message + thinking) */}
        {optimisticMessages.map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role.toLowerCase()}`}>
            {msg.attachments?.map((att, i) => (
              <div key={i}>
                <img src={att.imageData} className="message-image" alt="attachment" />
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                  Method: {att.source}
                </div>
              </div>
            ))}

            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}
      </div>

      <div className="input-container">
        {replyContext && (
          <div className="reply-context">
            <div className="reply-context-content">
              <div className="reply-label">Replying to Step {replyContext.stepIndex + 1}:</div>
              <div className="reply-preview">{replyContext.stepText.substring(0, 100)}{replyContext.stepText.length > 100 ? '...' : ''}</div>
            </div>
            <button
              className="cancel-reply-btn"
              onClick={() => setReplyContext(null)}
              title="Cancel reply"
            >
              ✕
            </button>
          </div>
        )}
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

// =========================================================================================================
// V2 Answer Renderer Component
// =========================================================================================================

interface V2AnswerRendererProps {
  message: Message;
  handleReplyToStep: (messageId: string, stepIndex: number, stepText: string) => void;
}

const V2AnswerRenderer: React.FC<V2AnswerRendererProps> = ({ message, handleReplyToStep }) => {
  if (!message.type || !message.contentV2) {
    return <div className="answer-box">Error: Invalid V2 response format.</div>;
  }

  const renderSteps = (steps: string[]) => {
    if (!steps || steps.length === 0) return null;
    return (
      <div className="steps">
        <h3>Steps:</h3>
        {steps.map((step, idx) => (
          <div key={idx} className="step">
            <strong>Step {idx + 1}:</strong> {step}
            <button
              className="reply-btn"
              onClick={() => handleReplyToStep(message.id, idx, step)}
            >
              Reply
            </button>
          </div>
        ))}
      </div>
    );
  };

  switch (message.type) {
    case 'MULTIPLE_CHOICE':
      return (
        <div className="answer-box multiple-choice">
          <div className="answer-header">Multiple Choice Answer</div>
          <div className="mc-choice">{message.contentV2.choice}</div>
          <div className="short-answer">{message.debug_raw_answer || `Choice: ${message.contentV2.choice}`}</div>
          {renderSteps(message.steps || [])}
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
          {renderSteps(message.steps || [])}
        </div>
      );
    case 'FILL_IN_THE_BLANK':
      return (
        <div className="answer-box fill-blank">
          <div className="answer-header">Fill-in-the-Blank Answer</div>
          <div className="fill-blank-text">{message.contentV2.text}</div>
          <div className="short-answer">{message.debug_raw_answer || `Answer: ${message.contentV2.text}`}</div>
          {renderSteps(message.steps || [])}
        </div>
      );
    case 'SHORT_ANSWER':
      return (
        <div className="answer-box short-answer-type">
          <div className="answer-header">Short Answer</div>
          <div className="short-answer-text">{message.contentV2.text}</div>
          <div className="short-answer">{message.debug_raw_answer || `Answer: ${message.contentV2.text}`}</div>
          {renderSteps(message.steps || [])}
        </div>
      );
    case 'CODING':
      return (
        <div className="answer-box coding-answer">
          <div className="answer-header">Code Answer</div>
          <pre className="code-block">{message.contentV2.code}</pre>
          <div className="short-answer">{message.debug_raw_answer || 'Code provided'}</div>
          {renderSteps(message.steps || [])}
        </div>
      );
    case 'UNKNOWN':
    default:
      return (
        <div className="answer-box unknown-type">
          <div className="answer-header">Answer (Unknown Type)</div>
          <div className="short-answer">{message.debug_raw_answer || message.shortAnswer || message.content}</div>
          {renderSteps(message.steps || [])}
        </div>
      );
  }
};

export default App;