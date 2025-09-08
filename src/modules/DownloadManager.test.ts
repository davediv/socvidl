import { DownloadManager, type DownloadOptions } from './DownloadManager';

// Mock Chrome API
const mockChrome = {
  downloads: {
    download: jest.fn(),
    search: jest.fn(),
    cancel: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    erase: jest.fn(),
  },
  runtime: {
    lastError: null as { message: string } | null,
  },
};

// Set up global chrome mock
(global as any).chrome = mockChrome;
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();

describe('DownloadManager', () => {
  let manager: DownloadManager;

  beforeEach(() => {
    manager = DownloadManager.getInstance();
    jest.clearAllMocks();
    mockChrome.runtime.lastError = null;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DownloadManager.getInstance();
      const instance2 = DownloadManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('generateFilename', () => {
    it('should generate filename with default template', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'testuser',
        timestamp: 1704067200000, // 2024-01-01 00:00:00
      };

      const filename = manager.generateFilename(options);

      expect(filename).toContain('twitter');
      expect(filename).toContain('testuser');
      expect(filename).toContain('1704067200000');
      expect(filename.endsWith('.mp4')).toBe(true);
    });

    it('should sanitize special characters in filename', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'test<>user:*?',
        postId: 'post/id\\123',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).not.toMatch(/[<>:"/\\|?*]/);
      expect(filename).toContain('test_user');
      expect(filename).toContain('post_id_123');
    });

    it('should handle empty or missing fields', () => {
      const options: DownloadOptions = {
        platform: undefined,
        username: '',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).toContain('unknown');
      expect(filename).toContain('user');
      expect(filename.endsWith('.mp4')).toBe(true);
    });

    it('should handle Windows reserved names', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'CON',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).toContain('_CON');
    });

    it('should truncate long filenames', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'a'.repeat(300),
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename.length).toBeLessThanOrEqual(255);
      expect(filename).toContain('...');
      expect(filename.endsWith('.mp4')).toBe(true);
    });

    it('should remove multiple consecutive underscores', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'test___user',
        postId: '',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).not.toContain('___');
      expect(filename).not.toContain('__');
    });

    it('should handle spaces in username', () => {
      const options: DownloadOptions = {
        platform: 'reddit',
        username: 'test user name',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).toContain('test_user_name');
      expect(filename).not.toContain(' ');
    });

    it('should include formatted date and time', () => {
      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'testuser',
        timestamp: new Date('2024-01-15T14:30:45').getTime(),
      };

      manager.setFilenameTemplate('{platform}_{username}_{date}_{time}');
      const filename = manager.generateFilename(options);

      expect(filename).toContain('2024-01-15');
      expect(filename).toContain('14-30-45');
    });
  });

  describe('initiateDownload', () => {
    it('should download from URL successfully', async () => {
      const options: DownloadOptions = {
        url: 'https://example.com/video.mp4',
        filename: 'test_video.mp4',
      };

      mockChrome.downloads.download.mockImplementation((_opts, callback) => {
        callback?.(123);
      });

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback([{ id: 123, state: 'complete' }]);
      });

      const result = await manager.initiateDownload(options);

      expect(result.success).toBe(true);
      expect(result.downloadId).toBe(123);
      expect(result.filename).toBe('test_video.mp4');
      expect(mockChrome.downloads.download).toHaveBeenCalled();
    });

    it('should download from Blob successfully', async () => {
      const blob = new Blob(['test data'], { type: 'video/mp4' });
      const options: DownloadOptions = {
        blob,
        platform: 'twitter',
        username: 'testuser',
      };

      mockChrome.downloads.download.mockImplementation((_opts, callback) => {
        callback?.(456);
      });

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback([{ id: 456, state: 'complete' }]);
      });

      const result = await manager.initiateDownload(options);

      expect(result.success).toBe(true);
      expect(result.downloadId).toBe(456);
      expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
      expect(mockChrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'blob:mock-url',
          filename: expect.stringContaining('twitter_testuser'),
        }),
        expect.any(Function)
      );
    });

    it('should handle download errors', async () => {
      const options: DownloadOptions = {
        url: 'https://example.com/video.mp4',
      };

      mockChrome.runtime.lastError = { message: 'Download failed' };
      mockChrome.downloads.download.mockImplementation((_opts, callback) => {
        callback?.(undefined);
      });

      const result = await manager.initiateDownload(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download failed');
    });

    it('should handle missing URL and Blob', async () => {
      const options: DownloadOptions = {
        platform: 'twitter',
      };

      const result = await manager.initiateDownload(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No URL or blob provided for download');
    });

    it('should handle interrupted downloads', async () => {
      const options: DownloadOptions = {
        url: 'https://example.com/video.mp4',
      };

      mockChrome.downloads.download.mockImplementation((_opts, callback) => {
        callback?.(789);
      });

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback([
          {
            id: 789,
            state: 'interrupted',
            error: 'Network error',
          },
        ]);
      });

      const result = await manager.initiateDownload(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Download interrupted: Network error');
    });

    it('should use custom conflict action', async () => {
      const options: DownloadOptions = {
        url: 'https://example.com/video.mp4',
        conflictAction: 'overwrite',
      };

      mockChrome.downloads.download.mockImplementation((opts, callback) => {
        expect(opts.conflictAction).toBe('overwrite');
        callback?.(123);
      });

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback([{ id: 123, state: 'complete' }]);
      });

      await manager.initiateDownload(options);

      expect(mockChrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          conflictAction: 'overwrite',
        }),
        expect.any(Function)
      );
    });

    it('should handle saveAs option', async () => {
      const options: DownloadOptions = {
        url: 'https://example.com/video.mp4',
        saveAs: true,
      };

      mockChrome.downloads.download.mockImplementation((opts, callback) => {
        expect(opts.saveAs).toBe(true);
        callback?.(123);
      });

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback([{ id: 123, state: 'complete' }]);
      });

      await manager.initiateDownload(options);

      expect(mockChrome.downloads.download).toHaveBeenCalledWith(
        expect.objectContaining({
          saveAs: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Download Control Methods', () => {
    it('should cancel download', async () => {
      mockChrome.downloads.cancel.mockImplementation((_id, callback) => {
        callback?.();
      });

      const result = await manager.cancelDownload(123);

      expect(result).toBe(true);
      expect(mockChrome.downloads.cancel).toHaveBeenCalledWith(123, expect.any(Function));
    });

    it('should pause download', async () => {
      mockChrome.downloads.pause.mockImplementation((_id, callback) => {
        callback?.();
      });

      const result = await manager.pauseDownload(123);

      expect(result).toBe(true);
      expect(mockChrome.downloads.pause).toHaveBeenCalledWith(123, expect.any(Function));
    });

    it('should resume download', async () => {
      mockChrome.downloads.resume.mockImplementation((_id, callback) => {
        callback?.();
      });

      const result = await manager.resumeDownload(123);

      expect(result).toBe(true);
      expect(mockChrome.downloads.resume).toHaveBeenCalledWith(123, expect.any(Function));
    });

    it('should handle control method errors', async () => {
      mockChrome.runtime.lastError = { message: 'Operation failed' };
      mockChrome.downloads.cancel.mockImplementation((_id, callback) => {
        callback?.();
      });

      const result = await manager.cancelDownload(123);

      expect(result).toBe(false);
    });
  });

  describe('Download History', () => {
    it('should get download history', async () => {
      const mockDownloads = [
        { id: 1, filename: 'video1.mp4', state: 'complete' },
        { id: 2, filename: 'video2.mp4', state: 'complete' },
      ];

      mockChrome.downloads.search.mockImplementation((_query, callback) => {
        callback(mockDownloads);
      });

      const history = await manager.getDownloadHistory(10);

      expect(history).toEqual(mockDownloads);
      expect(mockChrome.downloads.search).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          orderBy: ['-startTime'],
        }),
        expect.any(Function)
      );
    });

    it('should clear download history', async () => {
      mockChrome.downloads.erase.mockImplementation((_query, callback) => {
        callback?.();
      });

      await manager.clearDownloadHistory();

      expect(mockChrome.downloads.erase).toHaveBeenCalledWith({}, expect.any(Function));
    });
  });

  describe('Filename Template', () => {
    it('should set and use custom filename template', () => {
      manager.setFilenameTemplate('{platform}_{postId}_{date}');

      const options: DownloadOptions = {
        platform: 'reddit',
        username: 'testuser',
        postId: 'abc123',
        timestamp: new Date('2024-01-15').getTime(),
      };

      const filename = manager.generateFilename(options);

      expect(filename).toContain('reddit');
      expect(filename).toContain('abc123');
      expect(filename).toContain('2024-01-15');
      expect(filename).not.toContain('testuser'); // Username not in template
    });

    it('should remove unused template variables', () => {
      manager.setFilenameTemplate('{platform}_{username}_{nonexistent}_{timestamp}');

      const options: DownloadOptions = {
        platform: 'twitter',
        username: 'testuser',
        timestamp: 1704067200000,
      };

      const filename = manager.generateFilename(options);

      expect(filename).not.toContain('{nonexistent}');
      expect(filename).not.toContain('{}');
    });
  });
});
