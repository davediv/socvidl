/**
 * DownloadProgressManager - Coordinates download progress with visual feedback
 * Integrates ButtonInjector, DownloadManager, and Chrome download bar
 */

import { ButtonInjector } from './ButtonInjector';
import { DownloadManager, type DownloadOptions } from './DownloadManager';
import type { DetectedVideo } from './VideoDetector';

export interface ProgressUpdate {
  videoId: string;
  state: 'idle' | 'preparing' | 'downloading' | 'processing' | 'complete' | 'error';
  progress?: number;
  message?: string;
  error?: string;
}

export interface DownloadRequest {
  video: DetectedVideo;
  options?: Partial<DownloadOptions>;
  onProgress?: (update: ProgressUpdate) => void;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
}

export class DownloadProgressManager {
  private static instance: DownloadProgressManager;
  private buttonInjector: ButtonInjector;
  private downloadManager: DownloadManager;
  private activeDownloads: Map<string, DownloadRequest> = new Map();
  private downloadProgress: Map<string, number> = new Map();

  private constructor() {
    this.buttonInjector = ButtonInjector.getInstance();
    this.downloadManager = DownloadManager.getInstance();
    this.setupChromeDownloadListener();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DownloadProgressManager {
    if (!DownloadProgressManager.instance) {
      DownloadProgressManager.instance = new DownloadProgressManager();
    }
    return DownloadProgressManager.instance;
  }

  /**
   * Initiates a download with progress tracking and visual feedback
   */
  async startDownload(request: DownloadRequest): Promise<void> {
    const { video, options = {}, onProgress, onComplete, onError } = request;

    // Prevent duplicate downloads
    if (this.activeDownloads.has(video.id)) {
      console.warn('Download already in progress for video:', video.id);
      return;
    }

    // Store the download request
    this.activeDownloads.set(video.id, request);

    try {
      // Update button to loading state
      this.updateProgress({
        videoId: video.id,
        state: 'preparing',
        message: 'Preparing...',
      });

      // Notify callback if provided
      onProgress?.({
        videoId: video.id,
        state: 'preparing',
        message: 'Preparing download...',
      });

      // Simulate preparation delay (fetching segments, etc.)
      await this.simulatePreparation(video);

      // Update to downloading state
      this.updateProgress({
        videoId: video.id,
        state: 'downloading',
        message: 'Downloading...',
        progress: 0,
      });

      // Prepare download options
      const downloadOptions: DownloadOptions = {
        platform: video.platform as 'twitter' | 'reddit',
        username: video.metadata?.username,
        postId: video.metadata?.postId,
        timestamp: video.metadata?.timestamp || Date.now(),
        ...options,
      };

      // Check if we have a blob or URL
      if (video.metadata?.blob) {
        downloadOptions.blob = video.metadata.blob as Blob;
      } else if (video.url) {
        downloadOptions.url = video.url;
      } else {
        throw new Error('No video source available');
      }

      // Start the download
      const result = await this.downloadManager.initiateDownload(downloadOptions);

      if (result.success) {
        // Update to complete state
        this.updateProgress({
          videoId: video.id,
          state: 'complete',
          message: 'Downloaded!',
          progress: 100,
        });

        // Notify success callback
        onComplete?.(result);

        // Show success animation
        this.showSuccessAnimation(video.id);
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);

      // Update to error state
      this.updateProgress({
        videoId: video.id,
        state: 'error',
        message: 'Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Notify error callback
      onError?.(error instanceof Error ? error : new Error('Download failed'));

      // Show error animation with retry option
      this.showErrorAnimation(video.id, error instanceof Error ? error.message : 'Download failed');
    } finally {
      // Clean up active download
      this.activeDownloads.delete(video.id);
      this.downloadProgress.delete(video.id);
    }
  }

  /**
   * Updates progress for a video download
   */
  private updateProgress(update: ProgressUpdate): void {
    const { videoId, state, message, progress } = update;

    // Map states to button states
    let buttonState: 'idle' | 'loading' | 'success' | 'error' = 'idle';
    let buttonText = message || 'Download';

    switch (state) {
      case 'preparing':
      case 'downloading':
      case 'processing':
        buttonState = 'loading';
        break;
      case 'complete':
        buttonState = 'success';
        break;
      case 'error':
        buttonState = 'error';
        break;
    }

    // Update button visual state
    this.buttonInjector.updateButtonState(videoId, buttonState, buttonText);

    // Update progress bar if supported
    if (progress !== undefined) {
      this.updateProgressBar(videoId, progress);
    }
  }

  /**
   * Updates the progress bar on the button
   */
  private updateProgressBar(videoId: string, progress: number): void {
    // Access private property through any cast (for now)
    const injectedButtons = (this.buttonInjector as any).injectedButtons as Map<string, any>;
    const injectedButton = injectedButtons?.get(videoId);
    if (!injectedButton) return;

    const button = injectedButton.element as HTMLButtonElement;
    let progressBar = button.querySelector('.progress-bar') as HTMLElement;

    // Create progress bar if it doesn't exist
    if (!progressBar) {
      progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      button.appendChild(progressBar);
    }

    // Update progress bar width
    progressBar.style.width = `${progress}%`;

    // Remove progress bar when complete
    if (progress >= 100) {
      setTimeout(() => {
        progressBar?.remove();
      }, 500);
    }
  }

  /**
   * Shows success animation and resets button
   */
  private showSuccessAnimation(videoId: string): void {
    // Update icon to checkmark
    this.updateButtonIcon(videoId, 'success');

    // Reset after animation
    setTimeout(() => {
      this.buttonInjector.updateButtonState(videoId, 'idle', 'Download');
      this.updateButtonIcon(videoId, 'download');
    }, 3000);
  }

  /**
   * Shows error animation with retry option
   */
  private showErrorAnimation(videoId: string, errorMessage: string): void {
    // Update icon to error
    this.updateButtonIcon(videoId, 'error');

    // Add retry functionality
    const injectedButton = this.buttonInjector['injectedButtons'].get(videoId);
    if (injectedButton) {
      const button = injectedButton.element;
      button.title = `Error: ${errorMessage}. Click to retry.`;

      // Update text to show retry
      const textElement = button.querySelector('span');
      if (textElement) {
        textElement.textContent = 'Retry';
      }
    }

    // Reset after delay
    setTimeout(() => {
      this.buttonInjector.updateButtonState(videoId, 'idle', 'Download');
      this.updateButtonIcon(videoId, 'download');

      const injectedButton = this.buttonInjector['injectedButtons'].get(videoId);
      if (injectedButton) {
        injectedButton.element.title = 'Download video with SocviDL';
      }
    }, 5000);
  }

  /**
   * Updates the button icon based on state
   */
  private updateButtonIcon(videoId: string, iconType: 'download' | 'success' | 'error'): void {
    const injectedButton = this.buttonInjector['injectedButtons'].get(videoId);
    if (!injectedButton) return;

    const button = injectedButton.element;
    const svg = button.querySelector('svg');
    if (!svg) return;

    let iconPath = '';
    switch (iconType) {
      case 'success':
        // Checkmark icon
        iconPath = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z';
        break;
      case 'error':
        // X icon
        iconPath =
          'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z';
        break;
      default:
        // Download icon
        iconPath = 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z';
    }

    const path = svg.querySelector('path');
    if (path) {
      path.setAttribute('d', iconPath);
    }
  }

  /**
   * Sets up Chrome download API listener for progress updates
   */
  private setupChromeDownloadListener(): void {
    if (!chrome?.downloads?.onChanged) return;

    chrome.downloads.onChanged.addListener(delta => {
      // Find the video ID associated with this download
      const videoId = this.findVideoIdByDownloadId(delta.id);
      if (!videoId) return;

      // Handle state changes
      if (delta.state) {
        switch (delta.state.current) {
          case 'in_progress':
            // Calculate progress if available
            if (delta.bytesReceived && delta.totalBytes) {
              const progress = (delta.bytesReceived.current / delta.totalBytes.current) * 100;
              this.updateProgress({
                videoId,
                state: 'downloading',
                progress: Math.round(progress),
                message: `${Math.round(progress)}%`,
              });
            }
            break;

          case 'complete':
            this.updateProgress({
              videoId,
              state: 'complete',
              message: 'Downloaded!',
              progress: 100,
            });
            break;

          case 'interrupted':
            this.updateProgress({
              videoId,
              state: 'error',
              message: 'Download interrupted',
              error: delta.error?.current || 'Unknown error',
            });
            break;
        }
      }

      // Handle progress updates
      if (delta.bytesReceived && !delta.state) {
        const activeDownload = this.activeDownloads.get(videoId);
        if (activeDownload && delta.totalBytes) {
          const progress = (delta.bytesReceived.current / delta.totalBytes.current) * 100;
          this.downloadProgress.set(videoId, progress);

          // Update progress bar
          this.updateProgressBar(videoId, progress);
        }
      }
    });
  }

  /**
   * Finds video ID by download ID (would need to track this mapping)
   */
  private findVideoIdByDownloadId(downloadId: number): string | null {
    // TODO: Implement download ID to video ID mapping
    // This would require storing the mapping when initiating downloads
    return null;
  }

  /**
   * Simulates preparation phase (e.g., fetching segments)
   */
  private async simulatePreparation(video: DetectedVideo): Promise<void> {
    // Simulate network delay for preparation
    await new Promise(resolve => setTimeout(resolve, 500));

    // In real implementation, this would:
    // 1. Fetch m3u8 playlist if needed
    // 2. Parse segments
    // 3. Prepare for download
  }

  /**
   * Cancels an active download
   */
  async cancelDownload(videoId: string): Promise<boolean> {
    const activeDownload = this.activeDownloads.get(videoId);
    if (!activeDownload) return false;

    // TODO: Implement actual cancellation logic
    // This would need to track download IDs and call downloadManager.cancelDownload()

    this.activeDownloads.delete(videoId);
    this.downloadProgress.delete(videoId);
    this.buttonInjector.updateButtonState(videoId, 'idle', 'Download');

    return true;
  }

  /**
   * Gets current download progress for a video
   */
  getProgress(videoId: string): number | null {
    return this.downloadProgress.get(videoId) || null;
  }

  /**
   * Checks if a download is active for a video
   */
  isDownloading(videoId: string): boolean {
    return this.activeDownloads.has(videoId);
  }
}
