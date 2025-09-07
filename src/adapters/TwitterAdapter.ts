/**
 * TwitterAdapter
 * Platform adapter for Twitter/X video handling
 */

import { PlatformAdapter, VideoExtractionResult, PostMetadata, PlatformConfig } from './PlatformAdapter';
import type { VideoElement } from '../types';

const TWITTER_CONFIG: PlatformConfig = {
  name: 'Twitter/X',
  domains: ['twitter.com', 'x.com'],
  selectors: {
    video: 'video, div[data-testid="videoPlayer"] video',
    container: 'article, div[data-testid="tweet"]',
    actionBar: '[role="group"]',
    username: '[dir="ltr"] span, [data-testid="User-Name"] span',
    postId: 'a[href*="/status/"]'
  },
  features: {
    hasM3U8: true,
    hasDASH: false,
    hasDirectVideo: true,
    requiresAuth: false,
    supportsQuality: true
  }
};

export class TwitterAdapter extends PlatformAdapter {
  private uiVersion: 'old' | 'new' | 'react' = 'react';
  private m3u8Cache: Map<string, string> = new Map();

  constructor(enableLogging = false) {
    super('twitter', TWITTER_CONFIG, enableLogging);
    this.detectUIVersion();
  }

  /**
   * Detect which version of Twitter UI is being used
   */
  private detectUIVersion(): void {
    // Check for React-based new Twitter/X
    if (document.querySelector('#react-root')) {
      this.uiVersion = 'react';
      this.log('Detected React-based Twitter/X UI');
    } 
    // Check for old Twitter (pre-2019)
    else if (document.querySelector('.js-original-tweet')) {
      this.uiVersion = 'old';
      this.log('Detected old Twitter UI');
    }
    // Default to new UI
    else {
      this.uiVersion = 'new';
      this.log('Detected new Twitter UI');
    }
  }

  /**
   * Check if page has videos
   */
  hasVideos(): boolean {
    const videos = document.querySelectorAll(this.config.selectors.video);
    return videos.length > 0;
  }

  /**
   * Find all video elements on page
   */
  findVideoElements(): VideoElement[] {
    const videos = Array.from(document.querySelectorAll(this.config.selectors.video));
    return videos.filter(video => this.isValidVideo(video as VideoElement)) as VideoElement[];
  }

  /**
   * Check if element is a valid Twitter video
   */
  isValidVideo(element: VideoElement): boolean {
    // Skip if already processed
    if (this.isProcessed(element)) {
      return false;
    }

    // Get tweet container
    const tweet = element.closest(this.config.selectors.container);
    if (!tweet) {
      return false;
    }

    // Check if it's a GIF (Twitter GIFs are actually videos)
    const isGif = this.isGifVideo(tweet);
    if (isGif) {
      this.log('Skipping GIF video');
      return false;
    }

    // Check if it's an external embed (YouTube, Vimeo, etc.)
    const isExternalEmbed = this.isExternalEmbed(element);
    if (isExternalEmbed) {
      this.log('Skipping external embed');
      return false;
    }

    // Check if it's an ad
    const isAd = this.isAdvertisement(tweet);
    if (isAd) {
      this.log('Skipping advertisement video');
      return false;
    }

    return true;
  }

  /**
   * Check if video is actually a GIF
   */
  private isGifVideo(container: Element): boolean {
    // Check for GIF label
    const hasGifLabel = container.querySelector('[aria-label*="GIF"]') !== null;
    
    // Check for GIF in alt text
    const hasGifAlt = container.querySelector('img[alt*="GIF"]') !== null;
    
    // Check for GIF badge
    const hasGifBadge = container.querySelector('[data-testid="gif-badge"]') !== null;
    
    return hasGifLabel || hasGifAlt || hasGifBadge;
  }

  /**
   * Check if video is an external embed
   */
  private isExternalEmbed(video: VideoElement): boolean {
    const src = video.src || video.currentSrc;
    
    const externalDomains = [
      'youtube.com',
      'youtu.be',
      'vimeo.com',
      'dailymotion.com',
      'twitch.tv',
      'facebook.com',
      'instagram.com'
    ];

    return externalDomains.some(domain => src.includes(domain));
  }

  /**
   * Check if tweet is an advertisement
   */
  private isAdvertisement(container: Element): boolean {
    // Check for promoted label
    const hasPromotedLabel = container.querySelector('[data-testid="promotedLabel"]') !== null;
    
    // Check for ad disclosure
    const hasAdDisclosure = container.textContent?.includes('Promoted') || false;
    
    return hasPromotedLabel || hasAdDisclosure;
  }

  /**
   * Extract video URL and metadata
   */
  async extractVideoData(element: VideoElement): Promise<VideoExtractionResult> {
    // First try direct video URL
    const directUrl = this.extractDirectUrl(element);
    if (directUrl) {
      return {
        url: directUrl,
        type: 'direct',
        metadata: this.extractBasicMetadata(element)
      };
    }

    // Try to get m3u8 URL from blob
    const blobUrl = element.src || element.currentSrc;
    if (blobUrl.startsWith('blob:')) {
      const m3u8Url = await this.extractM3U8FromBlob(blobUrl);
      if (m3u8Url) {
        return {
          url: m3u8Url,
          type: 'm3u8',
          qualities: await this.extractQualitiesFromM3U8(m3u8Url),
          metadata: this.extractBasicMetadata(element)
        };
      }
    }

    // Try to intercept m3u8 requests
    const interceptedUrl = this.getInterceptedM3U8Url(element);
    if (interceptedUrl) {
      return {
        url: interceptedUrl,
        type: 'm3u8',
        qualities: await this.extractQualitiesFromM3U8(interceptedUrl),
        metadata: this.extractBasicMetadata(element)
      };
    }

    return {
      url: null,
      type: 'direct',
      metadata: this.extractBasicMetadata(element)
    };
  }

  /**
   * Extract direct video URL if available
   */
  private extractDirectUrl(video: VideoElement): string | null {
    // Check source elements
    const sources = video.querySelectorAll('source');
    for (const source of sources) {
      if (source.src && !source.src.startsWith('blob:')) {
        return source.src;
      }
    }

    // Check video src
    if (video.src && !video.src.startsWith('blob:')) {
      return video.src;
    }

    return null;
  }

  /**
   * Try to extract m3u8 URL from blob URL
   */
  private async extractM3U8FromBlob(_blobUrl: string): Promise<string | null> {
    // This would require intercepting network requests
    // For now, return null - will be implemented in API-P1-001
    this.log('Blob URL detected, m3u8 extraction will be implemented in API-P1-001');
    return null;
  }

  /**
   * Get intercepted m3u8 URL if available
   */
  private getInterceptedM3U8Url(video: VideoElement): string | null {
    // Check if we have cached m3u8 URL for this video
    const videoId = video.dataset['socvidlId'];
    if (videoId && this.m3u8Cache.has(videoId)) {
      return this.m3u8Cache.get(videoId) || null;
    }
    return null;
  }

  /**
   * Extract video qualities from m3u8 playlist
   */
  private async extractQualitiesFromM3U8(_m3u8Url: string): Promise<any[]> {
    // This will be implemented in FEAT-P1-004
    return [];
  }

  /**
   * Find container element for video
   */
  findVideoContainer(element: VideoElement): HTMLElement | null {
    // Try to find article (tweet container)
    const article = element.closest('article') as HTMLElement;
    if (article) {
      return article;
    }

    // Try old Twitter selector
    const tweet = element.closest('.tweet, .js-tweet') as HTMLElement;
    if (tweet) {
      return tweet;
    }

    // Try data-testid tweet
    const testIdTweet = element.closest('[data-testid="tweet"]') as HTMLElement;
    if (testIdTweet) {
      return testIdTweet;
    }

    return element.parentElement;
  }

  /**
   * Extract post metadata from container
   */
  extractPostMetadata(container: HTMLElement): PostMetadata {
    const metadata: PostMetadata = {
      username: 'unknown',
      postId: '',
      timestamp: Date.now()
    };

    // Extract username
    const usernameElement = container.querySelector(this.config.selectors.username!);
    if (usernameElement) {
      const username = usernameElement.textContent?.replace('@', '').trim();
      if (username) {
        metadata.username = username;
      }
    } else {
      metadata.username = 'unknown';
    }

    // Extract post ID from status link
    const statusLink = container.querySelector(this.config.selectors.postId!) as HTMLAnchorElement;
    if (statusLink) {
      const match = statusLink.href.match(/status\/(\d+)/);
      if (match && match[1]) {
        metadata.postId = match[1];
      }
    }

    // Extract tweet text
    const tweetText = container.querySelector('[data-testid="tweetText"], .tweet-text');
    if (tweetText) {
      metadata.description = tweetText.textContent || undefined;
      
      // Extract hashtags
      const hashtags = Array.from(tweetText.querySelectorAll('a[href*="/hashtag/"]'))
        .map(tag => tag.textContent?.replace('#', '').trim())
        .filter(Boolean) as string[];
      
      if (hashtags.length > 0) {
        metadata.hashtags = hashtags;
      }
    }

    // Try to extract timestamp
    const timeElement = container.querySelector('time');
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime');
      if (datetime) {
        metadata.timestamp = new Date(datetime).getTime();
      }
    }

    return metadata;
  }

  /**
   * Get optimal button injection point
   */
  getButtonInjectionPoint(container: HTMLElement): HTMLElement | null {
    // Find the action bar (reply, retweet, like buttons)
    const actionBar = container.querySelector(this.config.selectors.actionBar!) as HTMLElement;
    if (actionBar) {
      return actionBar;
    }

    // Old Twitter UI
    const actionsElement = container.querySelector('.tweet-actions, .js-actions') as HTMLElement;
    if (actionsElement) {
      return actionsElement;
    }

    // Fallback to container
    return container;
  }

  /**
   * Handle UI variations between old and new Twitter
   */
  handleUIVariations(): void {
    switch (this.uiVersion) {
      case 'old':
        this.handleOldTwitterUI();
        break;
      case 'react':
        this.handleReactTwitterUI();
        break;
      default:
        this.handleNewTwitterUI();
    }
  }

  /**
   * Handle old Twitter UI specifics
   */
  private handleOldTwitterUI(): void {
    // Update selectors for old UI
    this.config.selectors.video = 'video, .PlayableMedia-player video';
    this.config.selectors.container = '.tweet, .js-tweet, .js-stream-tweet';
    this.config.selectors.actionBar = '.tweet-actions, .js-actions';
    this.config.selectors.username = '.username, .js-username';
    
    this.log('Configured for old Twitter UI');
  }

  /**
   * Handle new Twitter UI specifics
   */
  private handleNewTwitterUI(): void {
    // Current selectors are already optimized for new UI
    this.log('Configured for new Twitter UI');
  }

  /**
   * Handle React-based Twitter/X UI
   */
  private handleReactTwitterUI(): void {
    // Ensure we're using data-testid selectors
    this.config.selectors.video = 'video, div[data-testid="videoPlayer"] video';
    this.config.selectors.container = 'article, div[data-testid="tweet"]';
    this.config.selectors.actionBar = '[role="group"]';
    
    this.log('Configured for React Twitter/X UI');
  }

  /**
   * Store intercepted m3u8 URL
   */
  cacheM3U8Url(videoId: string, m3u8Url: string): void {
    this.m3u8Cache.set(videoId, m3u8Url);
  }

  /**
   * Clean up adapter resources
   */
  override cleanup(): void {
    this.m3u8Cache.clear();
  }

  /**
   * Get Twitter-specific request headers
   */
  override getRequestHeaders(): Record<string, string> {
    return {
      'x-twitter-active-user': 'yes',
      'x-twitter-client-language': 'en'
    };
  }
}