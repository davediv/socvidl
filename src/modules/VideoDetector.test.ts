/**
 * Unit tests for VideoDetector module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoDetector } from './VideoDetector';
import type { VideoElement, DetectedVideo } from './VideoDetector';

describe('VideoDetector', () => {
  let detector: VideoDetector;
  let mockVideo: HTMLVideoElement;

  beforeEach(() => {
    // Setup DOM environment
    document.body.innerHTML = '';
    
    // Create mock video element
    mockVideo = document.createElement('video') as VideoElement;
    mockVideo.src = 'https://example.com/video.mp4';
    mockVideo.videoWidth = 1920;
    mockVideo.videoHeight = 1080;
    
    detector = new VideoDetector({
      platform: 'twitter',
      enableLogging: false,
    });
  });

  afterEach(() => {
    detector.stopObserving();
    detector.clearAll();
    document.body.innerHTML = '';
  });

  describe('detectVideos', () => {
    it('should detect video elements in the DOM', () => {
      document.body.appendChild(mockVideo);
      
      const videos = detector.detectVideos();
      
      expect(videos).toHaveLength(1);
      expect(videos[0].element).toBe(mockVideo);
      expect(videos[0].url).toBe('https://example.com/video.mp4');
      expect(videos[0].platform).toBe('twitter');
    });

    it('should not detect already processed videos', () => {
      document.body.appendChild(mockVideo);
      
      // First detection
      detector.detectVideos();
      
      // Second detection
      const videos = detector.detectVideos();
      
      expect(videos).toHaveLength(0);
    });

    it('should detect multiple videos', () => {
      const video1 = mockVideo;
      const video2 = document.createElement('video') as VideoElement;
      video2.src = 'https://example.com/video2.mp4';
      
      document.body.appendChild(video1);
      document.body.appendChild(video2);
      
      const videos = detector.detectVideos();
      
      expect(videos).toHaveLength(2);
    });

    it('should extract video metadata correctly', () => {
      mockVideo.duration = 120;
      mockVideo.poster = 'https://example.com/poster.jpg';
      
      document.body.appendChild(mockVideo);
      
      const videos = detector.detectVideos();
      
      expect(videos[0].metadata).toEqual({
        duration: 120,
        width: 1920,
        height: 1080,
        poster: 'https://example.com/poster.jpg',
        isLive: false,
        hasAudio: true,
      });
    });
  });

  describe('isVideoElement', () => {
    it('should return true for valid video elements', () => {
      expect(detector.isVideoElement(mockVideo)).toBe(true);
    });

    it('should return false for non-video elements', () => {
      const div = document.createElement('div');
      expect(detector.isVideoElement(div)).toBe(false);
    });

    it('should return false for videos without source', () => {
      const videoNoSrc = document.createElement('video');
      expect(detector.isVideoElement(videoNoSrc)).toBe(false);
    });

    it('should return false for thumbnail videos', () => {
      mockVideo.classList.add('thumbnail');
      expect(detector.isVideoElement(mockVideo)).toBe(false);
    });

    it('should handle platform-specific video validation for Twitter', () => {
      // Create Twitter-specific structure
      const article = document.createElement('article');
      const gifLabel = document.createElement('div');
      gifLabel.setAttribute('aria-label', 'GIF');
      
      article.appendChild(gifLabel);
      article.appendChild(mockVideo);
      document.body.appendChild(article);
      
      expect(detector.isVideoElement(mockVideo)).toBe(false); // GIF should be excluded
    });

    it('should handle platform-specific video validation for Reddit', () => {
      const redditDetector = new VideoDetector({
        platform: 'reddit',
        enableLogging: false,
      });
      
      mockVideo.src = 'https://v.redd.it/video.mp4';
      expect(redditDetector.isVideoElement(mockVideo)).toBe(true);
      
      mockVideo.src = 'https://youtube.com/video.mp4';
      expect(redditDetector.isVideoElement(mockVideo)).toBe(false);
    });
  });

  describe('observeMutations', () => {
    it('should detect dynamically added videos', (done) => {
      detector.observeMutations();
      
      detector.onVideoDetected((video) => {
        expect(video.element).toBe(mockVideo);
        done();
      });
      
      // Add video after observation starts
      setTimeout(() => {
        document.body.appendChild(mockVideo);
      }, 100);
    });

    it('should debounce multiple mutations', (done) => {
      let detectionCount = 0;
      
      detector.onVideoDetected(() => {
        detectionCount++;
      });
      
      detector.observeMutations();
      
      // Add multiple videos quickly
      for (let i = 0; i < 5; i++) {
        const video = document.createElement('video') as VideoElement;
        video.src = `https://example.com/video${i}.mp4`;
        document.body.appendChild(video);
      }
      
      // Check that detections are debounced
      setTimeout(() => {
        expect(detectionCount).toBe(5); // All videos detected in one batch
        done();
      }, 600);
    });

    it('should stop observing when requested', () => {
      detector.observeMutations();
      expect(detector['observer']).not.toBeNull();
      
      detector.stopObserving();
      expect(detector['observer']).toBeNull();
    });
  });

  describe('Video callbacks', () => {
    it('should register and trigger callbacks', (done) => {
      const callback = vi.fn((video: DetectedVideo) => {
        expect(video.element).toBe(mockVideo);
        done();
      });
      
      detector.onVideoDetected(callback);
      document.body.appendChild(mockVideo);
      detector.detectVideos();
    });

    it('should handle multiple callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      detector.onVideoDetected(callback1);
      detector.onVideoDetected(callback2);
      
      document.body.appendChild(mockVideo);
      detector.detectVideos();
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should unregister callbacks', () => {
      const callback = vi.fn();
      
      detector.onVideoDetected(callback);
      detector.offVideoDetected(callback);
      
      document.body.appendChild(mockVideo);
      detector.detectVideos();
      
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Video management', () => {
    it('should track detected videos', () => {
      document.body.appendChild(mockVideo);
      detector.detectVideos();
      
      const videos = detector.getDetectedVideos();
      expect(videos).toHaveLength(1);
      expect(videos[0].element).toBe(mockVideo);
    });

    it('should clear specific videos', () => {
      document.body.appendChild(mockVideo);
      const detectedVideos = detector.detectVideos();
      const videoId = detectedVideos[0].id;
      
      detector.clearVideo(videoId);
      
      const videos = detector.getDetectedVideos();
      expect(videos).toHaveLength(0);
    });

    it('should clear all videos', () => {
      const video1 = mockVideo;
      const video2 = document.createElement('video') as VideoElement;
      video2.src = 'https://example.com/video2.mp4';
      
      document.body.appendChild(video1);
      document.body.appendChild(video2);
      
      detector.detectVideos();
      expect(detector.getDetectedVideos()).toHaveLength(2);
      
      detector.clearAll();
      expect(detector.getDetectedVideos()).toHaveLength(0);
    });
  });

  describe('Platform-specific selectors', () => {
    it('should use Twitter-specific selectors', () => {
      const twitterDetector = new VideoDetector({
        platform: 'twitter',
        enableLogging: false,
      });
      
      const selector = twitterDetector['getVideoSelector']();
      expect(selector).toContain('videoPlayer');
      expect(selector).toContain('aria-label');
    });

    it('should use Reddit-specific selectors', () => {
      const redditDetector = new VideoDetector({
        platform: 'reddit',
        enableLogging: false,
      });
      
      const selector = redditDetector['getVideoSelector']();
      expect(selector).toContain('media-element');
      expect(selector).toContain('shreddit-player');
      expect(selector).toContain('v.redd.it');
    });

    it('should use generic selector for unknown platforms', () => {
      const genericDetector = new VideoDetector({
        platform: null,
        enableLogging: false,
      });
      
      const selector = genericDetector['getVideoSelector']();
      expect(selector).toBe('video');
    });
  });

  describe('Video URL extraction', () => {
    it('should extract URL from src attribute', () => {
      document.body.appendChild(mockVideo);
      const videos = detector.detectVideos();
      
      expect(videos[0].url).toBe('https://example.com/video.mp4');
    });

    it('should extract URL from source element', () => {
      const videoWithSource = document.createElement('video') as VideoElement;
      const source = document.createElement('source');
      source.src = 'https://example.com/source-video.mp4';
      videoWithSource.appendChild(source);
      
      document.body.appendChild(videoWithSource);
      const videos = detector.detectVideos();
      
      expect(videos[0].url).toBe('https://example.com/source-video.mp4');
    });

    it('should extract URL from data-src attribute', () => {
      const videoWithDataSrc = document.createElement('video') as VideoElement;
      videoWithDataSrc.dataset.src = 'https://example.com/data-video.mp4';
      
      // Mock isVideoElement to accept videos without direct src
      vi.spyOn(detector, 'isVideoElement').mockReturnValue(true);
      
      document.body.appendChild(videoWithDataSrc);
      const videos = detector.detectVideos();
      
      expect(videos[0].url).toBe('https://example.com/data-video.mp4');
    });
  });
});