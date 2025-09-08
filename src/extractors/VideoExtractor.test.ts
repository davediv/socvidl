import { VideoExtractor, M3U8Variant } from './VideoExtractor';

// Mock fetch
global.fetch = jest.fn();

describe('VideoExtractor', () => {
  let extractor: VideoExtractor;

  beforeEach(() => {
    jest.clearAllMocks();
    extractor = new VideoExtractor({
      platform: 'twitter',
      preferredQuality: 'highest',
      enableLogging: false,
    });
  });

  describe('Initialization', () => {
    it('should create extractor with default options', () => {
      const defaultExtractor = new VideoExtractor({ platform: 'twitter' });
      expect(defaultExtractor).toBeDefined();
    });

    it('should create extractor with custom options', () => {
      const customExtractor = new VideoExtractor({
        platform: 'reddit',
        preferredQuality: 'lowest',
        maxBitrate: 1000000,
        enableLogging: true,
      });
      expect(customExtractor).toBeDefined();
    });
  });

  describe('parseM3U8', () => {
    it('should parse master playlist', () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080,CODECS="avc1.42e01e,mp4a.40.2"
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360
360p.m3u8`;

      const playlist = extractor.parseM3U8(m3u8Content);

      expect(playlist.isMaster).toBe(true);
      expect(playlist.variants).toHaveLength(3);
      expect(playlist.variants[0]).toEqual({
        url: '1080p.m3u8',
        bandwidth: 2000000,
        resolution: { width: 1920, height: 1080 },
        codecs: 'avc1.42e01e,mp4a.40.2',
        programId: undefined,
        framerate: undefined,
      });
      expect(playlist.variants[1].resolution).toEqual({ width: 1280, height: 720 });
      expect(playlist.variants[2].resolution).toEqual({ width: 640, height: 360 });
    });

    it('should parse media playlist with segments', () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:9.9,
segment0.ts
#EXTINF:9.9,
segment1.ts
#EXTINF:9.9,
segment2.ts
#EXT-X-ENDLIST`;

      const playlist = extractor.parseM3U8(m3u8Content);

      expect(playlist.isMaster).toBe(false);
      expect(playlist.targetDuration).toBe(10);
      expect(playlist.mediaSequence).toBe(0);
      expect(playlist.segments).toHaveLength(3);
      expect(playlist.segments![0]).toEqual({
        url: 'segment0.ts',
        duration: 9.9,
        title: undefined,
        sequence: 0,
        discontinuity: undefined,
      });
      expect(playlist.isLive).toBe(false);
    });

    it('should handle discontinuity markers', () => {
      const m3u8Content = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:10,
segment0.ts
#EXT-X-DISCONTINUITY
#EXTINF:10,
segment1.ts`;

      const playlist = extractor.parseM3U8(m3u8Content);

      expect(playlist.segments).toHaveLength(2);
      expect(playlist.segments![1].discontinuity).toBe(true);
    });

    it('should resolve relative URLs with base URL', () => {
      const m3u8Content = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=500000
/absolute/360p.m3u8`;

      const baseUrl = 'https://example.com/video/playlist.m3u8';
      const playlist = extractor.parseM3U8(m3u8Content, baseUrl);

      expect(playlist.variants[0].url).toBe('https://example.com/video/720p.m3u8');
      expect(playlist.variants[1].url).toBe('https://example.com/absolute/360p.m3u8');
    });

    it('should parse framerate attribute', () => {
      const m3u8Content = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,FRAME-RATE=30.0
720p.m3u8`;

      const playlist = extractor.parseM3U8(m3u8Content);

      expect(playlist.variants[0].framerate).toBe(30.0);
    });
  });

  describe('findHighestQuality', () => {
    const variants: M3U8Variant[] = [
      {
        url: '1080p.m3u8',
        bandwidth: 2000000,
        resolution: { width: 1920, height: 1080 },
      },
      {
        url: '720p.m3u8',
        bandwidth: 1000000,
        resolution: { width: 1280, height: 720 },
      },
      {
        url: '360p.m3u8',
        bandwidth: 500000,
        resolution: { width: 640, height: 360 },
      },
    ];

    it('should find highest quality variant', () => {
      const best = extractor.findHighestQuality(variants);

      expect(best).toBeDefined();
      expect(best?.resolution?.height).toBe(1080);
      expect(best?.bandwidth).toBe(2000000);
    });

    it('should find lowest quality when preferred', () => {
      const lowQualityExtractor = new VideoExtractor({
        platform: 'twitter',
        preferredQuality: 'lowest',
      });

      const lowest = lowQualityExtractor.findHighestQuality(variants);

      expect(lowest).toBeDefined();
      expect(lowest?.resolution?.height).toBe(360);
    });

    it('should find medium quality when auto', () => {
      const autoExtractor = new VideoExtractor({
        platform: 'twitter',
        preferredQuality: 'auto',
      });

      const medium = autoExtractor.findHighestQuality(variants);

      expect(medium).toBeDefined();
      expect(medium?.resolution?.height).toBe(720);
    });

    it('should respect max bitrate constraint', () => {
      const limitedExtractor = new VideoExtractor({
        platform: 'twitter',
        preferredQuality: 'highest',
        maxBitrate: 1500000,
      });

      const limited = limitedExtractor.findHighestQuality(variants);

      expect(limited).toBeDefined();
      expect(limited?.bandwidth).toBeLessThanOrEqual(1500000);
      expect(limited?.resolution?.height).toBe(720);
    });

    it('should handle empty variants array', () => {
      const result = extractor.findHighestQuality([]);
      expect(result).toBeNull();
    });

    it('should handle variants without resolution', () => {
      const variantsNoRes: M3U8Variant[] = [
        { url: 'high.m3u8', bandwidth: 2000000 },
        { url: 'low.m3u8', bandwidth: 500000 },
      ];

      const best = extractor.findHighestQuality(variantsNoRes);

      expect(best).toBeDefined();
      expect(best?.bandwidth).toBe(2000000);
    });
  });

  describe('getAllQualities', () => {
    it('should return all available qualities sorted', () => {
      const variants: M3U8Variant[] = [
        {
          url: '360p.m3u8',
          bandwidth: 500000,
          resolution: { width: 640, height: 360 },
        },
        {
          url: '1080p.m3u8',
          bandwidth: 2000000,
          resolution: { width: 1920, height: 1080 },
          codecs: 'avc1.42e01e',
        },
        {
          url: '720p.m3u8',
          bandwidth: 1000000,
          resolution: { width: 1280, height: 720 },
          framerate: 30,
        },
      ];

      const qualities = extractor.getAllQualities(variants);

      expect(qualities).toHaveLength(3);
      expect(qualities[0].label).toBe('360p');
      expect(qualities[1].label).toBe('720p');
      expect(qualities[2].label).toBe('1080p');
      expect(qualities[1].framerate).toBe(30);
      expect(qualities[2].codecs).toBe('avc1.42e01e');
    });

    it('should handle 4K and other resolutions', () => {
      const variants: M3U8Variant[] = [
        {
          url: '4k.m3u8',
          bandwidth: 8000000,
          resolution: { width: 3840, height: 2160 },
        },
        {
          url: '1440p.m3u8',
          bandwidth: 4000000,
          resolution: { width: 2560, height: 1440 },
        },
        {
          url: '144p.m3u8',
          bandwidth: 100000,
          resolution: { width: 256, height: 144 },
        },
      ];

      const qualities = extractor.getAllQualities(variants);

      expect(qualities[0].label).toBe('144p');
      expect(qualities[1].label).toBe('1440p');
      expect(qualities[2].label).toBe('4K');
    });
  });

  describe('getVideoSource', () => {
    it('should return direct video for mp4 URL', async () => {
      const url = 'https://example.com/video.mp4';

      const source = await extractor.getVideoSource(url);

      expect(source).toEqual({
        url,
        type: 'direct',
        headers: undefined,
      });
    });

    it('should handle m3u8 master playlist', async () => {
      const url = 'https://example.com/master.m3u8';
      const masterContent = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
720p.m3u8`;

      const mediaContent = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10,
segment0.ts
#EXT-X-ENDLIST`;

      (fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          text: async () => masterContent,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => mediaContent,
        });

      const source = await extractor.getVideoSource(url);

      expect(source).toBeDefined();
      expect(source?.type).toBe('m3u8');
      expect(source?.url).toBe('https://example.com/1080p.m3u8');
      expect(source?.quality?.label).toBe('1080p');
    });

    it('should handle m3u8 media playlist directly', async () => {
      const url = 'https://example.com/media.m3u8';
      const mediaContent = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXTINF:10,
segment0.ts
#EXT-X-ENDLIST`;

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => mediaContent,
      });

      const source = await extractor.getVideoSource(url);

      expect(source).toEqual({
        url,
        type: 'm3u8',
        headers: undefined,
      });
    });

    it('should pass headers when fetching', async () => {
      const url = 'https://example.com/playlist.m3u8';
      const headers = {
        Authorization: 'Bearer token123',
        'X-Custom': 'value',
      };

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        text: async () => '#EXTM3U\n#EXTINF:10,\nsegment.ts',
      });

      await extractor.getVideoSource(url, headers);

      expect(fetch).toHaveBeenCalledWith(url, {
        headers,
        credentials: 'omit',
      });
    });

    it('should handle fetch errors', async () => {
      const url = 'https://example.com/error.m3u8';

      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const source = await extractor.getVideoSource(url);

      expect(source).toBeNull();
    });

    it('should handle non-200 responses', async () => {
      const url = 'https://example.com/404.m3u8';

      (fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      const source = await extractor.getVideoSource(url);

      expect(source).toBeNull();
    });

    it('should return null for unsupported formats', async () => {
      const url = 'https://example.com/video.unknown';

      const source = await extractor.getVideoSource(url);

      expect(source).toBeNull();
    });

    it('should detect DASH but not support it yet', async () => {
      const url = 'https://example.com/manifest.mpd';

      const source = await extractor.getVideoSource(url);

      expect(source).toBeNull();
    });
  });
});
