import { TwitterAdapter } from './TwitterAdapter';
import type { VideoElement } from '../types';

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter;
  let mockVideo: VideoElement;
  let container: HTMLElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Create adapter instance
    adapter = new TwitterAdapter();

    // Create mock container (tweet)
    container = document.createElement('article');
    container.innerHTML = `
      <div data-testid="tweet">
        <div dir="ltr">
          <span>@testuser</span>
        </div>
        <div data-testid="tweetText">
          Test tweet with #video
        </div>
        <a href="/testuser/status/123456789">
          <time datetime="2025-01-07T12:00:00Z">12:00 PM</time>
        </a>
        <div role="group">
          <div role="button">Reply</div>
          <div role="button">Retweet</div>
          <div role="button">Like</div>
        </div>
      </div>
    `;
    document.body.appendChild(container);

    // Create mock video element
    mockVideo = document.createElement('video') as VideoElement;
    mockVideo.src = 'https://video.twimg.com/test.mp4';
    container.appendChild(mockVideo);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Platform Detection', () => {
    it('should match Twitter domains', () => {
      expect(adapter.matchesDomain('twitter.com')).toBe(true);
      expect(adapter.matchesDomain('x.com')).toBe(true);
      expect(adapter.matchesDomain('mobile.twitter.com')).toBe(true);
    });

    it('should not match non-Twitter domains', () => {
      expect(adapter.matchesDomain('facebook.com')).toBe(false);
      expect(adapter.matchesDomain('reddit.com')).toBe(false);
    });

    it('should return correct platform name', () => {
      expect(adapter.getName()).toBe('Twitter/X');
      expect(adapter.getPlatform()).toBe('twitter');
    });
  });

  describe('Video Detection', () => {
    it('should detect videos on page', () => {
      expect(adapter.hasVideos()).toBe(true);
    });

    it('should find video elements', () => {
      const videos = adapter.findVideoElements();
      expect(videos.length).toBe(1);
      expect(videos[0]).toBe(mockVideo);
    });

    it('should validate Twitter videos', () => {
      expect(adapter.isValidVideo(mockVideo)).toBe(true);
    });

    it('should skip already processed videos', () => {
      adapter.markAsProcessed(mockVideo, 'test-id');
      expect(adapter.isValidVideo(mockVideo)).toBe(false);
    });

    it('should skip GIF videos', () => {
      const gifLabel = document.createElement('div');
      gifLabel.setAttribute('aria-label', 'Embedded GIF');
      container.appendChild(gifLabel);

      expect(adapter.isValidVideo(mockVideo)).toBe(false);
    });

    it('should skip external embeds', () => {
      mockVideo.src = 'https://youtube.com/embed/test';
      expect(adapter.isValidVideo(mockVideo)).toBe(false);
    });

    it('should skip promoted/ad videos', () => {
      const promotedLabel = document.createElement('div');
      promotedLabel.setAttribute('data-testid', 'promotedLabel');
      container.appendChild(promotedLabel);

      expect(adapter.isValidVideo(mockVideo)).toBe(false);
    });
  });

  describe('Container Detection', () => {
    it('should find tweet container', () => {
      const foundContainer = adapter.findVideoContainer(mockVideo);
      expect(foundContainer).toBe(container);
    });

    it('should handle old Twitter markup', () => {
      document.body.innerHTML = '';
      const oldTweet = document.createElement('div');
      oldTweet.className = 'tweet';
      const video = document.createElement('video') as VideoElement;
      oldTweet.appendChild(video);
      document.body.appendChild(oldTweet);

      const foundContainer = adapter.findVideoContainer(video);
      expect(foundContainer).toBe(oldTweet);
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract post metadata', () => {
      const metadata = adapter.extractPostMetadata(container);

      expect(metadata.username).toBe('testuser');
      expect(metadata.postId).toBe('123456789');
      expect(metadata.description).toContain('Test tweet with #video');
      expect(metadata.hashtags).toEqual(['video']);
      expect(metadata.timestamp).toBe(new Date('2025-01-07T12:00:00Z').getTime());
    });

    it('should handle missing metadata gracefully', () => {
      const emptyContainer = document.createElement('article');
      const metadata = adapter.extractPostMetadata(emptyContainer);

      expect(metadata.username).toBe('unknown');
      expect(metadata.postId).toBe('');
      expect(metadata.description).toBeUndefined();
    });
  });

  describe('Video Data Extraction', () => {
    it('should extract direct video URL', async () => {
      const result = await adapter.extractVideoData(mockVideo);

      expect(result.url).toBe('https://video.twimg.com/test.mp4');
      expect(result.type).toBe('direct');
    });

    it('should handle source elements', async () => {
      mockVideo.src = '';
      const source = document.createElement('source');
      source.src = 'https://video.twimg.com/source.mp4';
      mockVideo.appendChild(source);

      const result = await adapter.extractVideoData(mockVideo);

      expect(result.url).toBe('https://video.twimg.com/source.mp4');
      expect(result.type).toBe('direct');
    });

    it('should handle blob URLs', async () => {
      mockVideo.src = 'blob:https://twitter.com/abc123';

      const result = await adapter.extractVideoData(mockVideo);

      // m3u8 extraction not yet implemented
      expect(result.url).toBeNull();
      expect(result.type).toBe('direct');
    });

    it('should extract basic metadata', async () => {
      // Set video properties
      Object.defineProperty(mockVideo, 'duration', { value: 120, writable: true });
      Object.defineProperty(mockVideo, 'videoWidth', { value: 1280, writable: true });
      Object.defineProperty(mockVideo, 'videoHeight', { value: 720, writable: true });

      const result = await adapter.extractVideoData(mockVideo);

      expect(result.metadata?.duration).toBe(120);
      expect(result.metadata?.width).toBe(1280);
      expect(result.metadata?.height).toBe(720);
    });
  });

  describe('Button Injection', () => {
    it('should find button injection point in action bar', () => {
      const injectionPoint = adapter.getButtonInjectionPoint(container);

      expect(injectionPoint).toBeTruthy();
      expect(injectionPoint?.getAttribute('role')).toBe('group');
    });

    it('should fallback to container if no action bar', () => {
      const simpleContainer = document.createElement('article');
      const injectionPoint = adapter.getButtonInjectionPoint(simpleContainer);

      expect(injectionPoint).toBe(simpleContainer);
    });
  });

  describe('UI Variations', () => {
    it('should detect React-based UI', () => {
      const reactRoot = document.createElement('div');
      reactRoot.id = 'react-root';
      document.body.appendChild(reactRoot);

      const newAdapter = new TwitterAdapter();
      newAdapter.handleUIVariations();

      // Check that selectors are set for React UI
      const selector = newAdapter.getVideoSelector();
      expect(selector).toContain('data-testid');
    });

    it('should handle old Twitter UI', () => {
      document.body.innerHTML = '';
      const oldTweet = document.createElement('div');
      oldTweet.className = 'js-original-tweet';
      document.body.appendChild(oldTweet);

      const newAdapter = new TwitterAdapter();
      newAdapter.handleUIVariations();

      // Check that selectors are updated for old UI
      const selector = newAdapter.getContainerSelector();
      expect(selector).toContain('js-tweet');
    });
  });

  describe('Platform Features', () => {
    it('should report correct features', () => {
      const features = adapter.getFeatures();

      expect(features.hasM3U8).toBe(true);
      expect(features.hasDASH).toBe(false);
      expect(features.hasDirectVideo).toBe(true);
      expect(features.supportsQuality).toBe(true);
    });

    it('should not require authentication', () => {
      expect(adapter.requiresAuth()).toBe(false);
    });

    it('should support quality selection', () => {
      expect(adapter.supportsQuality()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources', () => {
      // Cache an m3u8 URL
      adapter.cacheM3U8Url('test-video', 'https://test.m3u8');

      // Clean up
      adapter.cleanup();

      // Verify cache is cleared (would need to expose cache for testing)
      // For now, just verify cleanup doesn't throw
      expect(() => adapter.cleanup()).not.toThrow();
    });
  });

  describe('Request Headers', () => {
    it('should provide Twitter-specific headers', () => {
      const headers = adapter.getRequestHeaders();

      expect(headers['x-twitter-active-user']).toBe('yes');
      expect(headers['x-twitter-client-language']).toBe('en');
    });
  });
});
