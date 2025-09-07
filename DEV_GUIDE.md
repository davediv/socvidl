# SocviDL Development Guide

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm 9+
- Chrome browser (version 90+)
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/socvidl.git
cd socvidl

# Install dependencies
npm install
```

## 🔥 Hot Reload Development

The extension now supports hot reload for faster development iteration. There are multiple ways to run the development environment:

### Method 1: Using CRXJS (Recommended)
```bash
# Start Vite dev server with CRXJS hot reload
npm run dev
```
This will:
- Start Vite development server on http://localhost:5173
- Enable HMR (Hot Module Replacement) for instant updates
- Auto-reload extension when files change
- Generate source maps for debugging

### Method 2: Build + Watch Mode
```bash
# Build and watch for changes with hot reload server
npm run watch:reload
```
This will:
- Build the extension in watch mode
- Start the hot reload WebSocket server
- Auto-reload the extension on file changes

### Method 3: Separate Processes
```bash
# Terminal 1: Run Vite in watch mode
npm run watch

# Terminal 2: Run hot reload server
npm run dev:server
```

## 📦 Loading the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked"
4. Select the `dist` folder in your project directory
5. The extension should now be loaded with the SocviDL icon in your toolbar

### For Development with Hot Reload:
- After running `npm run dev`, the extension will automatically reload when you make changes
- Content scripts will refresh when you reload the page
- Background scripts will reload automatically
- CSS changes apply instantly without page reload

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run dev:server` | Start hot reload WebSocket server only |
| `npm run dev:all` | Run both Vite and hot reload server |
| `npm run build` | Build extension for production |
| `npm run watch` | Build in watch mode |
| `npm run watch:reload` | Watch mode with hot reload |
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run format` | Format code with Prettier |
| `npm run clean` | Clean build directory |
| `npm run zip` | Build and create distribution ZIP |

## 🐛 Debugging

### Chrome DevTools
1. **Background Script**: 
   - Go to `chrome://extensions/`
   - Find SocviDL and click "Inspect views: service worker"

2. **Content Scripts**:
   - Right-click on any Twitter/Reddit page
   - Select "Inspect" 
   - Check Console for `[SocviDL]` prefixed logs

3. **Popup**:
   - Right-click the extension icon
   - Select "Inspect popup"

### Source Maps
Source maps are automatically generated in development mode for easier debugging:
- Set breakpoints directly in your source files
- View original source code in DevTools
- Stack traces show original file locations

## 🏗️ Project Structure

```
socvidl/
├── src/
│   ├── background/     # Background service worker
│   ├── content/        # Content scripts and styles
│   ├── utils/          # Utility functions and helpers
│   └── lib/            # Third-party libraries
├── public/             # Static assets and popup
├── assets/
│   └── icons/          # Extension icons
├── scripts/            # Build and dev scripts
├── dist/               # Built extension (git-ignored)
└── manifest.json       # Extension manifest
```

## 🔄 Hot Reload Features

The development environment provides several hot reload capabilities:

1. **Extension Reload**: Automatically reloads the entire extension when JS files change
2. **CSS Hot Update**: Instantly applies CSS changes without reloading
3. **Content Script Reload**: Refreshes content scripts on the current tab
4. **Background Script Reload**: Reloads service worker automatically
5. **Manifest Changes**: Full extension reload when manifest.json changes

## 📝 Development Tips

1. **Console Logs**: Use `console.log('[SocviDL]', ...)` prefix for easy filtering
2. **Error Handling**: Always wrap async operations in try-catch blocks
3. **Type Safety**: Although using JS now, consider TypeScript migration (INFRA-P1-003)
4. **Performance**: Use Chrome DevTools Performance tab to profile
5. **Memory**: Monitor memory usage in Task Manager (Shift+Esc in Chrome)

## 🚨 Common Issues

### Hot Reload Not Working
- Ensure the WebSocket server is running (port 9090)
- Check if Windows Firewall or antivirus is blocking WebSocket connections
- Try reloading the extension manually once

### Extension Not Loading
- Make sure you're loading the `dist` folder, not the project root
- Run `npm run build` first if `dist` doesn't exist
- Check for errors in `chrome://extensions/`

### Changes Not Reflecting
- Clear Chrome cache: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Manually reload extension from `chrome://extensions/`
- Check console for any build errors

## 🤝 Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes and test thoroughly
3. Run linting and formatting: `npm run lint && npm run format`
4. Commit with descriptive message
5. Push and create a Pull Request

## 📚 Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Vite Documentation](https://vitejs.dev/)
- [CRXJS Documentation](https://crxjs.dev/vite-plugin/)