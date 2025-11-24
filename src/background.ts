// Background service worker for FratGPT extension
import { compressBase64Image } from './utils/imageCompression';

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
    console.log('[BACKGROUND] 📸 Starting screen capture...');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      console.error('[BACKGROUND] ❌ No active tab');
      sendResponse({ error: 'No active tab' });
      return;
    }

    console.log('[BACKGROUND] 📸 Capturing visible tab...');
    const dataUrl = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });
    console.log('[BACKGROUND] ✅ Screen captured, size:', (dataUrl.length / 1024).toFixed(2), 'KB');

    // ✨ Compress the screen capture ✨
    console.log('[BACKGROUND] 🗜️  Compressing screen capture...');
    const result = await compressBase64Image(dataUrl, {
      maxSizeMB: 0.5,           // 500KB max for screen captures
      maxWidthOrHeight: 1200,   // Resize to 1200px max dimension
      quality: 0.85,            // 85% quality
      skipIfSmall: true,        // Skip compression if already small
    });

    console.log('[BACKGROUND] ✅ SCREEN CAPTURE COMPLETE!');
    console.log('[BACKGROUND] 📊 Compression Stats:');
    console.log('[BACKGROUND]    Original:', result.originalSize, 'KB');
    console.log('[BACKGROUND]    Compressed:', result.compressedSize, 'KB');
    console.log('[BACKGROUND]    Saved:', result.reductionPercent, '%');

    sendResponse({
      imageData: result.compressed,
      compressionStats: {
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        reductionPercent: result.reductionPercent,
      }
    });
  } catch (error: any) {
    console.error('[BACKGROUND] ❌ Screen capture failed:', error);
    sendResponse({ error: error.message });
  }
}

async function handleCaptureSnip(coords: { x: number; y: number; width: number; height: number }, sendResponse: (response: any) => void) {
  try {
    console.log('[BACKGROUND] 📸 Starting snip capture...');
    console.log('[BACKGROUND] 📏 Coordinates:', JSON.stringify(coords, null, 2));

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      console.error('[BACKGROUND] ❌ No active tab found');
      sendResponse({ error: 'No active tab' });
      return;
    }
    console.log('[BACKGROUND] ✅ Active tab found:', tab.id);

    // Capture full visible tab
    console.log('[BACKGROUND] 📸 Capturing full visible tab...');
    const fullScreenshot = await chrome.tabs.captureVisibleTab({
      format: 'png',
    });
    console.log('[BACKGROUND] ✅ Full screenshot captured, data URL length:', fullScreenshot.length);

    // Crop the image using OffscreenCanvas (works in service workers)
    console.log('[BACKGROUND] ✂️ Starting crop operation...');
    const croppedImage = await cropImageWithOffscreenCanvas(fullScreenshot, coords);
    console.log('[BACKGROUND] ✅ Image cropped successfully, size:', (croppedImage.length / 1024).toFixed(2), 'KB');

    // ✨ Compress the snip ✨
    console.log('[BACKGROUND] 🗜️  Compressing snip...');
    const result = await compressBase64Image(croppedImage, {
      maxSizeMB: 0.3,           // 300KB max for snips (smaller than screen)
      maxWidthOrHeight: 1200,   // Resize to 1200px max dimension
      quality: 0.85,            // 85% quality
      skipIfSmall: true,        // Skip compression if already small
    });

    console.log('[BACKGROUND] ✅ SNIP CAPTURE COMPLETE!');
    console.log('[BACKGROUND] 📊 Compression Stats:');
    console.log('[BACKGROUND]    Original:', result.originalSize, 'KB');
    console.log('[BACKGROUND]    Compressed:', result.compressedSize, 'KB');
    console.log('[BACKGROUND]    Saved:', result.reductionPercent, '%');

    sendResponse({
      imageData: result.compressed,
      compressionStats: {
        originalSize: result.originalSize,
        compressedSize: result.compressedSize,
        reductionPercent: result.reductionPercent,
      }
    });
  } catch (error: any) {
    console.error('[BACKGROUND] ❌ SNIP CAPTURE FAILED!');
    console.error('[BACKGROUND] ❌ Error name:', error.name);
    console.error('[BACKGROUND] ❌ Error message:', error.message);
    console.error('[BACKGROUND] ❌ Error stack:', error.stack);
    console.error('[BACKGROUND] ❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    sendResponse({ error: error.message });
  }
}

// New function that works in service workers without Image constructor
async function cropImageWithOffscreenCanvas(
  dataUrl: string,
  coords: { x: number; y: number; width: number; height: number }
): Promise<string> {
  console.log('[BACKGROUND] 🖼️ cropImageWithOffscreenCanvas function started');
  console.log('[BACKGROUND] 📊 Input dataUrl length:', dataUrl.length);
  console.log('[BACKGROUND] 📊 Input coords:', JSON.stringify(coords, null, 2));

  try {
    // Convert data URL to blob
    console.log('[BACKGROUND] 🔄 Converting data URL to blob...');
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    console.log('[BACKGROUND] ✅ Blob created from data URL, size:', blob.size);

    // Create ImageBitmap from blob (works in service workers!)
    console.log('[BACKGROUND] 🖼️ Creating ImageBitmap from blob...');
    const imageBitmap = await createImageBitmap(blob);
    console.log('[BACKGROUND] ✅ ImageBitmap created, dimensions:', imageBitmap.width, 'x', imageBitmap.height);

    // Create OffscreenCanvas with cropped dimensions
    console.log('[BACKGROUND] 🎨 Creating OffscreenCanvas with dimensions:', coords.width, 'x', coords.height);
    const canvas = new OffscreenCanvas(coords.width, coords.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get 2d context from OffscreenCanvas');
    }
    console.log('[BACKGROUND] ✅ Canvas context obtained');

    // Draw the cropped portion
    console.log('[BACKGROUND] ✂️ Drawing cropped portion to canvas...');
    console.log('[BACKGROUND] 📐 Source rect: x=' + coords.x + ', y=' + coords.y + ', w=' + coords.width + ', h=' + coords.height);
    console.log('[BACKGROUND] 📐 Dest rect: x=0, y=0, w=' + coords.width + ', h=' + coords.height);

    ctx.drawImage(
      imageBitmap,
      coords.x,      // source x
      coords.y,      // source y
      coords.width,  // source width
      coords.height, // source height
      0,             // dest x
      0,             // dest y
      coords.width,  // dest width
      coords.height  // dest height
    );
    console.log('[BACKGROUND] ✅ Image drawn to canvas');

    // Convert canvas to blob
    console.log('[BACKGROUND] 💾 Converting canvas to blob...');
    const croppedBlob = await canvas.convertToBlob({ type: 'image/png' });
    console.log('[BACKGROUND] ✅ Cropped blob created, size:', croppedBlob.size);

    // Convert blob to data URL
    console.log('[BACKGROUND] 📖 Converting blob to data URL...');
    const reader = new FileReader();
    const dataUrlPromise = new Promise<string>((resolve, reject) => {
      reader.onloadend = () => {
        console.log('[BACKGROUND] ✅ Data URL created successfully');
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        console.error('[BACKGROUND] ❌ FileReader error');
        reject(new Error('Failed to read blob as data URL'));
      };
    });

    reader.readAsDataURL(croppedBlob);
    return await dataUrlPromise;

  } catch (error: any) {
    console.error('[BACKGROUND] ❌ Error in cropImageWithOffscreenCanvas:', error);
    console.error('[BACKGROUND] ❌ Error stack:', error.stack);
    throw error;
  }
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
