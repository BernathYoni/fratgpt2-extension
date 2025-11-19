// Background service worker for FratGPT extension
console.log('='.repeat(80));
console.log('[BACKGROUND] 🚀 FratGPT background service worker starting...');
console.log('[BACKGROUND] ⏰ Loaded at:', new Date().toISOString());
console.log('[BACKGROUND] 🔧 Chrome version:', navigator.userAgent);
console.log('[BACKGROUND] 📦 Manifest version:', chrome.runtime.getManifest().version);
console.log('='.repeat(80));

// Open sidepanel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Listen for storage changes (auth sync with website)
console.log('[BACKGROUND] 🔊 Registering storage change listener...');
chrome.storage.onChanged.addListener((changes, areaName) => {
  console.log('[BACKGROUND] 💾 Storage changed!');
  console.log('[BACKGROUND] Area:', areaName);
  console.log('[BACKGROUND] Changes:', changes);

  if (areaName === 'sync' && changes.fratgpt_token) {
    const newToken = changes.fratgpt_token.newValue;
    const oldToken = changes.fratgpt_token.oldValue;

    console.log('[BACKGROUND] 🔑 Token change detected!');
    console.log('[BACKGROUND] Old token:', oldToken ? oldToken.substring(0, 20) + '...' : 'NONE');
    console.log('[BACKGROUND] New token:', newToken ? newToken.substring(0, 20) + '...' : 'NONE');

    // Token changed - reload sidepanel to update UI
    if (newToken !== oldToken) {
      console.log('[BACKGROUND] ✅ Token changed, sidepanel will sync on next open');
      // The sidepanel will automatically pick up the new token on load
    }
  } else {
    console.log('[BACKGROUND] ℹ️ Not a fratgpt_token change in sync storage');
  }
});
console.log('[BACKGROUND] ✓ Storage change listener registered');

// Listen for messages from website, sidepanel, and content script
console.log('[BACKGROUND] 🔊 Registering message listener...');
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('='.repeat(80));
  console.log('[BACKGROUND] 🎯 MESSAGE LISTENER TRIGGERED!');
  console.log('[BACKGROUND] ⏰ Time:', new Date().toISOString());
  console.log('[BACKGROUND] 📨 Full message object:', JSON.stringify(message, null, 2));
  console.log('[BACKGROUND] 📍 Full sender object:', JSON.stringify(sender, null, 2));
  console.log('[BACKGROUND] Message type:', message?.type);
  console.log('[BACKGROUND] Sender URL:', sender.url || sender.tab?.url || 'unknown');
  console.log('[BACKGROUND] Sender origin:', sender.origin);
  console.log('[BACKGROUND] Sender ID:', sender.id);
  console.log('='.repeat(80));

  // Handle auth sync from website
  if (message.type === 'SET_TOKEN') {
    console.log('[BACKGROUND] ✅ Matched SET_TOKEN handler');
    console.log('[BACKGROUND] 🔐 Token received:', message.token ? message.token.substring(0, 20) + '...' : 'MISSING');
    console.log('[BACKGROUND] 🔐 Token length:', message.token ? message.token.length : 0);

    if (!message.token) {
      console.error('[BACKGROUND] ❌ ERROR: No token in message!');
      sendResponse({ success: false, error: 'No token provided' });
      return true;
    }

    console.log('[BACKGROUND] 💾 Calling chrome.storage.sync.set...');
    chrome.storage.sync.set({ fratgpt_token: message.token }, () => {
      if (chrome.runtime.lastError) {
        console.error('[BACKGROUND] ❌ ERROR saving token:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[BACKGROUND] ✅ Token saved to chrome.storage.sync successfully!');

        // Verify it was actually saved
        chrome.storage.sync.get(['fratgpt_token'], (result) => {
          console.log('[BACKGROUND] 🔍 Verification read from storage:', result);
          if (result.fratgpt_token) {
            console.log('[BACKGROUND] ✅ VERIFIED: Token exists in storage:', result.fratgpt_token.substring(0, 20) + '...');
          } else {
            console.error('[BACKGROUND] ❌ VERIFICATION FAILED: Token not found in storage!');
          }
        });

        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
  }

  if (message.type === 'REMOVE_TOKEN') {
    console.log('[BACKGROUND] ✅ Matched REMOVE_TOKEN handler');
    console.log('[BACKGROUND] 🚪 Removing token from storage...');
    chrome.storage.sync.remove('fratgpt_token', () => {
      if (chrome.runtime.lastError) {
        console.error('[BACKGROUND] ❌ ERROR removing token:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[BACKGROUND] ✅ Token removed from chrome.storage.sync');
        sendResponse({ success: true });
      }
    });
    return true; // Keep channel open for async response
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

console.log('='.repeat(80));
console.log('[BACKGROUND] ✅ ALL EVENT LISTENERS REGISTERED');
console.log('[BACKGROUND] 🎧 Now listening for:');
console.log('[BACKGROUND]    - Messages from fratgpt.co website');
console.log('[BACKGROUND]    - Messages from sidepanel');
console.log('[BACKGROUND]    - Messages from content scripts');
console.log('[BACKGROUND]    - Storage changes');
console.log('[BACKGROUND] 🔍 Checking current storage state...');

// Check what's currently in storage on startup
chrome.storage.sync.get(['fratgpt_token'], (result) => {
  console.log('[BACKGROUND] 📦 Current storage state:', result);
  if (result.fratgpt_token) {
    console.log('[BACKGROUND] ✅ Token found in storage:', result.fratgpt_token.substring(0, 20) + '...');
  } else {
    console.log('[BACKGROUND] ℹ️ No token in storage yet');
  }
});

console.log('[BACKGROUND] 🚀 Ready to receive messages!');
console.log('='.repeat(80));
