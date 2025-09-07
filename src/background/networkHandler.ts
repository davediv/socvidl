/**
 * Network Handler for Background Script
 * Integrates NetworkInterceptor with background service worker
 */

import { NetworkInterceptor, M3U8Request } from '../api/NetworkInterceptor';

class NetworkHandler {
  private interceptor: NetworkInterceptor;
  private m3u8Cache: Map<number, M3U8Request[]> = new Map();
  private enableLogging = true;

  constructor() {
    this.interceptor = new NetworkInterceptor({
      enableLogging: this.enableLogging,
      captureHeaders: true,
      captureCookies: true,
    });
  }

  /**
   * Initialize network handler
   */
  init(): void {
    // Start intercepting requests
    this.interceptor.start();

    // Register listener for m3u8 requests
    this.interceptor.onM3U8Request('background-handler', request => {
      this.handleM3U8Request(request);
    });

    // Listen for tab updates to clean up cache
    chrome.tabs.onRemoved.addListener(tabId => {
      this.cleanupTab(tabId);
    });

    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((request: unknown, sender, sendResponse) => {
      if (
        typeof request === 'object' &&
        request !== null &&
        'type' in request &&
        request.type === 'get-m3u8-url'
      ) {
        const videoId =
          'videoId' in request && typeof request.videoId === 'string' ? request.videoId : undefined;
        void this.handleGetM3U8Url(sender.tab?.id, videoId)
          .then(sendResponse)
          .catch((error: unknown) => sendResponse({ success: false, error: String(error) }));
        return true;
      }
      return false;
    });

    this.log('NetworkHandler initialized');
  }

  /**
   * Handle intercepted m3u8 request
   */
  private handleM3U8Request(request: M3U8Request): void {
    this.log(`M3U8 intercepted for tab ${request.tabId}: ${request.playlistUrl}`);

    // Cache request by tab ID
    if (!this.m3u8Cache.has(request.tabId)) {
      this.m3u8Cache.set(request.tabId, []);
    }

    const tabRequests = this.m3u8Cache.get(request.tabId) ?? [];
    this.m3u8Cache.set(request.tabId, tabRequests);
    tabRequests.push(request);

    // Keep only last 10 requests per tab
    if (tabRequests.length > 10) {
      tabRequests.shift();
    }

    // Notify the tab's content script
    this.notifyContentScript(request);
  }

  /**
   * Notify content script about intercepted m3u8
   */
  private notifyContentScript(request: M3U8Request): void {
    if (request.tabId < 0) {
      return;
    }

    chrome.tabs
      .sendMessage(request.tabId, {
        type: 'm3u8-intercepted',
        data: {
          url: request.playlistUrl,
          videoId: request.videoId,
          quality: request.quality,
          authToken: request.authToken,
          headers: request.headers,
          timestamp: request.timestamp,
        },
      })
      .catch(error => {
        // Content script might not be ready
        this.log(`Failed to notify content script: ${error}`, 'warn');
      });
  }

  /**
   * Handle request to get m3u8 URL for a video
   */
  private handleGetM3U8Url(
    tabId: number | undefined,
    videoId?: string
  ): Promise<{
    success: boolean;
    url?: string;
    authToken?: string;
    headers?: chrome.webRequest.HttpHeader[];
    error?: string;
  }> {
    if (tabId === undefined || tabId === null || tabId < 0) {
      return Promise.resolve({ success: false, error: 'Invalid tab ID' });
    }

    const tabRequests = this.m3u8Cache.get(tabId) ?? [];

    // If videoId provided, find specific request
    if (videoId !== undefined && videoId !== '') {
      const request = tabRequests.find(r => r.videoId === videoId);
      if (request !== undefined) {
        return Promise.resolve({
          success: true,
          url: request.playlistUrl,
          authToken: request.authToken,
          headers: request.headers,
        });
      }
    }

    // Return most recent m3u8 URL
    if (tabRequests.length > 0) {
      const latestRequest = tabRequests[tabRequests.length - 1];
      if (latestRequest !== undefined) {
        return Promise.resolve({
          success: true,
          url: latestRequest.playlistUrl,
          authToken: latestRequest.authToken,
          headers: latestRequest.headers,
        });
      }
    }

    return Promise.resolve({ success: false, error: 'No m3u8 URL found' });
  }

  /**
   * Clean up cached data for a tab
   */
  private cleanupTab(tabId: number): void {
    this.m3u8Cache.delete(tabId);
    this.interceptor.clearTab(tabId);
    this.log(`Cleaned up data for tab ${tabId}`);
  }

  /**
   * Get all cached m3u8 requests
   */
  getCachedRequests(): Map<number, M3U8Request[]> {
    return this.m3u8Cache;
  }

  /**
   * Get cached requests for a specific tab
   */
  getTabRequests(tabId: number): M3U8Request[] {
    return this.m3u8Cache.get(tabId) ?? [];
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.m3u8Cache.clear();
    this.interceptor.clear();
  }

  /**
   * Stop network handler
   */
  stop(): void {
    this.interceptor.stop();
    this.interceptor.offM3U8Request('background-handler');
    this.clearCache();
    this.log('NetworkHandler stopped');
  }

  /**
   * Log message
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.enableLogging !== true) {
      return;
    }

    const prefix = '[NetworkHandler]';
    switch (level) {
      case 'error':
        console.error(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      default:
        console.info(prefix, message);
    }
  }
}

// Export singleton instance
export const networkHandler = new NetworkHandler();

// Initialize when imported in background script
if (chrome?.runtime !== undefined) {
  networkHandler.init();
}
