/**
 * Video detection integration for content script
 * Uses the VideoDetector module to find and process videos
 */

import { VideoDetector } from '../modules/VideoDetector';
import type { DetectedVideo, Platform } from '../types';

/**
 * Initialize video detection for the current page
 */
export function initializeVideoDetection(): VideoDetector | null {
  const platform = detectPlatform();
  
  if (!platform) {
    console.warn('[SocviDL] Unsupported platform');
    return null;
  }

  console.info(`[SocviDL] Initializing video detection for ${platform}`);

  const detector = new VideoDetector({
    platform,
    processedAttribute: 'socvidlProcessed',
    debounceDelay: 500,
    enableLogging: process.env?.['NODE_ENV'] === 'development',
  });

  // Register callback for when videos are detected
  detector.onVideoDetected((video: DetectedVideo) => {
    handleVideoDetected(video);
  });

  // Start detecting existing videos
  const initialVideos = detector.detectVideos();
  console.info(`[SocviDL] Found ${initialVideos.length} initial videos`);

  // Start observing for new videos
  detector.observeMutations();

  // Clean up on page unload
  window.addEventListener('unload', () => {
    detector.stopObserving();
    detector.clearAll();
  });

  return detector;
}

/**
 * Detect the current platform
 */
export function detectPlatform(): Platform {
  const hostname = window.location.hostname;
  
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  
  if (hostname.includes('reddit.com')) {
    return 'reddit';
  }
  
  return null;
}

/**
 * Handle a newly detected video
 */
function handleVideoDetected(video: DetectedVideo): void {
  console.info(`[SocviDL] Video detected: ${video.id}`, {
    url: video.url,
    platform: video.platform,
    metadata: video.metadata,
  });

  // Check if we should inject a download button
  if (shouldInjectButton(video)) {
    // This will be implemented in ButtonInjector module (FEAT-P1-002)
    injectDownloadButton(video);
  }
}

/**
 * Check if a download button should be injected for this video
 */
function shouldInjectButton(video: DetectedVideo): boolean {
  // Skip if no URL
  if (!video.url) {
    return false;
  }

  // Skip if no container (nowhere to put the button)
  if (!video.container) {
    return false;
  }

  // Skip live streams for now
  if (video.metadata.isLive) {
    console.info(`[SocviDL] Skipping live video: ${video.id}`);
    return false;
  }

  // Skip very short videos (likely ads or previews)
  if (video.metadata.duration && video.metadata.duration < 2) {
    return false;
  }

  return true;
}

/**
 * Inject download button for a video (placeholder)
 * This will be properly implemented in FEAT-P1-002
 */
function injectDownloadButton(video: DetectedVideo): void {
  // Create a temporary marker to show detection is working
  const marker = document.createElement('div');
  marker.className = 'socvidl-video-marker';
  marker.setAttribute('data-video-id', video.id);
  marker.style.cssText = `
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(29, 155, 240, 0.9);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    z-index: 9999;
    pointer-events: none;
  `;
  marker.textContent = '📹 Video Detected';

  // Try to position the marker relative to the video
  if (!video.container) return;
  
  if (video.container.style.position === '' || 
      video.container.style.position === 'static') {
    video.container.style.position = 'relative';
  }
  
  video.container.appendChild(marker);

  // Remove marker after 3 seconds
  setTimeout(() => {
    marker.remove();
  }, 3000);
}

/**
 * Get video information for download
 * This will be used by the download manager
 */
export function getVideoInfo(video: DetectedVideo): VideoInfo {
  const platform = video.platform;
  let username = 'unknown';
  let postId = '';

  if (platform === 'twitter') {
    const tweet = video.container;
    username = tweet?.querySelector('[dir="ltr"] span')?.textContent?.replace('@', '') || 'twitter_user';
    
    // Try to extract post ID from URL or data attributes
    const link = tweet?.querySelector('a[href*="/status/"]') as HTMLAnchorElement;
    if (link) {
      const match = link.href.match(/status\/(\d+)/);
      postId = match?.[1] || '';
    }
  } else if (platform === 'reddit') {
    const post = video.container;
    username = post?.querySelector('[data-author], [class*="author"]')?.textContent || 'reddit_user';
    
    // Try to extract post ID
    const postIdAttr = post?.getAttribute('data-post-id') || 
                       post?.getAttribute('id')?.replace('post-', '') || '';
    postId = postIdAttr;
  }

  return {
    videoId: video.id,
    videoUrl: video.url || '',
    platform,
    username,
    postId,
    timestamp: Date.now(),
    pageUrl: window.location.href,
    metadata: video.metadata,
  };
}

export interface VideoInfo {
  videoId: string;
  videoUrl: string;
  platform: Platform;
  username: string;
  postId: string;
  timestamp: number;
  pageUrl: string;
  metadata: {
    duration: number | null;
    width: number | null;
    height: number | null;
    hasAudio: boolean;
  };
}