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
  metadata?: { error?: string };
  providers?: Array<{
    provider: string;
    response: { shortAnswer: string };
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

  const chatRef = useRef<HTMLDivElement>(null);
  const requestStartTime = useRef<number | null>(null);

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
    const messageListener = (message: any) => {
      if (message.type === 'SNIP_COMPLETE') handleSnipComplete(message.coords);
    };
    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, [token, mode, session]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [session?.messages, optimisticMessages]);

  const handleScreen = async () => {
    try {
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, resolve);
      });
      if (response.error) { alert('Failed: ' + response.error); return; }
      
      const userMessage: Message = {
        id: `temp-${Date.now()}`, role: 'USER', content: input || 'Solve this',
        attachments: [{ imageData: response.imageData, source: 'SCREEN' }]
      };
      setOptimisticMessages([userMessage, { id: `think-${Date.now()}`, role: 'ASSISTANT', content: 'Thinking...' }]);
      setInput('');
      await sendMessage(input || 'Solve this', response.imageData, 'SCREEN');
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
      const response: any = await new Promise((resolve) => chrome.runtime.sendMessage({ type: 'CAPTURE_SNIP', coords }, resolve));
      if (response.error) { alert('Failed: ' + response.error); return; }

      const userMessage: Message = {
        id: `temp-${Date.now()}`, role: 'USER', content: input || 'Solve this',
        attachments: [{ imageData: response.imageData, source: 'SNIP' }]
      };
      setOptimisticMessages([userMessage, { id: `think-${Date.now()}`, role: 'ASSISTANT', content: 'Thinking...' }]);
      setInput('');
      await sendMessage(input || 'Solve this', response.imageData, 'SNIP');
    } catch (e: any) { alert(e.message); setOptimisticMessages([]); }
  };

  const sendMessage = async (text: string, imageData?: string, captureSource?: string) => {
    setSending(true);
    setError('');
    try {
      const isNewCapture = !!imageData;
      const url = isNewCapture ? `${API_URL}/chat/start` : (session ? `${API_URL}/chat/${session.id}/message` : `${API_URL}/chat/start`);
      
      const body: any = { message: text };
      if (!session || isNewCapture) body.mode = mode;
      if (imageData) { body.imageData = imageData; body.captureSource = captureSource; }

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

      const data = await res.json();
      if (requestStartTime.current) {
        setResponseTime((Date.now() - requestStartTime.current) / 1000);
        requestStartTime.current = null;
      }
      setOptimisticMessages([]);
      setSession(data);
      setInput('');
    } catch (err: any) { setError(err.message); setOptimisticMessages([]); }
    finally { setSending(false); }
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
        {!session && optimisticMessages.length === 0 && <div className="empty-state"><h3>Welcome!</h3><p>Select a mode to start.</p></div>}

        {session?.messages.map((msg, idx) => {
          if ((session.mode === 'EXPERT' || session.mode === 'REGULAR') && msg.role === 'ASSISTANT') {
            const firstAssistantMsg = session.messages.find(m => m.role === 'ASSISTANT');
            if (msg.id !== firstAssistantMsg?.id) return null;
          }

          return (
            <div key={idx} className={`message ${msg.role.toLowerCase()}`}>
              {msg.attachments?.map((att, i) => <img key={i} src={att.imageData} className="message-image" alt="attachment" />)}
              
              {msg.role === 'ASSISTANT' && (session.mode === 'EXPERT' || session.mode === 'REGULAR') ? (
                <div className="answer-box" style={{ maxWidth: '100%' }}>
                  {responseTime !== null && <div className="timer">⏱️ {responseTime.toFixed(1)}s</div>}
                  <div className="tabs">
                    {['gemini', 'openai', 'claude'].map(t => (
                      <button key={t} className={`tab ${selectedTab === t ? 'active' : ''}`} onClick={() => setSelectedTab(t as Tab)}>
                        {t === 'openai' ? 'ChatGPT' : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const providerMsg = session.messages.find(m => m.provider?.toLowerCase() === selectedTab.toLowerCase() && m.role === 'ASSISTANT');
                    return providerMsg ? (
                      <>
                        <div className="answer-label">Answer from {selectedTab.charAt(0).toUpperCase() + selectedTab.slice(1)}</div>
                        <div className="short-answer">{providerMsg.shortAnswer}</div>
                      </>
                    ) : <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>No response</div>;
                  })()}
                </div>
              ) : msg.role === 'ASSISTANT' ? (
                <div className="answer-box">
                  <div className="answer-label">Final Answer</div>
                  <div className="short-answer">{msg.shortAnswer}</div>
                </div>
              ) : (
                <div className="message-bubble">{msg.content}</div>
              )}
            </div>
          );
        })}

        {optimisticMessages.map((msg, idx) => (
          <div key={msg.id} className={`message ${msg.role.toLowerCase()}`}>
            {msg.attachments?.map((att, i) => <img key={i} src={att.imageData} className="message-image" alt="attachment" />)}
            <div className="message-bubble">{msg.content}</div>
          </div>
        ))}
      </div>

      <div className="input-container">
        <div className="input-box">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask a follow-up..." rows={2} disabled={sending} />
          <button className="send-btn" onClick={handleSend} disabled={sending || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;