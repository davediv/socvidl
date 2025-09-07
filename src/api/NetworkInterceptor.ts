/**
 * NetworkInterceptor
 * Intercepts network requests to capture m3u8 playlists and video URLs
 */

export interface InterceptedRequest {
  requestId: string;
  url: string;
  method: string;
  timestamp: number;
  tabId: number;
  frameId: number;
  initiator?: string;
  type: chrome.webRequest.ResourceType;
  headers?: chrome.webRequest.HttpHeader[];
}

export interface M3U8Request extends InterceptedRequest {
  playlistUrl: string;
  videoId?: string;
  quality?: string;
  authToken?: string;
  cookies?: string;
}

export interface InterceptorOptions {
  enableLogging?: boolean;
  captureHeaders?: boolean;
  captureCookies?: boolean;
  filters?: {
    urls: string[];
    types?: chrome.webRequest.ResourceType[];
  };
}

export class NetworkInterceptor {
  private m3u8Requests: Map<string, M3U8Request> = new Map();
  private videoUrlCache: Map<string, string> = new Map();
  private requestListeners: Map<string, (request: M3U8Request) => void> = new Map();
  private options: InterceptorOptions;
  private isListening = false;

  constructor(options: InterceptorOptions = {}) {
    this.options = {
      enableLogging: false,
      captureHeaders: true,
      captureCookies: true,
      filters: {
        urls: [
          '*://*.twitter.com/*',
          '*://*.x.com/*',
          '*://*.twimg.com/*',
          '*://video.twimg.com/*',
          '*://abs.twimg.com/*',
        ],
        types: ['xmlhttprequest', 'media', 'other'],
      },
      ...options,
    };
  }

  /**
   * Start intercepting network requests
   */
  start(): void {
    if (this.isListening) {
      this.log('NetworkInterceptor already listening');
      return;
    }

    // Check if we're in a context that supports webRequest API
    if (chrome?.webRequest === undefined) {
      this.log('webRequest API not available', 'error');
      return;
    }

    // Set up request listener
    chrome.webRequest.onBeforeRequest.addListener(
      this.handleBeforeRequest.bind(this),
      { urls: this.options.filters?.urls ?? [], types: this.options.filters?.types ?? [] },
      ['requestBody']
    );

    // Set up headers listener if needed
    if (this.options.captureHeaders === true) {
      chrome.webRequest.onSendHeaders.addListener(
        this.handleSendHeaders.bind(this),
        { urls: this.options.filters?.urls ?? [], types: this.options.filters?.types ?? [] },
        ['requestHeaders', 'extraHeaders']
      );
    }

    // Set up response listener to capture final URLs
    chrome.webRequest.onCompleted.addListener(
      this.handleCompleted.bind(this),
      { urls: this.options.filters?.urls ?? [], types: this.options.filters?.types ?? [] },
      ['responseHeaders']
    );

    this.isListening = true;
    this.log('NetworkInterceptor started');
  }

  /**
   * Stop intercepting network requests
   */
  stop(): void {
    if (!this.isListening) {
      return;
    }

    if (chrome?.webRequest !== undefined) {
      chrome.webRequest.onBeforeRequest.removeListener(this.handleBeforeRequest.bind(this));
      chrome.webRequest.onSendHeaders.removeListener(this.handleSendHeaders.bind(this));
      chrome.webRequest.onCompleted.removeListener(this.handleCompleted.bind(this));
    }

    this.isListening = false;
    this.log('NetworkInterceptor stopped');
  }

  /**
   * Handle before request event
   */
  private handleBeforeRequest(details: chrome.webRequest.WebRequestBodyDetails): void {
    // Check if this is an m3u8 request
    if (this.isM3U8Request(details.url)) {
      this.log(`Intercepted m3u8 request: ${details.url}`);

      const request: M3U8Request = {
        requestId: details.requestId,
        url: details.url,
        playlistUrl: details.url,
        method: details.method,
        timestamp: details.timeStamp,
        tabId: details.tabId,
        frameId: details.frameId,
        initiator: details.initiator,
        type: details.type as chrome.webRequest.ResourceType,
      };

      // Extract video ID from URL if possible
      const videoId = this.extractVideoId(details.url);
      if (videoId !== null && videoId !== '') {
        request.videoId = videoId;
      }

      // Extract quality from URL
      const quality = this.extractQuality(details.url);
      if (quality !== null && quality !== '') {
        request.quality = quality;
      }

      // Store the request
      this.m3u8Requests.set(details.requestId, request);

      // Cache the URL for the tab
      this.cacheVideoUrl(details.tabId, details.url);
    }
    // Check if this is a video segment request
    else if (this.isVideoSegment(details.url)) {
      this.log(`Intercepted video segment: ${details.url}`);
    }
  }

  /**
   * Handle send headers event
   */
  private handleSendHeaders(details: chrome.webRequest.WebRequestHeadersDetails): void {
    const request = this.m3u8Requests.get(details.requestId);
    if (!request) {
      return;
    }

    // Capture headers
    request.headers = details.requestHeaders;

    // Extract authentication token
    const authToken = this.extractAuthToken(details.requestHeaders);
    if (authToken !== null && authToken !== '') {
      request.authToken = authToken;
    }

    // Extract cookies if needed
    if (this.options.captureCookies === true) {
      const cookies = this.extractCookies(details.requestHeaders);
      if (cookies !== null && cookies !== '') {
        request.cookies = cookies;
      }
    }

    this.log(`Captured headers for m3u8 request: ${request.playlistUrl}`);
  }

  /**
   * Handle completed request
   */
  private handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): void {
    const request = this.m3u8Requests.get(details.requestId);
    if (!request) {
      return;
    }

    // Notify listeners
    this.notifyListeners(request);

    // Send message to content script if available
    this.sendToContentScript(details.tabId, request);

    this.log(`Completed m3u8 request: ${request.playlistUrl}`);
  }

  /**
   * Check if URL is an m3u8 playlist
   */
  private isM3U8Request(url: string): boolean {
    const m3u8Patterns = [
      /\.m3u8(\?|$)/i,
      /\/playlist\.m3u8/i,
      /\/master\.m3u8/i,
      /\/index\.m3u8/i,
      /\/chunklist.*\.m3u8/i,
      /\/hls\/.*\.m3u8/i,
      /\/stream\.m3u8/i,
      /ext_tw_video.*\.m3u8/i, // Twitter specific
      /\/amplify_video.*\.m3u8/i, // Twitter specific
    ];

    return m3u8Patterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if URL is a video segment
   */
  private isVideoSegment(url: string): boolean {
    const segmentPatterns = [
      /\.ts(\?|$)/i,
      /\.mp4(\?|$)/i,
      /\.m4s(\?|$)/i,
      /\/seg-\d+/i,
      /\/segment\d+/i,
      /\/chunk-\d+/i,
    ];

    return segmentPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Extract video ID from URL
   */
  private extractVideoId(url: string): string | null {
    // Twitter video ID patterns
    const patterns = [
      /\/ext_tw_video\/(\d+)\//,
      /\/amplify_video\/(\d+)\//,
      /\/tweet_video\/([^/]+)/,
      /\/pu\/vid\/([^/]+)/,
      /\/video\/(\d+)\//,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1] !== undefined) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract quality from URL
   */
  private extractQuality(url: string): string | null {
    // Common quality patterns
    const patterns = [
      /\/(\d+x\d+)\//, // e.g., 1280x720
      /\/(\d+p)\//, // e.g., 720p
      /[?&]resolution=([^&]+)/,
      /[?&]quality=([^&]+)/,
      /\/([^/]*\d{3,4}[^/]*)\//, // Contains resolution number
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1] !== undefined) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract authentication token from headers
   */
  private extractAuthToken(headers?: chrome.webRequest.HttpHeader[]): string | null {
    if (!headers) {
      return null;
    }

    // Look for authorization headers
    const authHeaders = [
      'authorization',
      'x-auth-token',
      'x-csrf-token',
      'x-guest-token',
      'x-twitter-auth-type',
    ];

    for (const header of headers) {
      if (authHeaders.includes(header.name.toLowerCase())) {
        return header.value ?? null;
      }
    }

    return null;
  }

  /**
   * Extract cookies from headers
   */
  private extractCookies(headers?: chrome.webRequest.HttpHeader[]): string | null {
    if (!headers) {
      return null;
    }

    const cookieHeader = headers.find(h => h.name.toLowerCase() === 'cookie');
    return cookieHeader?.value ?? null;
  }

  /**
   * Cache video URL for a tab
   */
  private cacheVideoUrl(tabId: number, url: string): void {
    const key = `tab-${tabId}`;
    this.videoUrlCache.set(key, url);
  }

  /**
   * Get cached video URL for a tab
   */
  getCachedUrl(tabId: number): string | undefined {
    return this.videoUrlCache.get(`tab-${tabId}`);
  }

  /**
   * Notify registered listeners
   */
  private notifyListeners(request: M3U8Request): void {
    this.requestListeners.forEach(listener => {
      try {
        listener(request);
      } catch (error) {
        this.log(`Error in listener: ${String(error)}`, 'error');
      }
    });
  }

  /**
   * Send intercepted request to content script
   */
  private sendToContentScript(tabId: number, request: M3U8Request): void {
    if (tabId < 0) {
      return; // Invalid tab ID
    }

    chrome.tabs
      .sendMessage(tabId, {
        type: 'm3u8-intercepted',
        data: {
          url: request.playlistUrl,
          videoId: request.videoId,
          quality: request.quality,
          authToken: request.authToken,
          timestamp: request.timestamp,
        },
      })
      .catch(error => {
        // Content script might not be ready yet
        this.log(`Failed to send to content script: ${error}`, 'warn');
      });
  }

  /**
   * Register a listener for m3u8 requests
   */
  onM3U8Request(id: string, listener: (request: M3U8Request) => void): void {
    this.requestListeners.set(id, listener);
  }

  /**
   * Unregister a listener
   */
  offM3U8Request(id: string): void {
    this.requestListeners.delete(id);
  }

  /**
   * Get all intercepted m3u8 requests
   */
  getM3U8Requests(): M3U8Request[] {
    return Array.from(this.m3u8Requests.values());
  }

  /**
   * Get m3u8 request by video ID
   */
  getRequestByVideoId(videoId: string): M3U8Request | undefined {
    return Array.from(this.m3u8Requests.values()).find(request => request.videoId === videoId);
  }

  /**
   * Clear cached data
   */
  clear(): void {
    this.m3u8Requests.clear();
    this.videoUrlCache.clear();
  }

  /**
   * Clear data for a specific tab
   */
  clearTab(tabId: number): void {
    const key = `tab-${tabId}`;
    this.videoUrlCache.delete(key);

    // Remove requests from this tab
    Array.from(this.m3u8Requests.entries()).forEach(([id, request]) => {
      if (request.tabId === tabId) {
        this.m3u8Requests.delete(id);
      }
    });
  }

  /**
   * Log message if logging is enabled
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (this.options.enableLogging !== true) {
      return;
    }

    const prefix = '[NetworkInterceptor]';
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
