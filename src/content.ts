// Content script for snip overlay

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
