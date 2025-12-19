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
    pointer-events: auto !important;
  `;

  // Create selection box
  selectionBox = document.createElement('div');
  selectionBox.style.cssText = `
    position: fixed;
    border: 2px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    display: none;
    z-index: 2147483648;
    pointer-events: none;
  `;

  console.log('[CONTENT] 📎 Appending overlay to document.body...');
  document.body.appendChild(overlay);
  console.log('[CONTENT] 📎 Appending selectionBox to document.body...');
  document.body.appendChild(selectionBox);
  console.log('[CONTENT] ✅ Elements appended to DOM');

  // Add event listeners to BOTH overlay and window (for maximum compatibility)
  // Use capture phase (true) to run BEFORE site's handlers
  console.log('[CONTENT] 🎧 Adding event listeners with capture phase...');

  // Overlay listeners (primary)
  overlay.addEventListener('mousedown', handleMouseDown, true);
  overlay.addEventListener('mousemove', handleMouseMove, true);
  overlay.addEventListener('mouseup', handleMouseUp, true);
  overlay.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    cancelSnipMode();
  }, true);

  // Window listeners (fallback for sites that intercept events)
  window.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('mousemove', handleMouseMove, true);
  window.addEventListener('mouseup', handleMouseUp, true);

  // Add ESC key listener
  document.addEventListener('keydown', handleKeyDown, true);
  console.log('[CONTENT] ✅ Event listeners added (capture phase + window fallback)');
  console.log('[CONTENT] 🎉 Snip mode started successfully! You can now select an area.');
}

function handleMouseDown(e: MouseEvent) {
  if (!isSnipping) return;

  // Prevent site's handlers from interfering
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

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
  if (!isSnipping || !selectionBox || selectionBox.style.display === 'none') return;

  // Prevent site's handlers from interfering
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

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
  if (!isSnipping || !selectionBox) return;

  // Prevent site's handlers from interfering
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

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
    overlay.removeEventListener('mousedown', handleMouseDown, true);
    overlay.removeEventListener('mousemove', handleMouseMove, true);
    overlay.removeEventListener('mouseup', handleMouseUp, true);
    overlay.remove();
    overlay = null;
  }

  // Remove window-level listeners (fallback)
  console.log('[CONTENT] 🗑️ Removing window event listeners');
  window.removeEventListener('mousedown', handleMouseDown, true);
  window.removeEventListener('mousemove', handleMouseMove, true);
  window.removeEventListener('mouseup', handleMouseUp, true);

  if (selectionBox) {
    console.log('[CONTENT] 🗑️ Removing selection box');
    selectionBox.remove();
    selectionBox = null;
  }

  document.removeEventListener('keydown', handleKeyDown, true);
  console.log('[CONTENT] ✅ Snip mode fully canceled');
}

// =============================================================================
// TEXT HIGHLIGHT TO SOLVE FEATURE
// =============================================================================

let textSolvePopup: HTMLDivElement | null = null;
let hidePopupTimeout: NodeJS.Timeout | null = null;

// Create the "Solve" popup element
function createTextSolvePopup(): HTMLDivElement {
  const popup = document.createElement('div');
  popup.id = 'fratgpt-text-solve-popup';
  popup.style.cssText = `
    position: absolute;
    background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    z-index: 2147483646;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(249, 115, 22, 0.3);
    display: none;
    user-select: none;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  `;
  popup.innerHTML = '🎓 Solve with FratGPT';

  // Hover effect
  popup.addEventListener('mouseenter', () => {
    popup.style.transform = 'translateY(-2px)';
    popup.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(249, 115, 22, 0.5)';
  });

  popup.addEventListener('mouseleave', () => {
    popup.style.transform = 'translateY(0)';
    popup.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(249, 115, 22, 0.3)';
  });

  // Click handler
  popup.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText) {
      console.log('[CONTENT] No text selected');
      hideTextSolvePopup();
      return;
    }

    console.log('[CONTENT] ✅ Solve button clicked, selected text:', selectedText.substring(0, 50) + '...');

    // Hide popup immediately
    hideTextSolvePopup();

    // Clear the text selection
    selection?.removeAllRanges();

    // Send message to background to initiate solve
    chrome.runtime.sendMessage({
      type: 'SOLVE_TEXT',
      text: selectedText,
      sourceUrl: window.location.href
    }, (response) => {
      console.log('[CONTENT] 📬 Response from background:', response);
    });
  });

  document.body.appendChild(popup);
  return popup;
}

// Show popup at selection position
function showTextSolvePopup() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideTextSolvePopup();
    return;
  }

  const selectedText = selection.toString().trim();

  // Ignore very short selections (likely accidental)
  if (selectedText.length < 3) {
    hideTextSolvePopup();
    return;
  }

  // Don't show popup if we're in snip mode
  if (isSnipping) {
    return;
  }

  console.log('[CONTENT] 📝 Text selected, showing solve popup...');

  // Create popup if it doesn't exist
  if (!textSolvePopup) {
    textSolvePopup = createTextSolvePopup();
  }

  // Get selection bounding rectangle
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Calculate popup position (centered below selection)
  const popupWidth = 180; // Approximate width
  const popupHeight = 36; // Approximate height
  const spacing = 8; // Space between selection and popup

  let left = rect.left + (rect.width / 2) - (popupWidth / 2) + window.scrollX;
  let top = rect.bottom + spacing + window.scrollY;

  // Ensure popup stays within viewport bounds
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Adjust horizontal position if too far left or right
  if (left < 10) left = 10;
  if (left + popupWidth > viewportWidth - 10) {
    left = viewportWidth - popupWidth - 10;
  }

  // If popup would be below viewport, show above selection instead
  if (rect.bottom + spacing + popupHeight > viewportHeight + window.scrollY) {
    top = rect.top - popupHeight - spacing + window.scrollY;
  }

  textSolvePopup.style.left = `${left}px`;
  textSolvePopup.style.top = `${top}px`;
  textSolvePopup.style.display = 'block';

  // Clear any existing hide timeout
  if (hidePopupTimeout) {
    clearTimeout(hidePopupTimeout);
    hidePopupTimeout = null;
  }
}

// Hide popup
function hideTextSolvePopup() {
  if (textSolvePopup) {
    textSolvePopup.style.display = 'none';
  }

  if (hidePopupTimeout) {
    clearTimeout(hidePopupTimeout);
    hidePopupTimeout = null;
  }
}

// Handle text selection changes
function handleSelectionChange() {
  // Clear existing timeout
  if (hidePopupTimeout) {
    clearTimeout(hidePopupTimeout);
    hidePopupTimeout = null;
  }

  // Debounce: wait 200ms after selection stops changing
  hidePopupTimeout = setTimeout(() => {
    showTextSolvePopup();
  }, 200);
}

// Handle mouseup (selection completed)
function handleMouseUpForText(e: MouseEvent) {
  // Don't interfere with snip mode
  if (isSnipping) return;

  // Small delay to ensure selection is finalized
  setTimeout(() => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      showTextSolvePopup();
    }
  }, 50);
}

// Hide popup when clicking outside
function handleDocumentClick(e: MouseEvent) {
  if (textSolvePopup && e.target !== textSolvePopup && !textSolvePopup.contains(e.target as Node)) {
    const selection = window.getSelection();
    if (selection && selection.isCollapsed) {
      hideTextSolvePopup();
    }
  }
}

// Initialize text selection listeners
console.log('[CONTENT] 🎯 Initializing text highlight-to-solve feature...');
document.addEventListener('selectionchange', handleSelectionChange);
document.addEventListener('mouseup', handleMouseUpForText);
document.addEventListener('click', handleDocumentClick);
console.log('[CONTENT] ✅ Text highlight listeners registered');

console.log('='.repeat(80));
console.log('[CONTENT] 🎉 FratGPT content script fully initialized!');
console.log('[CONTENT] 📋 Available commands: START_SNIP, CANCEL_SNIP');
console.log('[CONTENT] 🔍 Ready to receive messages from sidepanel');
console.log('[CONTENT] 📝 Text highlight-to-solve: ACTIVE');
console.log('='.repeat(80));
