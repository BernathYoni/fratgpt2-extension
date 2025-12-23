import React, { useState, useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import Latex from 'react-latex-next';
import { GraphVisual } from './components/GraphVisual';

const API_URL = 'https://api.fratgpt.co';

type Mode = 'REGULAR' | 'FAST' | 'EXPERT';
type Tab = 'consensus' | 'gemini' | 'openai' | 'claude';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  shortAnswer?: string;
  provider?: string;
  questionType?: string;
  structuredAnswer?: any;
  steps?: Array<{ title: string; content: string }>; // NEW field
  attachments?: Array<{ imageData?: string; source: string }>;
  metadata?: { error?: string };
  providers?: Array<{ 
    provider: string;
    response: { shortAnswer: string; steps?: Array<{ title: string; content: string }> };
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
  const [userPlan, setUserPlan] = useState<'FREE' | 'BASIC' | 'PRO' | null>(null);
  const [userRole, setUserRole] = useState<'USER' | 'ADMIN' | null>(null);

  const [mode, setMode] = useState<Mode>('REGULAR');
  const [session, setSession] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedTab, setSelectedTab] = useState<Tab>('gemini');
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  
  // Streaming / Typewriter State
  const [displayedThinking, setDisplayedThinking] = useState<string>('');
  const thinkingBuffer = useRef<string>('');

  const chatRef = useRef<HTMLDivElement>(null);
  const requestStartTime = useRef<number | null>(null);

  // Typewriter Effect Loop
  useEffect(() => {
    if (!sending) return;
    
    const interval = setInterval(() => {
      if (thinkingBuffer.current.length > 0) {
        // Taking 3-5 chars per 30ms creates a smooth, fast-but-readable speed (~100-150 words/min)
        const chunkSize = 3;
        const nextChars = thinkingBuffer.current.slice(0, chunkSize);
        thinkingBuffer.current = thinkingBuffer.current.slice(chunkSize);
        setDisplayedThinking(prev => prev + nextChars);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [sending]);

  useEffect(() => {
    chrome.storage.sync.get(['fratgpt_token'], (result) => {
      if (result.fratgpt_token) setToken(result.fratgpt_token);
    });

    const storageListener = (changes: any, namespace: string) => {
      if (namespace === 'sync' && changes.fratgpt_token) {
        setToken(changes.fratgpt_token.newValue || null);
      }
    };
    chrome.storage.onChanged.addListener(storageListener);
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setUserPlan(data.user.plan);
          setUserRole(data.user.role);
        }
      });
  }, [token]);

  useEffect(() => {
    const messageListener = (message: any, sender: any, sendResponse: any) => {
      if (message.type === 'SNIP_COMPLETE') {
        handleSnipComplete(message.coords);
      }
      if (message.type === 'SOLVE_TEXT_REQUEST') {
        handleTextSolve(message.text, message.sourceUrl);
        sendResponse({ success: true });
        return true;
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [token, mode, session]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [session?.messages, optimisticMessages, displayedThinking]);

  const handleScreen = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const currentUrl = tab?.url;

      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, resolve);
      });
      if (response.error) { alert('Failed: ' + response.error); return; }
      
      const userMessage: Message = {
        id: `temp-${Date.now()}`, role: 'USER', content: input || 'Solve this',
        attachments: [{ imageData: response.imageData, source: 'SCREEN' }]
      };
      setOptimisticMessages([userMessage]);
      setInput('');
      await sendMessage(input || 'Solve this', response.imageData, 'SCREEN', currentUrl);
    } catch (e: any) { alert(e.message); setOptimisticMessages([]); }
  };

  const handleSnip = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || tab.url?.startsWith('chrome')) { alert('Cannot snip here'); return; }
      
      chrome.tabs.sendMessage(tab.id, { type: 'START_SNIP' }, (response) => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({ target: { tabId: tab.id! }, files: ['content.js'] }, () => {
            setTimeout(() => chrome.tabs.sendMessage(tab.id!, { type: 'START_SNIP' }), 100);
          });
        }
      });
    } catch (e: any) { alert(e.message); }
  };

  const handleSnipComplete = async (coords: any) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response: any = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'CAPTURE_SNIP', coords }, resolve));
      if (response.error) { alert('Failed: ' + response.error); return; }

      const userMessage: Message = {
        id: `temp-${Date.now()}`, role: 'USER', content: input || 'Solve this',
        attachments: [{ imageData: response.imageData, source: 'SNIP' }]
      };
      setOptimisticMessages([userMessage]);
      setInput('');
      await sendMessage(input || 'Solve this', response.imageData, 'SNIP', tab?.url);
    } catch (e: any) { alert(e.message); setOptimisticMessages([]); }
  };

  const handleTextSolve = async (text: string, sourceUrl?: string) => {
    try {
      console.log('[SIDEPANEL] 📝 Starting text solve...');
      const userMessage: Message = { id: `temp-${Date.now()}`, role: 'USER', content: text };
      setOptimisticMessages([userMessage]);
      await sendMessage(text, undefined, undefined, sourceUrl);
    } catch (e: any) {
      console.error('[SIDEPANEL] ❌ Text solve failed:', e);
      alert(e.message);
      setOptimisticMessages([]);
    }
  };

  const logInteraction = async (type: string, metadata: any) => {
    if (!session || !token) return;
    fetch(`${API_URL}/chat/${session.id}/interaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, metadata }),
    }).catch(e => console.error('Log failed', e));
  };

  const sendMessage = async (text: string, imageData?: string, captureSource?: string, sourceUrl?: string) => {
    setSending(true);
    setError('');
    
    // Reset Stream State
    setDisplayedThinking('');
    thinkingBuffer.current = '';
    
    console.log('[SIDEPANEL] sendMessage called. Initializing states.');
    
    try {
      const isNewCapture = !!imageData;
      const useStreaming = isNewCapture || !session; 
      const url = useStreaming ? `${API_URL}/chat/start-stream` : `${API_URL}/chat/${session?.id}/message`;
      
      const body: any = { message: text };
      if (!session || isNewCapture) body.mode = mode;
      if (imageData) { body.imageData = imageData; body.captureSource = captureSource; }
      if (sourceUrl) body.sourceUrl = sourceUrl;

      requestStartTime.current = Date.now();

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
      }

      // Handle Streaming Response
      if (useStreaming && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || ''; 

          for (const line of lines) {
            const eventMatch = line.match(/^event: (.*)$/m);
            const dataMatch = line.match(/^data: ([\s\S]*)$/m);

            if (eventMatch && dataMatch) {
              const event = eventMatch[1].trim();
              const dataStr = dataMatch[1].trim();

              if (event === 'thought') {
                try {
                  const chunk = JSON.parse(dataStr);
                  thinkingBuffer.current += chunk;
                } catch (e) { console.error('[SIDEPANEL] Parse thought error', e); }
              } else if (event === 'result') {
                try {
                  const sessionData = JSON.parse(dataStr);
                  if (requestStartTime.current) {
                    setResponseTime((Date.now() - requestStartTime.current) / 1000);
                    requestStartTime.current = null;
                  }
                  setOptimisticMessages([]);
                  setSession(sessionData);
                } catch (e) { console.error('[SIDEPANEL] Parse result error', e); }
              } else if (event === 'error') {
                 const errData = JSON.parse(dataStr);
                 throw new Error(errData.error || 'Stream error');
              } else if (event === 'done') {
                break; 
              }
            }
          }
        }
      } else {
        // Handle Standard Response
        const data = await res.json();
        if (requestStartTime.current) {
          setResponseTime((Date.now() - requestStartTime.current) / 1000);
          requestStartTime.current = null;
        }
        setOptimisticMessages([]);
        setSession(data);
      }

      setInput('');
    } catch (err: any) { 
      setError(err.message); 
      setOptimisticMessages([]); 
      setDisplayedThinking('');
    } finally { 
      setSending(false); 
    } 
  };

  const handleSend = () => sendMessage(input);
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  if (!token) return <div className="auth-container"><h2>Please Log In</h2><button className="btn" onClick={() => window.open('https://fratgpt.co/login')}>Log In</button></div>;

  return (
    <div className="app">
      <div className="header">
        <div className="logo">FratGPT 2.0</div>
        <div className="mode-selector">
          {['FAST', 'REGULAR', 'EXPERT'].map(m => (
            <button key={m} className={`mode-btn ${mode === m ? 'active' : ''}`} onClick={() => setMode(m as Mode)} disabled={sending || (m === 'EXPERT' && userPlan !== 'PRO' && userRole !== 'ADMIN')}> 
              {m.charAt(0) + m.slice(1).toLowerCase()} {m === 'EXPERT' && userPlan !== 'PRO' && userRole !== 'ADMIN' && '🔒'}
            </button>
          ))}
        </div>
        <div className="action-buttons">
          <button className="btn" onClick={handleScreen} disabled={sending}>📸 Screen</button>
          <button className="btn" onClick={handleSnip} disabled={sending}>✂️ Snip</button>
        </div>
      </div>

      <div className="chat-container" ref={chatRef}>
        {error && <div className="error">{error}</div>}
        {!session && optimisticMessages.length === 0 && !sending && <div className="empty-state"><h3>Welcome!</h3><p>Select a mode to start.</p></div>}

        {/* Existing Messages */}
        {session?.messages.map((msg, idx) => {
          if ((session.mode === 'EXPERT' || session.mode === 'REGULAR') && msg.role === 'ASSISTANT') {
            const firstAssistantMsg = session.messages.find(m => m.role === 'ASSISTANT');
            if (msg.id !== firstAssistantMsg?.id) return null;
          }

          return (
            <div key={idx} className={`message ${msg.role.toLowerCase()}`}>
              {msg.attachments?.map((att, i) => <img key={i} src={att.imageData} className="message-image" alt="attachment" />)}
              
              {msg.role === 'ASSISTANT' && (session.mode === 'EXPERT' || session.mode === 'REGULAR') ? (
                <div style={{ width: '100%', marginTop: '8px' }}>
                  {(() => {
                    const providerMsg = session.messages.find(m => m.provider?.toLowerCase() === selectedTab.toLowerCase() && m.role === 'ASSISTANT');
                    const displayMsg = providerMsg || msg;
                    
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#6b7280' }}>
                          {responseTime !== null && <div className="timer">⏱️ {responseTime.toFixed(1)}s</div>}
                        </div>
                        <div className="tabs mb-4">
                          {['gemini', 'openai', 'claude'].map(t => (
                            <button key={t} className={`tab ${selectedTab === t ? 'active' : ''}`} onClick={() => { logInteraction('TAB_VIEW', { provider: t }); setSelectedTab(t as Tab); }}>
                              {t === 'openai' ? 'ChatGPT' : t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>
                        
                        <div style={{ padding: '0 4px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                            Final Answer
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '20px' }}>
                            {String(displayMsg.shortAnswer || '')}
                          </div>
                          
                          {(() => {
                            const steps = displayMsg.steps || displayMsg.structuredAnswer?.steps;
                            if (steps && steps.length > 0) {
                              return (
                                <div style={{ marginTop: '20px' }}>
                                  <div style={{ 
                                    fontSize: '13px', 
                                    fontWeight: 700, 
                                    color: '#374151', 
                                    marginBottom: '12px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.025em'
                                  }}>
                                    Explanation
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {steps.map((step: any, sIdx: number) => (
                                       <div key={sIdx}>
                                         <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px', color: '#1f2937' }}>
                                           {sIdx + 1}. {step.title}
                                         </div>
                                                                              <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563', paddingLeft: '18px' }}>
                                                                                <Latex>{String(step.content || '')}</Latex>
                                                                              </div>
                                                                                                                   {step.visual && (
                                                                                                                     <div style={{ paddingLeft: '18px' }}>
                                                                                                                       {step.visual.type === 'graph' && <GraphVisual data={step.visual.data} caption={step.visual.caption} />}
                                                                                                                     </div>
                                                                                                                   )}                                                                            </div>
                                                                         ))}                                  </div>
                                </div>
                              );
                            } else if (displayMsg.structuredAnswer?.explanation) {
                              return (
                                <div style={{ marginTop: '12px' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Explanation</div>
                                  <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151' }}>
                                    <Latex>{String(displayMsg.structuredAnswer.explanation || '')}</Latex>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : msg.role === 'ASSISTANT' ? (
                <div style={{ width: '100%', marginTop: '8px', padding: '0 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#6b7280' }}>
                    {responseTime !== null && <div className="timer">⏱️ {responseTime.toFixed(1)}s</div>}
                  </div>
                  
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                    Final Answer
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827', marginBottom: '20px' }}>
                     {String(msg.shortAnswer || '')}
                  </div>

                  {(() => {
                     const steps = msg.steps || msg.structuredAnswer?.steps;
                     
                     if (steps && steps.length > 0) {
                       return (
                          <div style={{ marginTop: '20px' }}>
                            <div style={{ 
                              fontSize: '13px', 
                              fontWeight: 700, 
                              color: '#374151', 
                              marginBottom: '12px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.025em'
                            }}>
                              Explanation
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              {steps.map((step: any, sIdx: number) => (
                                 <div key={sIdx}>
                                   <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '4px', color: '#1f2937' }}>
                                     {sIdx + 1}. {step.title}
                                   </div>
                                   <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#4b5563', paddingLeft: '18px' }}>
                                     <Latex>{String(step.content || '')}</Latex>
                                   </div>
                                                                        {step.visual && (
                                                                          <div style={{ paddingLeft: '18px' }}>
                                                                            {step.visual.type === 'graph' && <GraphVisual data={step.visual.data} caption={step.visual.caption} />}
                                                                          </div>
                                                                        )}                                 </div>
                              ))}
                            </div>
                          </div>
                       );
                     } else if (msg.structuredAnswer?.explanation) {
                       return (
                          <div style={{ marginTop: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Explanation</div>
                            <div style={{ fontSize: '14px', lineHeight: '1.6', color: '#374151' }}>
                              <Latex>{String(msg.structuredAnswer.explanation || '')}</Latex>
                            </div>
                          </div>
                       );
                     }
                     return null;
                  })()}
                </div>
              ) : (
                <div className="message-bubble">{msg.content}</div>
              )}
            </div>
          );
        })}

        {/* Optimistic / Thinking UI */}
        {optimisticMessages.map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role.toLowerCase()}`}>
            {msg.attachments?.map((att, i) => <img key={i} src={att.imageData} className="message-image" alt="attachment" />)}
            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}

        {sending && (
          <div className="thinking-container" style={{ 
            padding: '12px 16px', 
            color: '#6b7280', 
            fontStyle: 'italic', 
            fontSize: '13px', 
            lineHeight: '1.6',
            animation: 'fadeIn 0.3s ease-in-out'
          }}>
            {displayedThinking ? (
              displayedThinking
                .replace(/<thinking>/g, '')
                .replace(/<\/thinking>[\s\S]*/g, '')
                .replace(/\n/g, ' ')
                .trim()
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="loading-spinner" style={{ width: '14px', height: '14px', border: '2px solid #e5e7eb', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <span style={{ fontSize: '12px' }}>Thinking...</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="input-container">
        <div className="input-box">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask a follow-up..." rows={2} disabled={sending} />
          <button className="send-btn" onClick={handleSend} disabled={sending || !input.trim()}>Send</button>
        </div>
      </div>
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
