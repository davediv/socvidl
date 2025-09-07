import { SegmentDownloader, type SegmentInfo, type DownloadProgress } from './SegmentDownloader';

// Mock fetch for testing
global.fetch = jest.fn();

describe('SegmentDownloader', () => {
  let downloader: SegmentDownloader;

  beforeEach(() => {
    downloader = new SegmentDownloader();
    jest.clearAllMocks();
  });

  describe('downloadSegments', () => {
    it('should download and concatenate segments successfully', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
        { url: 'https://example.com/seg2.ts', duration: 10, index: 1 },
        { url: 'https://example.com/seg3.ts', duration: 10, index: 2 },
      ];

      const mockData = new ArrayBuffer(1024);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      });

      const result = await downloader.downloadSegments(segments);

      expect(result).toBeDefined();
      expect(result.mimeType).toBe('video/mp4');
      expect(result.duration).toBe(30);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle empty segments array', async () => {
      await expect(downloader.downloadSegments([])).rejects.toThrow(
        'No segments provided for download'
      );
    });

    it('should report progress during download', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
        { url: 'https://example.com/seg2.ts', duration: 10, index: 1 },
      ];

      const mockData = new ArrayBuffer(1024);
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockData),
      });

      const progressUpdates: DownloadProgress[] = [];
      const onProgress = jest.fn((progress: DownloadProgress) => {
        progressUpdates.push(progress);
      });

      await downloader.downloadSegments(segments, { onProgress });

      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);

      const lastProgress = progressUpdates[progressUpdates.length - 1];
      expect(lastProgress?.currentSegment).toBe(2);
      expect(lastProgress?.totalSegments).toBe(2);
      expect(lastProgress?.percentage).toBe(100);
    });

    it('should handle abort signal', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
      ];

      const controller = new AbortController();
      controller.abort();

      await expect(
        downloader.downloadSegments(segments, { signal: controller.signal })
      ).rejects.toThrow('Download aborted');
    });

    it('should retry failed downloads with exponential backoff', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
      ];

      const mockData = new ArrayBuffer(1024);
      let callCount = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Network error');
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockData),
        });
      });

      const result = await downloader.downloadSegments(segments, {
        maxRetries: 3,
        retryDelay: 10, // Short delay for testing
      });

      expect(result).toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
      ];

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        downloader.downloadSegments(segments, {
          maxRetries: 2,
          retryDelay: 10,
        })
      ).rejects.toThrow('Failed to download segment after 2 retries');
    });

    it('should handle HTTP errors', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(downloader.downloadSegments(segments, { maxRetries: 0 })).rejects.toThrow(
        'HTTP error! status: 404'
      );
    });

    it('should handle concurrent downloads', async () => {
      const segments: SegmentInfo[] = Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/seg${i}.ts`,
        duration: 10,
        index: i,
      }));

      const mockData = new ArrayBuffer(1024);
      let concurrentCalls = 0;
      let maxConcurrent = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        concurrentCalls++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCalls);

        // Simulate network delay
        return new Promise(resolve => {
          setTimeout(() => {
            concurrentCalls--;
            resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(mockData),
            });
          }, 10);
        });
      });

      await downloader.downloadSegments(segments, { maxConcurrent: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(global.fetch).toHaveBeenCalledTimes(10);
    });
  });

  describe('concatenateSegments', () => {
    it('should concatenate array buffers into a blob', () => {
      const segments = [new ArrayBuffer(100), new ArrayBuffer(200), new ArrayBuffer(150)];

      const result = downloader.concatenateSegments(segments);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('video/mp4');
      expect(result.size).toBe(450);
    });

    it('should handle empty segments array', () => {
      expect(() => downloader.concatenateSegments([])).toThrow('No segments to concatenate');
    });

    it('should filter out undefined segments', () => {
      const segments = [
        new ArrayBuffer(100),
        undefined as unknown as ArrayBuffer,
        new ArrayBuffer(200),
      ];

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = downloader.concatenateSegments(segments);

      expect(result).toBeInstanceOf(Blob);
      expect(result.size).toBe(300);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Missing segments detected'));

      consoleSpy.mockRestore();
    });
  });

  describe('parseSegmentsFromM3U8', () => {
    it('should parse segments from m3u8 content', () => {
      const m3u8Content = `
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXTINF:5.5,
segment3.ts
#EXT-X-ENDLIST
      `.trim();

      const segments = SegmentDownloader.parseSegmentsFromM3U8(m3u8Content);

      expect(segments).toHaveLength(3);
      expect(segments[0]).toEqual({
        url: 'segment1.ts',
        duration: 10,
        index: 0,
      });
      expect(segments[1]).toEqual({
        url: 'segment2.ts',
        duration: 10,
        index: 1,
      });
      expect(segments[2]).toEqual({
        url: 'segment3.ts',
        duration: 5.5,
        index: 2,
      });
    });

    it('should resolve relative URLs with base URL', () => {
      const m3u8Content = `
#EXTM3U
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
/absolute/segment2.ts
#EXTINF:10.0,
https://cdn.example.com/segment3.ts
      `.trim();

      const baseUrl = 'https://example.com/video/playlist.m3u8';
      const segments = SegmentDownloader.parseSegmentsFromM3U8(m3u8Content, baseUrl);

      expect(segments).toHaveLength(3);
      expect(segments[0]?.url).toBe('https://example.com/video/segment1.ts');
      expect(segments[1]?.url).toBe('https://example.com/absolute/segment2.ts');
      expect(segments[2]?.url).toBe('https://cdn.example.com/segment3.ts');
    });

    it('should handle empty m3u8 content', () => {
      const segments = SegmentDownloader.parseSegmentsFromM3U8('');
      expect(segments).toHaveLength(0);
    });

    it('should ignore comments and metadata', () => {
      const m3u8Content = `
#EXTM3U
#EXT-X-VERSION:3
# This is a comment
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment1.ts
#EXT-X-DISCONTINUITY
#EXTINF:10.0,
segment2.ts
      `.trim();

      const segments = SegmentDownloader.parseSegmentsFromM3U8(m3u8Content);

      expect(segments).toHaveLength(2);
      expect(segments[0]?.url).toBe('segment1.ts');
      expect(segments[1]?.url).toBe('segment2.ts');
    });
  });

  describe('estimateDownloadSize', () => {
    it('should estimate size based on HEAD requests', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
        { url: 'https://example.com/seg2.ts', duration: 10, index: 1 },
        { url: 'https://example.com/seg3.ts', duration: 10, index: 2 },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-length': '1048576' }), // 1MB
      });

      const estimatedSize = await SegmentDownloader.estimateDownloadSize(segments);

      expect(estimatedSize).toBe(3145728); // 3MB total
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'HEAD' })
      );
    });

    it('should use fallback estimate when HEAD requests fail', async () => {
      const segments: SegmentInfo[] = Array.from({ length: 10 }, (_, i) => ({
        url: `https://example.com/seg${i}.ts`,
        duration: 10,
        index: i,
      }));

      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const estimatedSize = await SegmentDownloader.estimateDownloadSize(segments);

      expect(estimatedSize).toBe(10 * 500 * 1024); // Fallback: 500KB per segment
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle empty segments array', async () => {
      const estimatedSize = await SegmentDownloader.estimateDownloadSize([]);
      expect(estimatedSize).toBe(0);
    });

    it('should handle missing content-length header', async () => {
      const segments: SegmentInfo[] = [
        { url: 'https://example.com/seg1.ts', duration: 10, index: 0 },
      ];

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Headers({}), // No content-length
      });

      const estimatedSize = await SegmentDownloader.estimateDownloadSize(segments);

      expect(estimatedSize).toBe(500 * 1024); // Fallback estimate
    });
  });
});
