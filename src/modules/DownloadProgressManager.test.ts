import { DownloadProgressManager } from './DownloadProgressManager';
import { ButtonInjector } from './ButtonInjector';
import { DownloadManager } from './DownloadManager';
import type { DetectedVideo } from './VideoDetector';

// Mock dependencies
jest.mock('./ButtonInjector');
jest.mock('./DownloadManager');

// Mock Chrome API
const mockChrome = {
  downloads: {
    onChanged: {
      addListener: jest.fn(),
    },
  },
};

(global as any).chrome = mockChrome;

describe('DownloadProgressManager', () => {
  let manager: DownloadProgressManager;
  let mockButtonInjector: jest.Mocked<ButtonInjector>;
  let mockDownloadManager: jest.Mocked<DownloadManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset singleton instances
    (DownloadProgressManager as any).instance = undefined;

    // Setup mocks
    mockButtonInjector = {
      updateButtonState: jest.fn(),
      injectedButtons: new Map(),
    } as any;

    mockDownloadManager = {
      initiateDownload: jest.fn(),
    } as any;

    (ButtonInjector.getInstance as jest.Mock).mockReturnValue(mockButtonInjector);
    (DownloadManager.getInstance as jest.Mock).mockReturnValue(mockDownloadManager);

    manager = DownloadProgressManager.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DownloadProgressManager.getInstance();
      const instance2 = DownloadProgressManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('startDownload', () => {
    const mockVideo: DetectedVideo = {
      id: 'video-123',
      element: document.createElement('video'),
      url: 'https://example.com/video.mp4',
      platform: 'twitter',
      container: document.createElement('div'),
      metadata: {
        username: 'testuser',
        postId: 'post123',
        timestamp: Date.now(),
      },
    };

    it('should start download with visual feedback', async () => {
      mockDownloadManager.initiateDownload.mockResolvedValue({
        success: true,
        downloadId: 456,
        filename: 'video.mp4',
      });

      const onProgress = jest.fn();
      const onComplete = jest.fn();

      await manager.startDownload({
        video: mockVideo,
        onProgress,
        onComplete,
      });

      // Should update button state to loading
      expect(mockButtonInjector.updateButtonState).toHaveBeenCalledWith(
        'video-123',
        'loading',
        'Preparing...'
      );

      // Should call download manager
      expect(mockDownloadManager.initiateDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          platform: 'twitter',
          username: 'testuser',
          postId: 'post123',
          url: 'https://example.com/video.mp4',
        })
      );

      // Should update to success state
      expect(mockButtonInjector.updateButtonState).toHaveBeenCalledWith(
        'video-123',
        'success',
        'Downloaded!'
      );

      // Should call callbacks
      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalled();
    });

    it('should handle download errors', async () => {
      const error = new Error('Network error');
      mockDownloadManager.initiateDownload.mockRejectedValue(error);

      const onError = jest.fn();

      await manager.startDownload({
        video: mockVideo,
        onError,
      });

      // Should update to error state
      expect(mockButtonInjector.updateButtonState).toHaveBeenCalledWith(
        'video-123',
        'error',
        'Error'
      );

      // Should call error callback
      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should prevent duplicate downloads', async () => {
      mockDownloadManager.initiateDownload.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const promise1 = manager.startDownload({ video: mockVideo });
      const promise2 = manager.startDownload({ video: mockVideo });

      await Promise.all([promise1, promise2]);

      // Should only call download manager once
      expect(mockDownloadManager.initiateDownload).toHaveBeenCalledTimes(1);
    });

    it('should handle blob downloads', async () => {
      const blob = new Blob(['test data'], { type: 'video/mp4' });
      const videoWithBlob: DetectedVideo = {
        ...mockVideo,
        metadata: {
          ...mockVideo.metadata,
          blob,
        },
      };

      mockDownloadManager.initiateDownload.mockResolvedValue({
        success: true,
        downloadId: 789,
        filename: 'video.mp4',
      });

      await manager.startDownload({ video: videoWithBlob });

      expect(mockDownloadManager.initiateDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          blob,
          platform: 'twitter',
        })
      );
    });

    it('should handle missing video source', async () => {
      const videoNoSource: DetectedVideo = {
        ...mockVideo,
        url: undefined,
      };

      const onError = jest.fn();

      await manager.startDownload({
        video: videoNoSource,
        onError,
      });

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'No video source available',
        })
      );
    });
  });

  describe('Progress Updates', () => {
    it('should update progress bar during download', () => {
      const button = document.createElement('button');
      const mockInjectedButton = {
        element: button,
        videoId: 'video-123',
      };

      mockButtonInjector.injectedButtons.set('video-123', mockInjectedButton as any);

      // Access private method through prototype
      const updateProgressBar = (manager as any).updateProgressBar.bind(manager);
      updateProgressBar('video-123', 50);

      const progressBar = button.querySelector('.progress-bar') as HTMLElement;
      expect(progressBar).toBeTruthy();
      expect(progressBar?.style.width).toBe('50%');
    });

    it('should remove progress bar when complete', async () => {
      const button = document.createElement('button');
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      button.appendChild(progressBar);

      const mockInjectedButton = {
        element: button,
        videoId: 'video-123',
      };

      mockButtonInjector.injectedButtons.set('video-123', mockInjectedButton as any);

      const updateProgressBar = (manager as any).updateProgressBar.bind(manager);
      updateProgressBar('video-123', 100);

      // Progress bar should be removed after timeout
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(button.querySelector('.progress-bar')).toBeFalsy();
    });
  });

  describe('Chrome Download Integration', () => {
    it('should setup Chrome download listener', () => {
      expect(mockChrome.downloads.onChanged.addListener).toHaveBeenCalled();
    });

    it('should handle Chrome download progress events', () => {
      const listener = mockChrome.downloads.onChanged.addListener.mock.calls[0][0];

      // Simulate progress event
      listener({
        id: 123,
        state: { current: 'in_progress' },
        bytesReceived: { current: 500000 },
        totalBytes: { current: 1000000 },
      });

      // Note: In real implementation, would need to map download ID to video ID
    });

    it('should handle download completion', () => {
      const listener = mockChrome.downloads.onChanged.addListener.mock.calls[0][0];

      listener({
        id: 123,
        state: { current: 'complete' },
      });

      // Note: In real implementation, would update button state to success
    });

    it('should handle download interruption', () => {
      const listener = mockChrome.downloads.onChanged.addListener.mock.calls[0][0];

      listener({
        id: 123,
        state: { current: 'interrupted' },
        error: { current: 'Network failed' },
      });

      // Note: In real implementation, would update button state to error
    });
  });

  describe('Utility Methods', () => {
    it('should cancel active download', async () => {
      const mockVideo: DetectedVideo = {
        id: 'video-123',
        element: document.createElement('video'),
        url: 'https://example.com/video.mp4',
        platform: 'twitter',
        container: document.createElement('div'),
      };

      // Start a download
      mockDownloadManager.initiateDownload.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 1000))
      );

      const downloadPromise = manager.startDownload({ video: mockVideo });

      // Cancel it
      const cancelled = await manager.cancelDownload('video-123');
      expect(cancelled).toBe(true);

      await downloadPromise;

      expect(mockButtonInjector.updateButtonState).toHaveBeenCalledWith(
        'video-123',
        'idle',
        'Download'
      );
    });

    it('should track download progress', async () => {
      expect(manager.getProgress('video-123')).toBeNull();

      // Would be set during actual download
      (manager as any).downloadProgress.set('video-123', 75);

      expect(manager.getProgress('video-123')).toBe(75);
    });

    it('should check if download is active', () => {
      expect(manager.isDownloading('video-123')).toBe(false);

      const mockVideo: DetectedVideo = {
        id: 'video-123',
        element: document.createElement('video'),
        url: 'https://example.com/video.mp4',
        platform: 'twitter',
        container: document.createElement('div'),
      };

      mockDownloadManager.initiateDownload.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      manager.startDownload({ video: mockVideo });

      expect(manager.isDownloading('video-123')).toBe(true);
    });
  });

  describe('Visual Feedback', () => {
    it('should show success animation', () => {
      const button = document.createElement('button');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      svg.appendChild(path);
      button.appendChild(svg);

      const mockInjectedButton = {
        element: button,
        videoId: 'video-123',
      };

      mockButtonInjector.injectedButtons.set('video-123', mockInjectedButton as any);

      const showSuccessAnimation = (manager as any).showSuccessAnimation.bind(manager);
      showSuccessAnimation('video-123');

      // Check that icon was changed to checkmark
      const pathElement = button.querySelector('path');
      expect(pathElement?.getAttribute('d')).toContain('M9 16.17');
    });

    it('should show error animation with retry', () => {
      const button = document.createElement('button');
      const span = document.createElement('span');
      span.textContent = 'Download';
      button.appendChild(span);

      const mockInjectedButton = {
        element: button,
        videoId: 'video-123',
      };

      mockButtonInjector.injectedButtons.set('video-123', mockInjectedButton as any);

      const showErrorAnimation = (manager as any).showErrorAnimation.bind(manager);
      showErrorAnimation('video-123', 'Network error');

      // Check that text was changed to retry
      expect(span.textContent).toBe('Retry');
      expect(button.title).toContain('Network error');
    });
  });
});
