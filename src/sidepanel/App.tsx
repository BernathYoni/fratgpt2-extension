import React, { useState, useEffect, useRef } from 'react';

const API_URL = 'https://api.fratgpt.co';

type Mode = 'REGULAR' | 'FAST' | 'EXPERT';
type Tab = 'consensus' | 'gemini' | 'openai' | 'claude';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  shortAnswer?: string;
  steps?: string[];
  provider?: string;
  attachments?: Array<{ imageData?: string; source: string }>;
  metadata?: { error?: string };
  providers?: Array<{
    provider: string;
    response: { shortAnswer: string; steps: string[] };
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

  // Helper function to parse steps from message content
  const parseSteps = (msg: Message): string[] => {
    // If steps are directly on the message, use them
    if (msg.steps && msg.steps.length > 0) {
      return msg.steps;
    }

    // Otherwise try to parse from content JSON
    try {
      const parsed = JSON.parse(msg.content);
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return parsed.steps;
      }
    } catch (e) {
      // Not JSON, ignore
    }

    return [];
  };

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
    console.log('='.repeat(80));
    console.log('[SIDEPANEL] 🎬 Sidepanel mounted, loading token...');
    console.log('[SIDEPANEL] ⏰ Time:', new Date().toISOString());

    // Load token from storage
    console.log('[SIDEPANEL] 📦 Reading from chrome.storage.sync...');
    chrome.storage.sync.get(['fratgpt_token'], (result) => {
      console.log('[SIDEPANEL] 📦 Storage read complete');
      console.log('[SIDEPANEL] 📦 Full result object:', result);
      console.log('[SIDEPANEL] 📦 Keys in result:', Object.keys(result));

      if (chrome.runtime.lastError) {
        console.error('[SIDEPANEL] ❌ Error reading storage:', chrome.runtime.lastError);
      }

      if (result.fratgpt_token) {
        console.log('[SIDEPANEL] ✅ Token found in storage!');
        console.log('[SIDEPANEL] 🔑 Token preview:', result.fratgpt_token.substring(0, 20) + '...');
        console.log('[SIDEPANEL] 🔑 Token length:', result.fratgpt_token.length);
        console.log('[SIDEPANEL] 🔄 Setting token state...');
        setToken(result.fratgpt_token);
        console.log('[SIDEPANEL] ✅ Token state updated');
      } else {
        console.log('[SIDEPANEL] ❌ No token in storage');
        console.log('[SIDEPANEL] ℹ️ User needs to log in on website');
      }
    });

    // Listen for storage changes (token updates from website)
    console.log('[SIDEPANEL] 🔊 Registering storage change listener...');
    const storageListener = (changes: any, namespace: string) => {
      console.log('='.repeat(80));
      console.log('[SIDEPANEL] 🔔 STORAGE CHANGED EVENT!');
      console.log('[SIDEPANEL] ⏰ Time:', new Date().toISOString());
      console.log('[SIDEPANEL] 📦 Namespace:', namespace);
      console.log('[SIDEPANEL] 📦 Full changes object:', changes);
      console.log('[SIDEPANEL] 📦 Changes keys:', Object.keys(changes));

      if (namespace === 'sync' && changes.fratgpt_token) {
        console.log('[SIDEPANEL] ✅ Detected fratgpt_token change!');
        console.log('[SIDEPANEL] Old value:', changes.fratgpt_token.oldValue ? changes.fratgpt_token.oldValue.substring(0, 20) + '...' : 'NONE');
        console.log('[SIDEPANEL] New value:', changes.fratgpt_token.newValue ? changes.fratgpt_token.newValue.substring(0, 20) + '...' : 'NONE');

        if (changes.fratgpt_token.newValue) {
          console.log('[SIDEPANEL] 🔄 Updating token state with new value...');
          setToken(changes.fratgpt_token.newValue);
          console.log('[SIDEPANEL] ✅ Token state updated - user should now be logged in!');
        } else {
          console.log('[SIDEPANEL] 🚪 Token removed, logging out');
          setToken(null);
        }
      } else {
        console.log('[SIDEPANEL] ℹ️ Storage change not relevant to token');
      }
      console.log('='.repeat(80));
    };

    chrome.storage.onChanged.addListener(storageListener);
    console.log('[SIDEPANEL] ✓ Storage change listener registered');
  }, []);

  // Listen for snip completion - separate useEffect so it has access to current token, mode, and session
  useEffect(() => {
    console.log('[SIDEPANEL] 🔊 Setting up message listener with current state...');
    console.log('[SIDEPANEL] 🔐 Token available:', !!token);
    console.log('[SIDEPANEL] 🎯 Current mode:', mode);
    console.log('[SIDEPANEL] 💼 Current session:', session?.id || 'none');

    const messageListener = (message: any) => {
      console.log('[SIDEPANEL] 📨 Message received in listener:', message);
      if (message.type === 'SNIP_COMPLETE') {
        console.log('[SIDEPANEL] ✅ SNIP_COMPLETE message detected!');
        console.log('[SIDEPANEL] 🔐 Token in closure:', !!token);
        console.log('[SIDEPANEL] 🎯 Mode in closure:', mode);
        console.log('[SIDEPANEL] 💼 Session in closure:', session?.id || 'none');
        handleSnipComplete(message.coords);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    console.log('[SIDEPANEL] ✅ Message listener registered');

    // Cleanup
    return () => {
      console.log('[SIDEPANEL] 🧹 Removing message listener');
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
    console.log('[SCREEN] Current mode:', mode);
    console.log('[SCREEN] Current session:', session?.id || 'none');
    console.log('[SCREEN] Session mode:', session?.mode || 'none');

    try {
      const captureStart = Date.now();
      console.log(`[SCREEN] [${new Date().toISOString()}] 📸 Requesting screen capture...`);
      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREEN' }, resolve);
      });

      if (response.error) {
        alert('Failed to capture screen: ' + response.error);
        return;
      }

      const captureTime = Date.now() - captureStart;
      console.log(`[SCREEN] [${new Date().toISOString()}] ✅ Screen captured in ${captureTime}ms`);

      // Add optimistic user message immediately
      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: 'USER',
        content: input || 'Solve this problem',
        attachments: [{
          imageData: response.imageData,
          source: 'SCREEN'
        }]
      };

      // Add thinking message
      const thinkingMessage: Message = {
        id: `temp-thinking-${Date.now()}`,
        role: 'ASSISTANT',
        content: 'Thinking...',
      };

      console.log(`[SCREEN] [${new Date().toISOString()}] 📝 Creating optimistic messages`);
      setOptimisticMessages([userMessage, thinkingMessage]);
      setInput('');

      console.log(`[SCREEN] [${new Date().toISOString()}] 🚀 Calling sendMessage with mode: ${mode}, source: SCREEN`);
      await sendMessage(input || 'Solve this problem', response.imageData, 'SCREEN');
      const totalTime = Date.now() - startTime;
      console.log(`[SCREEN] [${new Date().toISOString()}] ✅ handleScreen COMPLETE - Total time: ${totalTime}ms`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error) {
      console.error('[SCREEN] ❌ ERROR:', error);
      alert('Failed to capture screen');
      setOptimisticMessages([]);
    }
  };

  const handleSnip = async () => {

    try {
      console.log('[SIDEPANEL] 🎯 handleSnip called - starting snip mode');

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('[SIDEPANEL] 📑 Active tab:', tab);

      if (!tab.id) {
        console.error('[SIDEPANEL] ❌ No tab ID found');
        alert('Failed to start snip mode: No active tab');
        return;
      }

      console.log('[SIDEPANEL] ✅ Tab ID:', tab.id);
      console.log('[SIDEPANEL] 🌐 Tab URL:', tab.url);

      // Check if we can access this tab (some pages like chrome:// are restricted)
      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        console.error('[SIDEPANEL] ❌ Cannot inject into chrome:// or extension pages');
        alert('Cannot use snip mode on this page. Please try on a regular website.');
        return;
      }

      console.log('[SIDEPANEL] 📤 Sending START_SNIP message to tab', tab.id);

      // Try to send message to content script
      chrome.tabs.sendMessage(tab.id, { type: 'START_SNIP' }, (response) => {
        const lastError = chrome.runtime.lastError;

        if (lastError) {
          console.error('[SIDEPANEL] ❌ Error sending message:', lastError);
          console.error('[SIDEPANEL] ❌ Error message:', lastError.message);
          console.log('[SIDEPANEL] 🔄 Content script may not be injected yet, trying to inject...');

          // Content script not loaded - try to inject it programmatically
          chrome.scripting.executeScript({
            target: { tabId: tab.id! },
            files: ['content.js']
          }, () => {
            const injectionError = chrome.runtime.lastError;
            if (injectionError) {
              console.error('[SIDEPANEL] ❌ Failed to inject content script:', injectionError);
              alert('Failed to start snip mode: Could not inject content script. Error: ' + injectionError.message);
            } else {
              console.log('[SIDEPANEL] ✅ Content script injected, retrying START_SNIP...');
              // Wait a bit for script to initialize
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id!, { type: 'START_SNIP' }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    console.error('[SIDEPANEL] ❌ Still failed after injection:', chrome.runtime.lastError);
                    alert('Failed to start snip mode even after injection: ' + chrome.runtime.lastError.message);
                  } else {
                    console.log('[SIDEPANEL] ✅ START_SNIP sent successfully after injection');
                  }
                });
              }, 100);
            }
          });
        } else {
          console.log('[SIDEPANEL] ✅ START_SNIP message sent successfully');
          console.log('[SIDEPANEL] 📬 Response:', response);
        }
      });
    } catch (error: any) {
      console.error('[SIDEPANEL] ❌ Exception in handleSnip:');
      console.error('[SIDEPANEL] ❌ Error name:', error?.name);
      console.error('[SIDEPANEL] ❌ Error message:', error?.message);
      console.error('[SIDEPANEL] ❌ Error stack:', error?.stack);
      alert('Failed to start snip mode: ' + (error?.message || 'Unknown error'));
    }
  };

  const handleSnipComplete = async (coords: any) => {
    const startTime = Date.now();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[SNIP] [${new Date().toISOString()}] 🎬 handleSnipComplete START`);
    console.log('[SNIP] Current mode:', mode);
    console.log('[SNIP] Current session:', session?.id || 'none');
    console.log('[SNIP] Session mode:', session?.mode || 'none');
    console.log('[SNIP] 📏 Coordinates:', JSON.stringify(coords, null, 2));

    try {
      const captureStart = Date.now();
      console.log(`[SNIP] [${new Date().toISOString()}] 📤 Sending CAPTURE_SNIP message to background...`);

      const response: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'CAPTURE_SNIP', coords }, (response) => {
          console.log(`[SNIP] [${new Date().toISOString()}] 📬 Received response from background:`, response);
          resolve(response);
        });
      });

      const captureTime = Date.now() - captureStart;
      console.log(`[SNIP] [${new Date().toISOString()}] 🔍 Checking response... (capture took ${captureTime}ms)`);
      if (response.error) {
        console.error('[SNIP] ❌ Error in response:', response.error);
        alert('Failed to capture snip: ' + response.error);
        console.log('[SNIP] ❌ handleSnipComplete FAILED');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }

      console.log(`[SNIP] [${new Date().toISOString()}] ✅ Snip captured successfully in ${captureTime}ms!`);
      console.log('[SNIP] 📊 Image data length:', response.imageData?.length || 0);
      console.log(`[SNIP] [${new Date().toISOString()}] 💬 Creating optimistic messages...`);

      // Add optimistic user message immediately
      const userMessage: Message = {
        id: `temp-user-${Date.now()}`,
        role: 'USER',
        content: input || 'Solve this problem',
        attachments: [{
          imageData: response.imageData,
          source: 'SNIP'
        }]
      };

      // Add thinking message
      const thinkingMessage: Message = {
        id: `temp-thinking-${Date.now()}`,
        role: 'ASSISTANT',
        content: 'Thinking...',
      };

      console.log(`[SNIP] [${new Date().toISOString()}] 📝 Setting optimistic messages...`);
      setOptimisticMessages([userMessage, thinkingMessage]);
      setInput('');

      console.log(`[SNIP] [${new Date().toISOString()}] 🚀 About to call sendMessage`);
      console.log('[SNIP] 🚀 Mode being passed:', mode);
      console.log('[SNIP] 🚀 Capture source:', 'SNIP');
      console.log('[SNIP] 🚀 Message text:', input || 'Solve this problem');
      await sendMessage(input || 'Solve this problem', response.imageData, 'SNIP');

      const totalTime = Date.now() - startTime;
      console.log(`[SNIP] [${new Date().toISOString()}] ✅ sendMessage completed`);
      console.log(`[SNIP] [${new Date().toISOString()}] ✅ handleSnipComplete COMPLETE - Total time: ${totalTime}ms`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } catch (error: any) {
      console.error('[SNIP] ❌ EXCEPTION CAUGHT:');
      console.error('[SNIP] ❌ Error name:', error?.name);
      console.error('[SNIP] ❌ Error message:', error?.message);
      console.error('[SNIP] ❌ Error stack:', error?.stack);
      console.error('[SNIP] ❌ Full error:', error);
      alert('Failed to capture snip: ' + (error?.message || 'Unknown error'));
      setOptimisticMessages([]);
      console.log('[SNIP] ❌ handleSnipComplete FAILED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  };

  const sendMessage = async (text: string, imageData?: string, captureSource?: string) => {
    const sendStart = Date.now();
    console.log(`[SIDEPANEL] [${new Date().toISOString()}] 📨 sendMessage called`);
    console.log('[SIDEPANEL] 📝 Text:', text);
    console.log('[SIDEPANEL] 🖼️ Has imageData:', !!imageData);
    console.log('[SIDEPANEL] 🖼️ ImageData length:', imageData?.length || 0);
    console.log('[SIDEPANEL] 📷 Capture source:', captureSource);
    console.log('[SIDEPANEL] 🔐 Has token:', !!token);
    console.log('[SIDEPANEL] 🎯 Current mode state:', mode);
    console.log('[SIDEPANEL] 💼 Has session:', !!session);
    console.log('[SIDEPANEL] 📊 Session ID:', session?.id || 'none');

    if (!text.trim() && !imageData) {
      console.log('[SIDEPANEL] ⚠️ No text or image, returning early');
      return;
    }
    if (!token) {
      console.log('[SIDEPANEL] ⚠️ No token, returning early');
      return;
    }

    console.log('[SIDEPANEL] 🚀 Starting message send...');
    setSending(true);
    setError('');

    try {
      // 🎯 SMART DETECTION: New capture vs text follow-up
      // - Screen/Snip (imageData present) → ALWAYS start new session (/chat/start)
      // - Text follow-up (no imageData) → Continue session (/:sessionId/message)
      const isNewCapture = !!imageData;
      const isTextFollowup = !imageData && !!session;

      console.log('[SIDEPANEL] 🧠 Smart detection:');
      console.log('[SIDEPANEL]    isNewCapture:', isNewCapture);
      console.log('[SIDEPANEL]    isTextFollowup:', isTextFollowup);

      const url = isNewCapture
        ? `${API_URL}/chat/start` // New capture → always create new session
        : (session
            ? `${API_URL}/chat/${session.id}/message` // Text follow-up → use existing session
            : `${API_URL}/chat/start`); // First message ever → create session

      console.log('[SIDEPANEL] 🌐 API URL:', url);
      console.log('[SIDEPANEL] 💡 Reasoning:', isNewCapture
        ? 'New capture detected - creating fresh session (no conversation history sent)'
        : (isTextFollowup
            ? 'Text follow-up detected - continuing session (conversation history sent, NO images)'
            : 'First message ever - creating new session'));

      const body: any = {
        message: text,
      };

      // Include mode for: new sessions OR new captures
      const shouldIncludeMode = !session || isNewCapture;
      console.log('[SIDEPANEL] 🔍 Mode inclusion check:');
      console.log('[SIDEPANEL]    !session:', !session);
      console.log('[SIDEPANEL]    isNewCapture:', isNewCapture);
      console.log('[SIDEPANEL]    shouldIncludeMode:', shouldIncludeMode);

      if (shouldIncludeMode) {
        body.mode = mode;
        console.log('[SIDEPANEL] ✅ Including mode in request:', mode);
      } else {
        console.log('[SIDEPANEL] ⚠️ NOT including mode (will use session mode)');
      }

      if (imageData) {
        body.imageData = imageData;
        body.captureSource = captureSource;
        console.log('[SIDEPANEL] ✅ Added imageData and captureSource to request body');
      }

      console.log(`[SIDEPANEL] [${new Date().toISOString()}] 📤 Sending fetch request to: ${url}`);
      console.log('[SIDEPANEL] 📦 Body keys:', Object.keys(body));
      console.log('[SIDEPANEL] 📦 Full body (without imageData):', JSON.stringify({...body, imageData: imageData ? '[IMAGE_DATA]' : undefined}, null, 2));

      // ⏱️ Start timer RIGHT BEFORE sending request to backend
      // This measures actual backend processing time (not capture time)
      requestStartTime.current = Date.now();
      console.log(`[SIDEPANEL] [${new Date().toISOString()}] ⏱️ Starting fetch request to backend...`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const fetchTime = Date.now() - requestStartTime.current;
      console.log(`[SIDEPANEL] [${new Date().toISOString()}] 📬 Response received in ${fetchTime}ms - Status: ${res.status}, OK: ${res.ok}`);

      if (!res.ok) {
        console.error('[SIDEPANEL] ❌ Response not ok');
        const error = await res.json();
        console.error('[SIDEPANEL] ❌ Error response:', error);

        if (error.code === 'DAILY_LIMIT_REACHED') {
          const errorMsg = `Daily limit reached! Upgrade to ${error.plan === 'FREE' ? 'Basic or Pro' : 'Pro'} for more solves.`;
          console.error('[SIDEPANEL] ❌ Daily limit:', errorMsg);
          setError(errorMsg);
        } else {
          console.error('[SIDEPANEL] ❌ Other error:', error.error);
          throw new Error(error.error || 'Request failed');
        }
        return;
      }

      const parseStart = Date.now();
      console.log(`[SIDEPANEL] [${new Date().toISOString()}] ✅ Request successful, parsing response...`);
      const data = await res.json();
      const parseTime = Date.now() - parseStart;
      console.log(`[SIDEPANEL] [${new Date().toISOString()}] ✅ Response data parsed in ${parseTime}ms`);
      console.log('[SIDEPANEL] 📊 Session ID:', data.id);
      console.log('[SIDEPANEL] 📊 Messages count:', data.messages?.length || 0);

      // ⏱️ Calculate response time
      if (requestStartTime.current) {
        const elapsedTime = (Date.now() - requestStartTime.current) / 1000; // Convert to seconds
        setResponseTime(elapsedTime);
        console.log(`[SIDEPANEL] [${new Date().toISOString()}] ⏱️ Total backend response time: ${elapsedTime.toFixed(1)}s`);
        requestStartTime.current = null; // Reset timer
      }

      // Clear optimistic messages and show real response
      setOptimisticMessages([]);
      setSession(data);
      setInput('');
      const totalSendTime = Date.now() - sendStart;
      console.log(`[SIDEPANEL] [${new Date().toISOString()}] ✅ Message send complete! Total sendMessage time: ${totalSendTime}ms`);
    } catch (err: any) {
      console.error('[SIDEPANEL] ❌ Exception in sendMessage:');
      console.error('[SIDEPANEL] ❌ Error:', err);
      console.error('[SIDEPANEL] ❌ Error message:', err.message);
      console.error('[SIDEPANEL] ❌ Error stack:', err.stack);
      setError(err.message);
      setOptimisticMessages([]);
    } finally {
      console.log('[SIDEPANEL] 🏁 Finally block - setting sending to false');
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
            disabled={sending}
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

        {!session && optimisticMessages.length === 0 && (
          <div className="empty-state">
            <h3>Welcome to FratGPT!</h3>
            <p>Select a mode and start solving homework</p>
          </div>
        )}

        {/* Render real messages from session */}
        {session?.messages.map((msg, idx) => {
          // In EXPERT mode, skip individual provider messages (GEMINI, OPENAI, CLAUDE)
          // Show USER messages and a placeholder for the tabbed interface
          if (session.mode === 'EXPERT' && msg.role === 'ASSISTANT') {
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

              {/* In EXPERT mode with first ASSISTANT message, show tabbed interface */}
              {msg.role === 'ASSISTANT' && session.mode === 'EXPERT' && (() => {
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

            {msg.role === 'ASSISTANT' && session.mode !== 'EXPERT' && msg.shortAnswer && (() => {
              const msgSteps = parseSteps(msg);
              // Check if this is the most recent assistant message to show timer
              const assistantMessages = session.messages.filter(m => m.role === 'ASSISTANT');
              const isLatestAssistant = assistantMessages[assistantMessages.length - 1]?.id === msg.id;

              return (
                <div className="answer-box">
                  <div className="answer-label">Final Answer</div>
                  <div className="short-answer">{msg.shortAnswer}</div>

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

export default App;
