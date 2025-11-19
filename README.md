# FratGPT 2.0 Chrome Extension

Chrome Manifest V3 extension for FratGPT.

## Features

- **Sidepanel chat interface** with message history
- **Screen capture** - Capture visible tab
- **Snip tool** - Select region with drag-to-select overlay
- **Three modes**: Fast, Regular, Expert
- **Expert mode tabs**: View responses from Gemini, ChatGPT, Claude, plus Consensus
- **JWT authentication** synced with web app
- **Rate limit handling** with upgrade prompts

## Tech Stack

- **Manifest**: V3
- **UI**: React 18 + TypeScript
- **Build**: Webpack
- **Permissions**: activeTab, storage, sidePanel

## Development

### Prerequisites

- Node.js 20+
- Running backend API

### Build

```bash
# Install dependencies
npm install

# Development build (watch mode)
npm run dev

# Production build
npm run build
```

### Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

### Testing

1. Click the extension icon to open sidepanel
2. Log in with your FratGPT account
3. Select a mode (Fast/Regular/Expert)
4. Click "Screen" to capture or "Snip" to select a region
5. Type a question or let it solve the screenshot
6. For Expert mode, use tabs to view different AI responses

## API Configuration

Update `API_URL` in `src/sidepanel/App.tsx`:

```typescript
const API_URL = 'https://your-backend.up.railway.app';
```

## Publishing to Chrome Web Store

1. Build production version: `npm run build`
2. Zip the `dist/` folder
3. Upload to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
4. Add icons (16x16, 48x48, 128x128) to `public/`
5. Fill out store listing details
6. Submit for review

## Architecture

- **background.ts** - Service worker for screen/snip capture
- **content.ts** - Injected script for snip overlay
- **sidepanel/** - React app for chat UI
  - **App.tsx** - Main component with auth, chat, modes
  - **styles.css** - UI styling

## License

MIT
