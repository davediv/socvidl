/**
 * PlatformAdapter Base Class
 * Abstract base class for platform-specific implementations
 */

import type { VideoElement, VideoMetadata, Platform } from '../types';

export interface PlatformConfig {
  name: string;
  domains: string[];
  selectors: {
    video: string;
    container: string;
    actionBar?: string;
    username?: string;
    postId?: string;
  };
  features: {
    hasM3U8?: boolean;
    hasDASH?: boolean;
    hasDirectVideo?: boolean;
    requiresAuth?: boolean;
    supportsQuality?: boolean;
  };
}

export interface VideoExtractionResult {
  url: string | null;
  type: 'direct' | 'm3u8' | 'dash' | 'blob';
  qualities?: VideoQuality[];
  metadata?: Partial<VideoMetadata>;
}

export interface VideoQuality {
  label: string;
  resolution: string;
  bitrate?: number;
  url?: string;
}

export interface PostMetadata {
  username: string;
  postId: string;
  timestamp?: number;
  description?: string;
  hashtags?: string[];
}

/**
 * Abstract base class for platform-specific adapters
 */
export abstract class PlatformAdapter {
  protected platform: Platform;
  protected config: PlatformConfig;
  protected enableLogging: boolean;

  constructor(platform: Platform, config: PlatformConfig, enableLogging = false) {
    this.platform = platform;
    this.config = config;
    this.enableLogging = enableLogging;
  }

  /**
   * Check if current domain matches this platform
   */
  matchesDomain(hostname: string): boolean {
    return this.config.domains.some(
      domain => hostname.includes(domain) || hostname.endsWith(domain)
    );
  }

  /**
   * Get platform name
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get platform identifier
   */
  getPlatform(): Platform {
    return this.platform;
  }

  /**
   * Abstract method: Detect if page has videos
   */
  abstract hasVideos(): boolean;

  /**
   * Abstract method: Find all video elements on page
   */
  abstract findVideoElements(): VideoElement[];

  /**
   * Abstract method: Check if element is a valid video for this platform
   */
  abstract isValidVideo(element: VideoElement): boolean;

  /**
   * Abstract method: Extract video URL and metadata
   */
  abstract extractVideoData(element: VideoElement): Promise<VideoExtractionResult>;

  /**
   * Abstract method: Find container element for video
   */
  abstract findVideoContainer(element: VideoElement): HTMLElement | null;

  /**
   * Abstract method: Extract post metadata
   */
  abstract extractPostMetadata(container: HTMLElement): PostMetadata;

  /**
   * Abstract method: Get optimal button injection point
   */
  abstract getButtonInjectionPoint(container: HTMLElement): HTMLElement | null;

  /**
   * Get video selector for this platform
   */
  getVideoSelector(): string {
    return this.config.selectors.video;
  }

  /**
   * Get container selector for this platform
   */
  getContainerSelector(): string {
    return this.config.selectors.container;
  }

  /**
   * Check if video element has already been processed
   */
  isProcessed(element: VideoElement): boolean {
    return element.dataset['socvidlProcessed'] === 'true';
  }

  /**
   * Mark video element as processed
   */
  markAsProcessed(element: VideoElement, id: string): void {
    element.dataset['socvidlProcessed'] = 'true';
    element.dataset['socvidlId'] = id;
  }

  /**
   * Extract basic video metadata
   */
  protected extractBasicMetadata(video: VideoElement): VideoMetadata {
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
   * Check if video has audio
   */
  protected checkHasAudio(video: VideoElement): boolean {
    // Try to check audio tracks if available
    if ('audioTracks' in video) {
      return (video as any).audioTracks?.length > 0;
    }

    // Check if muted attribute is set
    if (video.hasAttribute('muted')) {
      return false;
    }

    // Default to true
    return true;
  }

  /**
   * Log message if logging is enabled
   */
  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.enableLogging) return;

    const prefix = `[SocviDL:${this.config.name}]`;
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

  /**
   * Handle UI variations (old vs new)
   */
  abstract handleUIVariations(): void;

  /**
   * Clean up adapter resources
   */
  cleanup(): void {
    // Override in subclasses if needed
  }

  /**
   * Get platform-specific request headers if needed
   */
  getRequestHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Check if platform requires authentication
   */
  requiresAuth(): boolean {
    return this.config.features.requiresAuth || false;
  }

  /**
   * Check if platform supports quality selection
   */
  supportsQuality(): boolean {
    return this.config.features.supportsQuality || false;
  }

  /**
   * Get platform features
   */
  getFeatures(): PlatformConfig['features'] {
    return this.config.features;
  }
}
