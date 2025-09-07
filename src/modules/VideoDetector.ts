/**
 * VideoDetector Module
 * Responsible for detecting and monitoring video elements on web pages
 */

import type { Platform, VideoElement, VideoMetadata, DetectedVideo } from '../types';

export interface VideoDetectorOptions {
  platform: Platform;
  processedAttribute?: string;
  debounceDelay?: number;
  enableLogging?: boolean;
}

/**
 * VideoDetector class for finding and monitoring video elements
 */
export class VideoDetector {
  private platform: Platform;
  private processedAttribute: string;
  private debounceDelay: number;
  private enableLogging: boolean;
  private observer: MutationObserver | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private detectedVideos: Map<string, DetectedVideo> = new Map();
  private videoIdCounter = 0;
  private videoCallbacks: Set<(video: DetectedVideo) => void> = new Set();

  constructor(options: VideoDetectorOptions) {
    this.platform = options.platform;
    this.processedAttribute = options.processedAttribute ?? 'socvidlProcessed';
    this.debounceDelay = options.debounceDelay ?? 500;
    this.enableLogging = options.enableLogging ?? false;
  }

  /**
   * Detect all videos currently in the DOM
   * @returns Array of detected video elements
   */
  public detectVideos(): DetectedVideo[] {
    const selector = this.getVideoSelector();
    const videoElements = document.querySelectorAll<VideoElement>(selector);
    const detectedVideos: DetectedVideo[] = [];

    videoElements.forEach((video) => {
      if (!this.isVideoProcessed(video) && this.isVideoElement(video)) {
        const detectedVideo = this.processVideo(video);
        if (detectedVideo) {
          detectedVideos.push(detectedVideo);
        }
      }
    });

    this.log(`Detected ${detectedVideos.length} new videos`);
    return detectedVideos;
  }

  /**
   * Start observing DOM mutations for new videos
   */
  public observeMutations(): void {
    if (this.observer) {
      this.log('Observer already active');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src'],
    });

    this.log('Started observing DOM mutations');
  }

  /**
   * Stop observing DOM mutations
   */
  public stopObserving(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
      this.log('Stopped observing DOM mutations');
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Check if an element is a valid video element
   * @param element - Element to check
   */
  public isVideoElement(element: Element): element is VideoElement {
    if (!(element instanceof HTMLVideoElement)) {
      return false;
    }

    // Check if video has a source
    const hasSource = !!(element.src || element.querySelector('source')?.src);
    
    // Check if it's not a preview/thumbnail
    const isNotThumbnail = !element.classList.contains('thumbnail') &&
                          !element.classList.contains('preview') &&
                          !element.hasAttribute('data-thumbnail');

    // Platform-specific checks
    const platformValid = this.isPlatformSpecificVideo(element);

    return hasSource && isNotThumbnail && platformValid;
  }

  /**
   * Register a callback for when new videos are detected
   * @param callback - Function to call with detected video
   */
  public onVideoDetected(callback: (video: DetectedVideo) => void): void {
    this.videoCallbacks.add(callback);
  }

  /**
   * Unregister a video detection callback
   * @param callback - Callback to remove
   */
  public offVideoDetected(callback: (video: DetectedVideo) => void): void {
    this.videoCallbacks.delete(callback);
  }

  /**
   * Get all currently detected videos
   */
  public getDetectedVideos(): DetectedVideo[] {
    return Array.from(this.detectedVideos.values());
  }

  /**
   * Clear a specific video from detection
   * @param videoId - ID of video to clear
   */
  public clearVideo(videoId: string): void {
    this.detectedVideos.delete(videoId);
  }

  /**
   * Clear all detected videos
   */
  public clearAll(): void {
    this.detectedVideos.clear();
    this.videoIdCounter = 0;
  }

  /**
   * Get platform-specific video selector
   */
  private getVideoSelector(): string {
    switch (this.platform) {
      case 'twitter':
        return 'video, div[data-testid="videoPlayer"] video, [aria-label*="Video"] video';
      case 'reddit':
        return 'video[class*="media-element"], shreddit-player video, video[data-hls-url], video[src*="v.redd.it"]';
      default:
        return 'video';
    }
  }

  /**
   * Check platform-specific video validity
   */
  private isPlatformSpecificVideo(video: VideoElement): boolean {
    switch (this.platform) {
      case 'twitter':
        // Exclude GIFs and external embeds
        const tweet = video.closest('article, [data-testid="tweet"]');
        const isGif = tweet?.querySelector('[aria-label*="GIF"]') !== null;
        const isExternalEmbed = video.src.includes('youtube') || video.src.includes('vimeo');
        return !isGif && !isExternalEmbed;
      
      case 'reddit':
        // Only include Reddit-hosted videos
        const isRedditVideo = video.src.includes('v.redd.it') || 
                              video.src.includes('reddit.com') ||
                              video.hasAttribute('data-hls-url');
        return isRedditVideo;
      
      default:
        return true;
    }
  }

  /**
   * Check if video has already been processed
   */
  private isVideoProcessed(video: VideoElement): boolean {
    return video.hasAttribute(`data-${this.processedAttribute}`);
  }

  /**
   * Mark video as processed
   */
  private markVideoAsProcessed(video: VideoElement, id: string): void {
    // Use data attribute instead of direct property assignment
    video.setAttribute(`data-${this.processedAttribute}`, 'true');
    video.dataset['socvidlId'] = id;
  }

  /**
   * Process a video element
   */
  private processVideo(video: VideoElement): DetectedVideo | null {
    try {
      const id = `socvidl-video-${++this.videoIdCounter}`;
      this.markVideoAsProcessed(video, id);

      const detectedVideo: DetectedVideo = {
        element: video,
        id,
        url: this.extractVideoUrl(video),
        platform: this.platform,
        container: this.findVideoContainer(video),
        metadata: this.extractVideoMetadata(video),
      };

      this.detectedVideos.set(id, detectedVideo);
      this.notifyCallbacks(detectedVideo);
      
      return detectedVideo;
    } catch (error) {
      this.log(`Error processing video: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Extract video URL from element
   */
  private extractVideoUrl(video: VideoElement): string | null {
    // Direct src
    if (video.src) {
      return video.src;
    }

    // Source elements
    const source = video.querySelector('source');
    if (source?.src) {
      return source.src;
    }

    // Data attributes (platform-specific)
    if (video.dataset['src']) {
      return video.dataset['src'];
    }

    return null;
  }

  /**
   * Find the appropriate container for the video
   */
  private findVideoContainer(video: VideoElement): HTMLElement | null {
    switch (this.platform) {
      case 'twitter':
        return video.closest('article, [data-testid="tweet"]') as HTMLElement;
      
      case 'reddit':
        return video.closest('shreddit-post, .Post, [data-test-id="post-content"]') as HTMLElement;
      
      default:
        return video.parentElement;
    }
  }

  /**
   * Extract video metadata
   */
  private extractVideoMetadata(video: VideoElement): VideoMetadata {
    return {
      duration: video.duration || null,
      width: video.videoWidth || null,
      height: video.videoHeight || null,
      poster: video.poster || null,
      isLive: video.duration === Infinity,
      hasAudio: this.checkHasAudio(video),
    };
  }

  /**
   * Check if video has audio track
   */
  private checkHasAudio(video: VideoElement): boolean {
    // Try to check audio tracks if available
    if ('audioTracks' in video) {
      return (video as any).audioTracks?.length > 0;
    }
    
    // Platform-specific checks
    if (this.platform === 'reddit') {
      // Reddit videos often have separate audio
      return !video.hasAttribute('data-muted');
    }

    // Default assumption
    return !video.muted;
  }

  /**
   * Handle DOM mutations
   */
  private handleMutations(mutations: MutationRecord[]): void {
    // Debounce mutation handling
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      let hasNewVideos = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.tagName === 'VIDEO' && this.isVideoElement(element)) {
                hasNewVideos = true;
              } else if (element.querySelector('video')) {
                hasNewVideos = true;
              }
            }
          });
        }
      }

      if (hasNewVideos) {
        this.detectVideos();
      }
    }, this.debounceDelay);
  }

  /**
   * Notify callbacks of detected video
   */
  private notifyCallbacks(video: DetectedVideo): void {
    this.videoCallbacks.forEach((callback) => {
      try {
        callback(video);
      } catch (error) {
        this.log(`Error in video detection callback: ${error}`, 'error');
      }
    });
  }

  /**
   * Log messages if logging is enabled
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.enableLogging) return;

    const prefix = '[SocviDL VideoDetector]';
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