// Content script for snip overlay and auth sync bridge
console.log('[CONTENT] 🚀 FratGPT content script loaded on:', window.location.href);
console.log('[CONTENT] ⏰ Time:', new Date().toISOString());

// AUTH SYNC BRIDGE: Listen for messages from website via window.postMessage
window.addEventListener('message', (event) => {
  // Only accept messages from same origin (fratgpt.co)
  if (event.origin !== window.location.origin) {
    return;
  }

  console.log('[CONTENT] 📨 Received window message:', event.data);

  // Forward FRATGPT auth messages to background
  if (event.data.type === 'FRATGPT_SET_TOKEN') {
    console.log('[CONTENT] ✅ Token message detected, forwarding to background...');
    console.log('[CONTENT] 🔑 Token preview:', event.data.token ? event.data.token.substring(0, 20) + '...' : 'MISSING');

    chrome.runtime.sendMessage(
      { type: 'SET_TOKEN', token: event.data.token },
      (response) => {
        console.log('[CONTENT] 📬 Background response:', response);

        // Send response back to website
        window.postMessage({
          type: 'FRATGPT_AUTH_RESPONSE',
          success: response?.success || false,
          error: response?.error
        }, '*');
      }
    );
  }

  if (event.data.type === 'FRATGPT_REMOVE_TOKEN') {
    console.log('[CONTENT] ✅ Remove token message detected, forwarding to background...');

    chrome.runtime.sendMessage(
      { type: 'REMOVE_TOKEN' },
      (response) => {
        console.log('[CONTENT] 📬 Background response:', response);

        // Send response back to website
        window.postMessage({
          type: 'FRATGPT_AUTH_RESPONSE',
          success: response?.success || false,
          error: response?.error
        }, '*');
      }
    );
  }
});

console.log('[CONTENT] ✅ Auth bridge initialized - ready to relay messages');

let isSnipping = false;
let overlay: HTMLDivElement | null = null;
let startX = 0;
let startY = 0;
let selectionBox: HTMLDivElement | null = null;

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SNIP') {
    startSnipMode();
    sendResponse({ success: true });
  }

  if (message.type === 'CANCEL_SNIP') {
    cancelSnipMode();
    sendResponse({ success: true });
  }
});

function startSnipMode() {
  if (isSnipping) return;
  isSnipping = true;

  // Create overlay
  overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.3);
    cursor: crosshair;
    z-index: 2147483647;
  `;

  // Create selection box
  selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed;
    border: 2px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    display: none;
    z-index: 2147483648;
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(selectionBox);

  // Add event listeners
  overlay.addEventListener('mousedown', handleMouseDown);
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mouseup', handleMouseUp);
  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancelSnipMode();
  });

  // Add ESC key listener
  document.addEventListener('keydown', handleKeyDown);
}

function handleMouseDown(e: MouseEvent) {
  startX = e.clientX;
  startY = e.clientY;
  if (selectionBox) {
    selectionBox.style.display = 'block';
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  }
}

function handleMouseMove(e: MouseEvent) {
  if (!selectionBox || selectionBox.style.display === 'none') return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  selectionBox.style.left = left + 'px';
  selectionBox.style.top = top + 'px';
  selectionBox.style.width = width + 'px';
  selectionBox.style.height = height + 'px';
}

function handleMouseUp(e: MouseEvent) {
  if (!selectionBox) return;

  const currentX = e.clientX;
  const currentY = e.clientY;

  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);

  // Minimum selection size
  if (width < 10 || height < 10) {
    cancelSnipMode();
    return;
  }

  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  // Send coordinates to background
  chrome.runtime.sendMessage({
    type: 'SNIP_COMPLETE',
    coords: {
      x: left * window.devicePixelRatio,
      y: top * window.devicePixelRatio,
      width: width * window.devicePixelRatio,
      height: height * window.devicePixelRatio,
    },
  });

  cancelSnipMode();
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelSnipMode();
  }
}

function cancelSnipMode() {
  if (!isSnipping) return;
  isSnipping = false;

  if (overlay) {
    overlay.remove();
    overlay = null;
  }

  if (selectionBox) {
    selectionBox.remove();
    selectionBox = null;
  }

  document.removeEventListener('keydown', handleKeyDown);
}

console.log('FratGPT content script loaded');
