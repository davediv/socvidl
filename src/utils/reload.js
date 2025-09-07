/**
 * Hot reload client for Chrome extension development
 * This module enables automatic reloading of the extension during development
 */

const RELOAD_PORT = 9090;
const RECONNECT_INTERVAL = 1000;

let ws = null;
let reconnectTimer = null;

/**
 * Initialize WebSocket connection for hot reload
 */
function initReloadClient() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  connectWebSocket();
}

/**
 * Connect to the reload WebSocket server
 */
function connectWebSocket() {
  try {
    ws = new WebSocket(`ws://localhost:${RELOAD_PORT}`);

    ws.onopen = () => {
      console.log('[SocviDL] Hot reload connected');
      clearTimeout(reconnectTimer);
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleReloadMessage(message);
    };

    ws.onclose = () => {
      console.log('[SocviDL] Hot reload disconnected');
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('[SocviDL] Hot reload error:', error);
      ws = null;
    };
  } catch (error) {
    console.error('[SocviDL] Failed to connect hot reload:', error);
    scheduleReconnect();
  }
}

/**
 * Schedule WebSocket reconnection
 */
function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    console.log('[SocviDL] Attempting to reconnect hot reload...');
    connectWebSocket();
  }, RECONNECT_INTERVAL);
}

/**
 * Handle reload messages from the server
 * @param {Object} message - Reload message
 */
function handleReloadMessage(message) {
  switch (message.type) {
    case 'reload-extension':
      console.log('[SocviDL] Reloading extension...');
      chrome.runtime.reload();
      break;
    
    case 'reload-tab':
      console.log('[SocviDL] Reloading current tab...');
      window.location.reload();
      break;
    
    case 'reload-content':
      console.log('[SocviDL] Reloading content scripts...');
      // Content scripts will be reloaded when the tab refreshes
      window.location.reload();
      break;
    
    case 'update-css':
      console.log('[SocviDL] Updating styles...');
      updateStyles();
      break;
    
    default:
      console.log('[SocviDL] Unknown reload message:', message);
  }
}

/**
 * Update styles without full page reload
 */
function updateStyles() {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && href.includes('socvidl')) {
      const url = new URL(href, window.location.origin);
      url.searchParams.set('t', Date.now());
      link.setAttribute('href', url.toString());
    }
  });
}

// Export for use in other modules
export { initReloadClient };

// Auto-initialize if this is a content script
if (typeof window !== 'undefined' && window.location) {
  initReloadClient();
}