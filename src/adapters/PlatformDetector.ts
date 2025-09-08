/**
 * PlatformDetector
 * Detects the current platform and returns appropriate adapter
 */

import { PlatformAdapter } from './PlatformAdapter';
import { TwitterAdapter } from './TwitterAdapter';
import type { Platform } from '../types';

export class PlatformDetector {
  private static instance: PlatformDetector | null = null;
  private currentAdapter: PlatformAdapter | null = null;
  private hostname: string;

  private constructor() {
    this.hostname = window.location.hostname;
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PlatformDetector {
    if (!PlatformDetector.instance) {
      PlatformDetector.instance = new PlatformDetector();
    }
    return PlatformDetector.instance;
  }

  /**
   * Detect current platform
   */
  detectPlatform(): Platform {
    // Twitter/X detection
    if (this.hostname.includes('twitter.com') || this.hostname.includes('x.com')) {
      return 'twitter';
    }

    // Reddit detection
    if (this.hostname.includes('reddit.com')) {
      return 'reddit';
    }

    return null;
  }

  /**
   * Get adapter for current platform
   */
  getAdapter(enableLogging = false): PlatformAdapter | null {
    // Return cached adapter if available
    if (this.currentAdapter) {
      return this.currentAdapter;
    }

    const platform = this.detectPlatform();

    switch (platform) {
      case 'twitter':
      case 'x':
        this.currentAdapter = new TwitterAdapter(enableLogging);
        break;
      case 'reddit':
        // RedditAdapter will be implemented in FEAT-P1-007
        console.warn('[SocviDL] RedditAdapter not yet implemented');
        return null;
      default:
        console.warn('[SocviDL] Unsupported platform:', this.hostname);
        return null;
    }

    // Initialize UI variations handling
    if (this.currentAdapter) {
      this.currentAdapter.handleUIVariations();
    }

    return this.currentAdapter;
  }

  /**
   * Check if current platform is supported
   */
  isSupported(): boolean {
    return this.detectPlatform() !== null;
  }

  /**
   * Get current hostname
   */
  getHostname(): string {
    return this.hostname;
  }

  /**
   * Reset detector (useful for testing)
   */
  reset(): void {
    if (this.currentAdapter) {
      this.currentAdapter.cleanup();
      this.currentAdapter = null;
    }
  }

  /**
   * Update hostname (for testing or navigation)
   */
  updateHostname(hostname?: string): void {
    this.hostname = hostname || window.location.hostname;
    this.reset();
  }
}
