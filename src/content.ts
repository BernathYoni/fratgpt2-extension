// Content script for snip overlay and auth sync bridge
console.log('='.repeat(80));
console.log('[CONTENT] 🚀 FratGPT content script loaded on:', window.location.href);
console.log('[CONTENT] ⏰ Time:', new Date().toISOString());
console.log('[CONTENT] 📍 Document ready state:', document.readyState);
console.log('='.repeat(80));

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
console.log('[CONTENT] 🔊 Registering message listener...');
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[CONTENT] 📨 Message received:', message);
  console.log('[CONTENT] 👤 Sender:', sender);

  if (message.type === 'START_SNIP') {
    console.log('[CONTENT] ✅ START_SNIP message received, starting snip mode...');
    startSnipMode();
    sendResponse({ success: true });
    console.log('[CONTENT] ✅ Response sent');
    return true;
  }

  if (message.type === 'CANCEL_SNIP') {
    console.log('[CONTENT] ✅ CANCEL_SNIP message received, canceling snip mode...');
    cancelSnipMode();
    sendResponse({ success: true });
    console.log('[CONTENT] ✅ Response sent');
    return true;
  }

  console.log('[CONTENT] ⚠️ Unknown message type:', message.type);
});
console.log('[CONTENT] ✅ Message listener registered');

function startSnipMode() {
  console.log('[CONTENT] 🎬 startSnipMode function called');
  console.log('[CONTENT] 📊 Current isSnipping state:', isSnipping);

  if (isSnipping) {
    console.log('[CONTENT] ⚠️ Already snipping, returning');
    return;
  }
  isSnipping = true;
  console.log('[CONTENT] ✅ Set isSnipping = true');

  // Create overlay
  console.log('[CONTENT] 🎨 Creating overlay element...');
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

  console.log('[CONTENT] 📎 Appending overlay to document.body...');
  document.body.appendChild(overlay);
  console.log('[CONTENT] 📎 Appending selectionBox to document.body...');
  document.body.appendChild(selectionBox);
  console.log('[CONTENT] ✅ Elements appended to DOM');

  // Add event listeners
  console.log('[CONTENT] 🎧 Adding event listeners...');
  overlay.addEventListener('mousedown', handleMouseDown);
  overlay.addEventListener('mousemove', handleMouseMove);
  overlay.addEventListener('mouseup', handleMouseUp);
  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    cancelSnipMode();
  });

  // Add ESC key listener
  document.addEventListener('keydown', handleKeyDown);
  console.log('[CONTENT] ✅ Event listeners added');
  console.log('[CONTENT] 🎉 Snip mode started successfully! You can now select an area.');
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

  console.log('[CONTENT] 🖱️ Mouse up event');
  console.log('[CONTENT] 📏 Selection width:', width, 'height:', height);

  // Minimum selection size
  if (width < 10 || height < 10) {
    console.log('[CONTENT] ⚠️ Selection too small, canceling');
    cancelSnipMode();
    return;
  }

  const left = Math.min(currentX, startX);
  const top = Math.min(currentY, startY);

  const coords = {
    x: left * window.devicePixelRatio,
    y: top * window.devicePixelRatio,
    width: width * window.devicePixelRatio,
    height: height * window.devicePixelRatio,
  };

  console.log('[CONTENT] 📐 Final coordinates (with device pixel ratio):', JSON.stringify(coords, null, 2));
  console.log('[CONTENT] 📱 Device pixel ratio:', window.devicePixelRatio);

  // IMMEDIATELY remove the overlay and selection box (before sending message)
  console.log('[CONTENT] 🗑️ Removing overlay and selection box IMMEDIATELY');
  cancelSnipMode();

  console.log('[CONTENT] 📤 Sending SNIP_COMPLETE message to sidepanel...');

  // Send coordinates to background
  chrome.runtime.sendMessage({
    type: 'SNIP_COMPLETE',
    coords: coords,
  });

  console.log('[CONTENT] ✅ SNIP_COMPLETE message sent');
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    cancelSnipMode();
  }
}

function cancelSnipMode() {
  console.log('[CONTENT] 🧹 cancelSnipMode called, isSnipping:', isSnipping);
  if (!isSnipping) return;
  isSnipping = false;

  // Remove event listeners from overlay before removing it
  if (overlay) {
    console.log('[CONTENT] 🗑️ Removing overlay and its event listeners');
    overlay.removeEventListener('mousedown', handleMouseDown);
    overlay.removeEventListener('mousemove', handleMouseMove);
    overlay.removeEventListener('mouseup', handleMouseUp);
    overlay.remove();
    overlay = null;
  }

  if (selectionBox) {
    console.log('[CONTENT] 🗑️ Removing selection box');
    selectionBox.remove();
    selectionBox = null;
  }

  document.removeEventListener('keydown', handleKeyDown);
  console.log('[CONTENT] ✅ Snip mode fully canceled');
}

console.log('='.repeat(80));
console.log('[CONTENT] 🎉 FratGPT content script fully initialized!');
console.log('[CONTENT] 📋 Available commands: START_SNIP, CANCEL_SNIP');
console.log('[CONTENT] 🔍 Ready to receive messages from sidepanel');
console.log('='.repeat(80));
