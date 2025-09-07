import { NetworkInterceptor, M3U8Request } from './NetworkInterceptor';

// Mock chrome API
const mockChrome = {
  webRequest: {
    onBeforeRequest: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onSendHeaders: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onCompleted: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    ResourceType: {
      xmlhttprequest: 'xmlhttprequest',
      media: 'media',
      other: 'other'
    }
  },
  tabs: {
    sendMessage: jest.fn().mockResolvedValue(undefined)
  }
};

// Set up global chrome mock
(global as any).chrome = mockChrome;

describe('NetworkInterceptor', () => {
  let interceptor: NetworkInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new NetworkInterceptor({
      enableLogging: false
    });
  });

  afterEach(() => {
    interceptor.stop();
  });

  describe('Initialization', () => {
    it('should create interceptor with default options', () => {
      const defaultInterceptor = new NetworkInterceptor();
      expect(defaultInterceptor).toBeDefined();
    });

    it('should create interceptor with custom options', () => {
      const customInterceptor = new NetworkInterceptor({
        enableLogging: true,
        captureHeaders: false,
        captureCookies: false
      });
      expect(customInterceptor).toBeDefined();
    });
  });

  describe('Start/Stop', () => {
    it('should start intercepting requests', () => {
      interceptor.start();
      
      expect(mockChrome.webRequest.onBeforeRequest.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onSendHeaders.addListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.addListener).toHaveBeenCalled();
    });

    it('should not start if already listening', () => {
      interceptor.start();
      jest.clearAllMocks();
      
      interceptor.start();
      
      expect(mockChrome.webRequest.onBeforeRequest.addListener).not.toHaveBeenCalled();
    });

    it('should stop intercepting requests', () => {
      interceptor.start();
      interceptor.stop();
      
      expect(mockChrome.webRequest.onBeforeRequest.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onSendHeaders.removeListener).toHaveBeenCalled();
      expect(mockChrome.webRequest.onCompleted.removeListener).toHaveBeenCalled();
    });

    it('should handle stop when not listening', () => {
      expect(() => interceptor.stop()).not.toThrow();
    });
  });

  describe('M3U8 Detection', () => {
    it('should detect m3u8 URLs', () => {
      const m3u8Urls = [
        'https://video.twimg.com/ext_tw_video/123/playlist.m3u8',
        'https://example.com/master.m3u8',
        'https://cdn.com/index.m3u8?token=abc',
        'https://stream.com/chunklist_b1234.m3u8',
        'https://video.com/hls/stream.m3u8'
      ];

      m3u8Urls.forEach(url => {
        expect((interceptor as any).isM3U8Request(url)).toBe(true);
      });
    });

    it('should not detect non-m3u8 URLs', () => {
      const nonM3u8Urls = [
        'https://example.com/video.mp4',
        'https://example.com/image.jpg',
        'https://example.com/playlist.txt'
      ];

      nonM3u8Urls.forEach(url => {
        expect((interceptor as any).isM3U8Request(url)).toBe(false);
      });
    });
  });

  describe('Video Segment Detection', () => {
    it('should detect video segment URLs', () => {
      const segmentUrls = [
        'https://video.com/segment.ts',
        'https://video.com/chunk.mp4',
        'https://video.com/init.m4s',
        'https://video.com/seg-123',
        'https://video.com/segment001',
        'https://video.com/chunk-456'
      ];

      segmentUrls.forEach(url => {
        expect((interceptor as any).isVideoSegment(url)).toBe(true);
      });
    });

    it('should not detect non-segment URLs', () => {
      const nonSegmentUrls = [
        'https://example.com/page.html',
        'https://example.com/style.css',
        'https://example.com/script.js'
      ];

      nonSegmentUrls.forEach(url => {
        expect((interceptor as any).isVideoSegment(url)).toBe(false);
      });
    });
  });

  describe('Video ID Extraction', () => {
    it('should extract Twitter video IDs', () => {
      const testCases = [
        {
          url: 'https://video.twimg.com/ext_tw_video/1234567890/pu/vid/1280x720/abc.m3u8',
          expectedId: '1234567890'
        },
        {
          url: 'https://video.twimg.com/amplify_video/9876543210/vid/playlist.m3u8',
          expectedId: '9876543210'
        },
        {
          url: 'https://cdn.com/tweet_video/abc123/master.m3u8',
          expectedId: 'abc123'
        }
      ];

      testCases.forEach(({ url, expectedId }) => {
        expect((interceptor as any).extractVideoId(url)).toBe(expectedId);
      });
    });

    it('should return null for URLs without video ID', () => {
      const url = 'https://example.com/playlist.m3u8';
      expect((interceptor as any).extractVideoId(url)).toBeNull();
    });
  });

  describe('Quality Extraction', () => {
    it('should extract quality from URLs', () => {
      const testCases = [
        {
          url: 'https://video.com/1280x720/playlist.m3u8',
          expectedQuality: '1280x720'
        },
        {
          url: 'https://video.com/720p/stream.m3u8',
          expectedQuality: '720p'
        },
        {
          url: 'https://video.com/playlist.m3u8?resolution=1080p',
          expectedQuality: '1080p'
        },
        {
          url: 'https://video.com/playlist.m3u8?quality=high',
          expectedQuality: 'high'
        }
      ];

      testCases.forEach(({ url, expectedQuality }) => {
        expect((interceptor as any).extractQuality(url)).toBe(expectedQuality);
      });
    });

    it('should return null for URLs without quality', () => {
      const url = 'https://example.com/playlist.m3u8';
      expect((interceptor as any).extractQuality(url)).toBeNull();
    });
  });

  describe('Authentication Token Extraction', () => {
    it('should extract auth tokens from headers', () => {
      const headers = [
        { name: 'Authorization', value: 'Bearer token123' },
        { name: 'Cookie', value: 'session=abc' }
      ];

      const token = (interceptor as any).extractAuthToken(headers);
      expect(token).toBe('Bearer token123');
    });

    it('should extract Twitter-specific tokens', () => {
      const headers = [
        { name: 'x-csrf-token', value: 'csrf123' },
        { name: 'Cookie', value: 'session=abc' }
      ];

      const token = (interceptor as any).extractAuthToken(headers);
      expect(token).toBe('csrf123');
    });

    it('should return null if no auth token found', () => {
      const headers = [
        { name: 'Content-Type', value: 'application/json' }
      ];

      const token = (interceptor as any).extractAuthToken(headers);
      expect(token).toBeNull();
    });
  });

  describe('Cookie Extraction', () => {
    it('should extract cookies from headers', () => {
      const headers = [
        { name: 'Cookie', value: 'session=abc; user=123' },
        { name: 'Content-Type', value: 'application/json' }
      ];

      const cookies = (interceptor as any).extractCookies(headers);
      expect(cookies).toBe('session=abc; user=123');
    });

    it('should return null if no cookies found', () => {
      const headers = [
        { name: 'Content-Type', value: 'application/json' }
      ];

      const cookies = (interceptor as any).extractCookies(headers);
      expect(cookies).toBeNull();
    });
  });

  describe('Request Listeners', () => {
    it('should register and notify listeners', () => {
      const listener = jest.fn();
      interceptor.onM3U8Request('test-listener', listener);

      const mockRequest: M3U8Request = {
        requestId: '123',
        url: 'https://video.com/playlist.m3u8',
        playlistUrl: 'https://video.com/playlist.m3u8',
        method: 'GET',
        timestamp: Date.now(),
        tabId: 1,
        frameId: 0,
        type: 'xmlhttprequest' as chrome.webRequest.ResourceType
      };

      // Simulate request notification
      (interceptor as any).notifyListeners(mockRequest);

      expect(listener).toHaveBeenCalledWith(mockRequest);
    });

    it('should unregister listeners', () => {
      const listener = jest.fn();
      interceptor.onM3U8Request('test-listener', listener);
      interceptor.offM3U8Request('test-listener');

      const mockRequest: M3U8Request = {
        requestId: '123',
        url: 'https://video.com/playlist.m3u8',
        playlistUrl: 'https://video.com/playlist.m3u8',
        method: 'GET',
        timestamp: Date.now(),
        tabId: 1,
        frameId: 0,
        type: 'xmlhttprequest' as chrome.webRequest.ResourceType
      };

      (interceptor as any).notifyListeners(mockRequest);

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should cache video URLs by tab', () => {
      const tabId = 1;
      const url = 'https://video.com/playlist.m3u8';
      
      (interceptor as any).cacheVideoUrl(tabId, url);
      
      expect(interceptor.getCachedUrl(tabId)).toBe(url);
    });

    it('should clear all cached data', () => {
      const tabId = 1;
      const url = 'https://video.com/playlist.m3u8';
      
      (interceptor as any).cacheVideoUrl(tabId, url);
      interceptor.clear();
      
      expect(interceptor.getCachedUrl(tabId)).toBeUndefined();
    });

    it('should clear data for specific tab', () => {
      const tabId1 = 1;
      const tabId2 = 2;
      const url1 = 'https://video.com/playlist1.m3u8';
      const url2 = 'https://video.com/playlist2.m3u8';
      
      (interceptor as any).cacheVideoUrl(tabId1, url1);
      (interceptor as any).cacheVideoUrl(tabId2, url2);
      
      interceptor.clearTab(tabId1);
      
      expect(interceptor.getCachedUrl(tabId1)).toBeUndefined();
      expect(interceptor.getCachedUrl(tabId2)).toBe(url2);
    });
  });

  describe('Request Storage', () => {
    it('should get all m3u8 requests', () => {
      expect(interceptor.getM3U8Requests()).toEqual([]);
    });

    it('should get request by video ID', () => {
      const result = interceptor.getRequestByVideoId('123');
      expect(result).toBeUndefined();
    });
  });
});