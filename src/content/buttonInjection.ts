import { ButtonInjector } from '../modules/ButtonInjector';
import { VideoDetector } from '../modules/VideoDetector';
import { DetectedVideo, Platform } from '../types';

/**
 * Integration module for button injection with video detection
 */
export class VideoButtonManager {
  private videoDetector: VideoDetector;
  private buttonInjector: ButtonInjector;
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
    
    // Initialize video detector
    this.videoDetector = new VideoDetector({
      platform,
      debounceDelay: 500
    });

    // Initialize button injector
    this.buttonInjector = new ButtonInjector({
      platform,
      buttonText: 'Download',
      showTextOnMobile: false
    });

    // Set up event listeners
    this.setupEventListeners();
  }

  /**
   * Initializes the video button management system
   */
  init(): void {
    // Detect existing videos
    const videos = this.videoDetector.detectVideos();
    videos.forEach(video => this.handleVideoDetected(video));

    // Start observing for new videos
    this.videoDetector.observeMutations();

    // Monitor theme changes
    this.observeThemeChanges();
  }

  /**
   * Sets up event listeners for video detection
   */
  private setupEventListeners(): void {
    // Listen for newly detected videos
    this.videoDetector.onVideoDetected((video) => {
      this.handleVideoDetected(video);
    });
  }

  /**
   * Handles a newly detected video
   */
  private handleVideoDetected(video: DetectedVideo): void {
    // Inject download button
    const button = this.buttonInjector.injectButton(video);
    
    if (button) {
      // Register click handler for this video
      this.buttonInjector.onButtonClick(video.id, (video, buttonElement) => {
        this.handleDownloadClick(video, buttonElement);
      });
    }
  }

  /**
   * Handles download button click
   */
  private async handleDownloadClick(video: DetectedVideo, _button: HTMLButtonElement): Promise<void> {
    try {
      // Update button state to loading
      this.buttonInjector.updateButtonState(video.id, 'loading', 'Processing...');

      // Prepare download data
      const downloadData = await this.prepareDownloadData(video);

      // Send message to background script to handle download
      const response = await chrome.runtime.sendMessage({
        action: 'downloadVideo',
        data: downloadData
      });

      if (response.success) {
        // Update button state to success
        this.buttonInjector.updateButtonState(video.id, 'success', 'Downloaded!');
      } else {
        throw new Error(response.error || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      // Update button state to error
      this.buttonInjector.updateButtonState(video.id, 'error', 'Failed');
    }
  }

  /**
   * Prepares download data from detected video
   */
  private async prepareDownloadData(video: DetectedVideo): Promise<any> {
    // Extract relevant information for download
    const pageUrl = window.location.href;
    const timestamp = Date.now();
    
    // Try to extract additional metadata
    let username = 'unknown';
    let postId = '';

    if (this.platform === 'twitter' || this.platform === 'x') {
      // Extract Twitter username and post ID
      const article = video.container?.closest('article');
      const usernameElement = article?.querySelector('[dir="ltr"] span');
      username = usernameElement?.textContent?.replace('@', '') || 'twitter_user';
      
      const pathMatch = window.location.pathname.match(/\/status\/(\d+)/);
      postId = pathMatch?.[1] || '';
    } else if (this.platform === 'reddit' || this.platform === null) {
      // Extract Reddit username and post ID
      const post = video.container?.closest('shreddit-post, .Post, [data-test-id="post-content"]');
      const authorElement = post?.querySelector('[data-author], [class*="author"]');
      username = authorElement?.textContent || 'reddit_user';
      
      postId = (post as any)?.dataset?.postId || '';
      if (!postId) {
        const pathMatch = window.location.pathname.match(/\/comments\/([^\/]+)/);
        postId = pathMatch?.[1] || '';
      }
    }

    return {
      videoUrl: video.url,
      platform: this.platform,
      username,
      postId,
      timestamp,
      pageUrl,
      metadata: video.metadata
    };
  }

  /**
   * Observes theme changes and updates buttons accordingly
   */
  private observeThemeChanges(): void {
    // Use MutationObserver to watch for theme changes
    const observer = new MutationObserver(() => {
      this.buttonInjector.updateTheme();
    });

    // Observe body class changes
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    // Also observe html element for theme changes
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class']
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.buttonInjector.updateTheme();
    });
  }

  /**
   * Cleans up a specific video and its button
   */
  cleanupVideo(videoId: string): void {
    this.buttonInjector.removeButton(videoId);
    this.videoDetector.clearVideo(videoId);
  }

  /**
   * Cleans up all videos and buttons
   */
  cleanup(): void {
    this.videoDetector.stopObserving();
    this.buttonInjector.removeAllButtons();
    this.videoDetector.clearAll();
  }

  /**
   * Gets statistics about detected videos and injected buttons
   */
  getStats(): {
    detectedVideos: number;
    injectedButtons: number;
  } {
    return {
      detectedVideos: this.videoDetector.getDetectedVideos().length,
      injectedButtons: this.buttonInjector.getInjectedButtons().length
    };
  }
}

/**
 * Auto-initialize when content script loads
 */
export function initVideoButtons(): void {
  // Detect platform
  const hostname = window.location.hostname;
  let platform: Platform | null = null;

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    platform = 'twitter';
  } else if (hostname.includes('reddit.com')) {
    platform = 'reddit';
  }

  if (!platform) {
    console.log('SocviDL: Unsupported platform');
    return;
  }

  // Initialize video button manager
  const manager = new VideoButtonManager(platform);
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => manager.init());
  } else {
    manager.init();
  }

  // Expose manager for debugging
  if (process.env?.['NODE_ENV'] === 'development') {
    (window as any).socvidlManager = manager;
  }
}

// Auto-initialize if this is the main content script
if (typeof chrome !== 'undefined' && chrome.runtime) {
  initVideoButtons();
}