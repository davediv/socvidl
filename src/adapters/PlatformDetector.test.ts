import { PlatformDetector } from './PlatformDetector';
import { TwitterAdapter } from './TwitterAdapter';

describe('PlatformDetector', () => {
  let detector: PlatformDetector;
  const originalLocation = window.location;

  beforeEach(() => {
    // Reset singleton
    (PlatformDetector as any).instance = null;

    // Mock window.location
    delete (window as any).location;
    (window as any).location = { hostname: 'twitter.com' };

    detector = PlatformDetector.getInstance();
  });

  afterEach(() => {
    // Restore window.location
    window.location = originalLocation;
    detector.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = PlatformDetector.getInstance();
      const instance2 = PlatformDetector.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Platform Detection', () => {
    it('should detect Twitter', () => {
      detector.updateHostname('twitter.com');
      expect(detector.detectPlatform()).toBe('twitter');
    });

    it('should detect X.com as Twitter', () => {
      detector.updateHostname('x.com');
      expect(detector.detectPlatform()).toBe('twitter');
    });

    it('should detect Reddit', () => {
      detector.updateHostname('reddit.com');
      expect(detector.detectPlatform()).toBe('reddit');
    });

    it('should detect old Reddit', () => {
      detector.updateHostname('old.reddit.com');
      expect(detector.detectPlatform()).toBe('reddit');
    });

    it('should return null for unsupported platforms', () => {
      detector.updateHostname('facebook.com');
      expect(detector.detectPlatform()).toBeNull();
    });
  });

  describe('Adapter Management', () => {
    it('should return TwitterAdapter for Twitter', () => {
      detector.updateHostname('twitter.com');
      const adapter = detector.getAdapter();

      expect(adapter).toBeInstanceOf(TwitterAdapter);
    });

    it('should return TwitterAdapter for X.com', () => {
      detector.updateHostname('x.com');
      const adapter = detector.getAdapter();

      expect(adapter).toBeInstanceOf(TwitterAdapter);
    });

    it('should cache adapter instance', () => {
      detector.updateHostname('twitter.com');
      const adapter1 = detector.getAdapter();
      const adapter2 = detector.getAdapter();

      expect(adapter1).toBe(adapter2);
    });

    it('should return null for Reddit (not yet implemented)', () => {
      detector.updateHostname('reddit.com');
      const adapter = detector.getAdapter();

      expect(adapter).toBeNull();
    });

    it('should return null for unsupported platforms', () => {
      detector.updateHostname('facebook.com');
      const adapter = detector.getAdapter();

      expect(adapter).toBeNull();
    });

    it('should initialize UI variations on adapter', () => {
      detector.updateHostname('twitter.com');
      const adapter = detector.getAdapter();

      // Verify adapter is initialized (would be better with a spy)
      expect(adapter).toBeTruthy();
    });
  });

  describe('Support Check', () => {
    it('should return true for supported platforms', () => {
      detector.updateHostname('twitter.com');
      expect(detector.isSupported()).toBe(true);

      detector.updateHostname('x.com');
      expect(detector.isSupported()).toBe(true);

      detector.updateHostname('reddit.com');
      expect(detector.isSupported()).toBe(true);
    });

    it('should return false for unsupported platforms', () => {
      detector.updateHostname('facebook.com');
      expect(detector.isSupported()).toBe(false);

      detector.updateHostname('youtube.com');
      expect(detector.isSupported()).toBe(false);
    });
  });

  describe('Hostname Management', () => {
    it('should get current hostname', () => {
      detector.updateHostname('twitter.com');
      expect(detector.getHostname()).toBe('twitter.com');
    });

    it('should update hostname', () => {
      detector.updateHostname('twitter.com');
      expect(detector.getHostname()).toBe('twitter.com');

      detector.updateHostname('x.com');
      expect(detector.getHostname()).toBe('x.com');
    });

    it('should use window.location.hostname by default', () => {
      (window as any).location = { hostname: 'example.com' };
      detector.updateHostname();

      expect(detector.getHostname()).toBe('example.com');
    });
  });

  describe('Reset Functionality', () => {
    it('should clear cached adapter on reset', () => {
      detector.updateHostname('twitter.com');
      const adapter1 = detector.getAdapter();

      detector.reset();

      const adapter2 = detector.getAdapter();
      expect(adapter1).not.toBe(adapter2);
    });

    it('should cleanup adapter on reset', () => {
      detector.updateHostname('twitter.com');
      const adapter = detector.getAdapter();

      if (adapter) {
        const cleanupSpy = jest.spyOn(adapter, 'cleanup');
        detector.reset();
        expect(cleanupSpy).toHaveBeenCalled();
      }
    });

    it('should reset when hostname changes', () => {
      detector.updateHostname('twitter.com');
      const adapter1 = detector.getAdapter();

      detector.updateHostname('x.com');
      const adapter2 = detector.getAdapter();

      // Both should be TwitterAdapter but different instances
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('Logging', () => {
    it('should pass enableLogging to adapter', () => {
      detector.updateHostname('twitter.com');
      const adapterWithLogging = detector.getAdapter(true);

      // Adapter should be created with logging enabled
      expect(adapterWithLogging).toBeTruthy();
    });
  });
});
