// Background service worker for FratGPT extension

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for storage changes (auth sync with website)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.fratgpt_token) {
    const newToken = changes.fratgpt_token.newValue;
    const oldToken = changes.fratgpt_token.oldValue;

    // Token changed - reload sidepanel to update UI
    if (newToken !== oldToken) {
      console.log('Auth token changed, extension will sync on next open');
      // The sidepanel will automatically pick up the new token on load
    }
  }
});

// Listen for messages from website, sidepanel, and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle auth sync from website
  if (message.type === 'SET_TOKEN') {
    chrome.storage.sync.set({ fratgpt_token: message.token }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'REMOVE_TOKEN') {
    chrome.storage.sync.remove('fratgpt_token', () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'CAPTURE_SCREEN') {
    handleCaptureScreen(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CAPTURE_SNIP') {
    handleCaptureSnip(message.coords, sendResponse);
    return true;
  }
});

async function handleCaptureScreen(sendResponse: (response: any) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      sendResponse({ error: 'No active tab' });
      return;
    }

    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });

    sendResponse({ imageData: dataUrl });
  } catch (error: any) {
    console.error('Screen capture failed:', error);
    sendResponse({ error: error.message });
  }
}

async function handleCaptureSnip(coords: { x: number; y: number; width: number; height: number }, sendResponse: (response: any) => void) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      sendResponse({ error: 'No active tab' });
      return;
    }

    // Capture full visible tab
    const fullScreenshot = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });

    // Crop the image using canvas
    const croppedImage = await cropImage(fullScreenshot, coords);
    sendResponse({ imageData: croppedImage });
  } catch (error: any) {
    console.error('Snip capture failed:', error);
    sendResponse({ error: error.message });
  }
}

function cropImage(
  dataUrl: string,
  coords: { x: number; y: number; width: number; height: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(coords.width, coords.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        coords.x,
        coords.y,
        coords.width,
        coords.height,
        0,
        0,
        coords.width,
        coords.height
      );

      canvas.convertToBlob({ type: 'image/png' }).then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

console.log('FratGPT background service worker loaded');
