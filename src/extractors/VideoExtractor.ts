/**
 * VideoExtractor Module
 * Extracts video sources from various formats including m3u8 playlists
 */

import type { Platform } from '../types';

export interface VideoSource {
  url: string;
  type: 'direct' | 'm3u8' | 'dash' | 'blob';
  quality?: VideoQuality;
  headers?: Record<string, string>;
  authToken?: string;
}

export interface VideoQuality {
  label: string;
  resolution: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  codecs?: string;
}

export interface M3U8Variant {
  url: string;
  bandwidth: number;
  resolution?: {
    width: number;
    height: number;
  };
  codecs?: string;
  framerate?: number;
  programId?: number;
}

export interface M3U8Playlist {
  isMaster: boolean;
  variants: M3U8Variant[];
  segments?: M3U8Segment[];
  targetDuration?: number;
  mediaSequence?: number;
  version?: number;
  isLive?: boolean;
}

export interface M3U8Segment {
  url: string;
  duration: number;
  title?: string;
  sequence?: number;
  discontinuity?: boolean;
}

export interface ExtractorOptions {
  platform: Platform;
  preferredQuality?: 'highest' | 'lowest' | 'auto';
  maxBitrate?: number;
  enableLogging?: boolean;
}

export class VideoExtractor {
  private _platform: Platform;
  private preferredQuality: 'highest' | 'lowest' | 'auto';
  private maxBitrate?: number;
  private enableLogging: boolean;

  constructor(options: ExtractorOptions) {
    this._platform = options.platform;
    this.preferredQuality = options.preferredQuality ?? 'highest';
    this.maxBitrate = options.maxBitrate;
    this.enableLogging = options.enableLogging ?? false;
  }

  /**
   * Extract video source from a URL or element
   */
  async getVideoSource(url: string, headers?: Record<string, string>): Promise<VideoSource | null> {
    try {
      // Check if it's a direct video URL
      if (this.isDirectVideo(url)) {
        return {
          url,
          type: 'direct',
          headers,
        };
      }

      // Check if it's an m3u8 playlist
      if (this.isM3U8(url)) {
        const playlist = await this.fetchAndParseM3U8(url, headers);
        if (!playlist) {
          return null;
        }

        // If it's a master playlist, find the best quality variant
        if (playlist.isMaster) {
          const bestVariant = this.findBestQuality(playlist.variants);
          if (bestVariant) {
            // Fetch the variant playlist
            const variantUrl = this.resolveUrl(bestVariant.url, url);
            // Fetch the variant playlist for future use
            await this.fetchAndParseM3U8(variantUrl, headers);

            return {
              url: variantUrl,
              type: 'm3u8',
              quality: this.variantToQuality(bestVariant),
              headers,
            };
          }
        }

        // It's a media playlist, return as is
        return {
          url,
          type: 'm3u8',
          headers,
        };
      }

      // Check if it's a DASH manifest (for future Reddit support)
      if (this.isDASH(url)) {
        this.log('DASH support not yet implemented');
        return null;
      }

      return null;
    } catch (error) {
      this.log(`Error extracting video source: ${String(error)}`, 'error');
      return null;
    }
  }

  /**
   * Parse an m3u8 playlist
   */
  parseM3U8(content: string, baseUrl?: string): M3U8Playlist {
    const lines = content.split('\n').map(line => line.trim());
    const playlist: M3U8Playlist = {
      isMaster: false,
      variants: [],
      segments: [],
    };

    let currentSegment: Partial<M3U8Segment> = {};
    let currentVariant: Partial<M3U8Variant> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty lines and comments (except directive comments)
      if (line.length === 0 || (line.startsWith('#') && !line.startsWith('#EXT'))) {
        continue;
      }

      // Version
      if (line.startsWith('#EXT-X-VERSION:')) {
        playlist.version = parseInt(line.split(':')[1], 10);
      }
      // Target duration
      else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        playlist.targetDuration = parseInt(line.split(':')[1], 10);
      }
      // Media sequence
      else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        playlist.mediaSequence = parseInt(line.split(':')[1], 10);
      }
      // Stream info (master playlist)
      else if (line.startsWith('#EXT-X-STREAM-INF:')) {
        playlist.isMaster = true;
        const attributes = this.parseAttributes(line.split(':')[1]);

        currentVariant = {
          bandwidth: parseInt(attributes['BANDWIDTH'] ?? '0', 10),
          codecs: attributes['CODECS']?.replace(/"/g, ''),
          programId:
            attributes['PROGRAM-ID'] !== null ? parseInt(attributes['PROGRAM-ID'], 10) : undefined,
        };

        // Parse resolution
        if (attributes['RESOLUTION'] !== null && attributes['RESOLUTION'].length > 0) {
          const parts = attributes['RESOLUTION'].split('x');
          if (parts.length === 2) {
            const width = parseInt(parts[0] ?? '0', 10);
            const height = parseInt(parts[1] ?? '0', 10);
            currentVariant.resolution = { width, height };
          }
        }

        // Parse framerate
        const frameRate = attributes['FRAME-RATE'];
        if (frameRate !== null && frameRate.length > 0) {
          currentVariant.framerate = parseFloat(frameRate);
        }

        // Next line should be the URL
        const nextLine = lines[i + 1];
        if (
          i + 1 < lines.length &&
          nextLine !== null &&
          nextLine.length > 0 &&
          !nextLine.startsWith('#')
        ) {
          currentVariant.url = nextLine;
          i++;
          if (baseUrl !== null && currentVariant.url !== null && currentVariant.url.length > 0) {
            currentVariant.url = this.resolveUrl(currentVariant.url, baseUrl);
          }
          playlist.variants.push(currentVariant as M3U8Variant);
          currentVariant = {};
        }
      }
      // Segment duration (media playlist)
      else if (line.startsWith('#EXTINF:')) {
        const parts = line.split(':')[1].split(',');
        const durationStr = parts[0];
        if (durationStr !== null && durationStr.length > 0) {
          currentSegment.duration = parseFloat(durationStr);
        }
        currentSegment.title = parts[1] ?? undefined;

        // Next line should be the URL
        const nextSegmentLine = lines[i + 1];
        if (
          i + 1 < lines.length &&
          nextSegmentLine !== null &&
          nextSegmentLine.length > 0 &&
          !nextSegmentLine.startsWith('#')
        ) {
          currentSegment.url = nextSegmentLine;
          i++;
          if (baseUrl !== null && currentSegment.url !== null && currentSegment.url.length > 0) {
            currentSegment.url = this.resolveUrl(currentSegment.url, baseUrl);
          }
          currentSegment.sequence = playlist.segments?.length;
          if (playlist.segments && currentSegment.url && currentSegment.duration !== undefined) {
            playlist.segments.push(currentSegment as M3U8Segment);
          }
          currentSegment = {};
        }
      }
      // Discontinuity
      else if (line === '#EXT-X-DISCONTINUITY') {
        currentSegment.discontinuity = true;
      }
      // End of playlist
      else if (line === '#EXT-X-ENDLIST') {
        playlist.isLive = false;
      }
      // Playlist type
      else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) {
        const type = line.split(':')[1];
        playlist.isLive = type !== 'VOD';
      }
    }

    // If no explicit end list and has segments, assume it might be live
    if (
      playlist.segments !== null &&
      playlist.segments.length > 0 &&
      playlist.isLive === undefined
    ) {
      playlist.isLive = true;
    }

    return playlist;
  }

  /**
   * Find the highest quality variant
   */
  findHighestQuality(variants: M3U8Variant[]): M3U8Variant | null {
    if (variants === null || variants.length === 0) {
      return null;
    }

    // Filter by max bitrate if specified
    let filteredVariants = variants;
    if (this.maxBitrate !== null && this.maxBitrate > 0) {
      filteredVariants = variants.filter(v => v.bandwidth <= (this.maxBitrate ?? 0));

      // If all variants exceed max bitrate, use the lowest one
      if (filteredVariants.length === 0) {
        const lowestQuality = this.findLowestQuality(variants);
        if (lowestQuality !== null) {
          filteredVariants = [lowestQuality];
        }
      }
    }

    // Sort by quality based on preference
    if (this.preferredQuality === 'highest') {
      return this.findBestQuality(filteredVariants);
    } else if (this.preferredQuality === 'lowest') {
      return this.findLowestQuality(filteredVariants);
    } else {
      // Auto: find medium quality
      return this.findMediumQuality(filteredVariants);
    }
  }

  /**
   * Find the best quality variant (highest resolution/bitrate)
   */
  private findBestQuality(variants: M3U8Variant[]): M3U8Variant | null {
    if (variants === null || variants.length === 0) {
      return null;
    }

    const best = variants.reduce((best, current) => {
      // Compare by resolution first
      if (current.resolution && best.resolution) {
        const currentPixels = current.resolution.width * current.resolution.height;
        const bestPixels = best.resolution.width * best.resolution.height;
        if (currentPixels > bestPixels) {
          return current;
        } else if (currentPixels < bestPixels) {
          return best;
        }
      }

      // Then by bandwidth
      if (current.bandwidth > best.bandwidth) {
        return current;
      }

      return best;
    });
    return best ?? null;
  }

  /**
   * Find the lowest quality variant
   */
  private findLowestQuality(variants: M3U8Variant[]): M3U8Variant | null {
    if (variants === null || variants.length === 0) {
      return null;
    }

    const lowest = variants.reduce((lowest, current) => {
      // Compare by resolution first
      if (current.resolution && lowest.resolution) {
        const currentPixels = current.resolution.width * current.resolution.height;
        const lowestPixels = lowest.resolution.width * lowest.resolution.height;
        if (currentPixels < lowestPixels) {
          return current;
        } else if (currentPixels > lowestPixels) {
          return lowest;
        }
      }

      // Then by bandwidth
      if (current.bandwidth < lowest.bandwidth) {
        return current;
      }

      return lowest;
    });
    return lowest ?? null;
  }

  /**
   * Find medium quality variant
   */
  private findMediumQuality(variants: M3U8Variant[]): M3U8Variant | null {
    if (variants === null || variants.length === 0) {
      return null;
    }

    // Sort by bandwidth
    const sorted = [...variants].sort((a, b) => a.bandwidth - b.bandwidth);

    // Return middle variant
    const middleIndex = Math.floor(sorted.length / 2);
    return sorted[middleIndex] ?? null;
  }

  /**
   * Get all available qualities
   */
  getAllQualities(variants: M3U8Variant[]): VideoQuality[] {
    return variants
      .filter(v => v.resolution)
      .map(v => this.variantToQuality(v))
      .sort((a, b) => {
        // Sort by resolution (pixels)
        const aPixels = a.width * a.height;
        const bPixels = b.width * b.height;
        return bPixels - aPixels;
      });
  }

  /**
   * Convert variant to quality object
   */
  private variantToQuality(variant: M3U8Variant): VideoQuality {
    const resolution = variant.resolution ?? { width: 0, height: 0 };
    const label = this.getQualityLabel(resolution.width, resolution.height);

    return {
      label,
      resolution: `${resolution.width}x${resolution.height}`,
      width: resolution.width,
      height: resolution.height,
      bitrate: variant.bandwidth,
      framerate: variant.framerate,
      codecs: variant.codecs,
    };
  }

  /**
   * Get quality label from resolution
   */
  private getQualityLabel(_width: number, height: number): string {
    if (height >= 2160) return '4K';
    if (height >= 1440) return '1440p';
    if (height >= 1080) return '1080p';
    if (height >= 720) return '720p';
    if (height >= 480) return '480p';
    if (height >= 360) return '360p';
    if (height >= 240) return '240p';
    return '144p';
  }

  /**
   * Fetch and parse m3u8 playlist
   */
  private async fetchAndParseM3U8(
    url: string,
    headers?: Record<string, string>
  ): Promise<M3U8Playlist | null> {
    try {
      const response = await fetch(url, {
        headers: headers ?? {},
        credentials: 'omit',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch m3u8: ${response.status}`);
      }

      const content = await response.text();
      return this.parseM3U8(content, url);
    } catch (error) {
      this.log(`Error fetching m3u8: ${String(error)}`, 'error');
      return null;
    }
  }

  /**
   * Parse attributes from m3u8 directive
   */
  private parseAttributes(attributeString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const regex = /([A-Z-]+)=("[^"]*"|[^,]*)/g;
    let match;

    while ((match = regex.exec(attributeString)) !== null) {
      const key = match[1];
      const value = match[2];
      if (key !== null && key.length > 0 && value !== null && value.length > 0) {
        attributes[key] = value.replace(/"/g, '');
      }
    }

    return attributes;
  }

  /**
   * Resolve relative URL
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const base = new URL(baseUrl);

    if (url.startsWith('/')) {
      return `${base.protocol}//${base.host}${url}`;
    }

    // Relative to current directory
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/'));
    return `${base.protocol}//${base.host}${basePath}/${url}`;
  }

  /**
   * Check if URL is a direct video
   */
  private isDirectVideo(url: string): boolean {
    const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  /**
   * Check if URL is an m3u8 playlist
   */
  private isM3U8(url: string): boolean {
    return url.toLowerCase().includes('.m3u8');
  }

  /**
   * Check if URL is a DASH manifest
   */
  private isDASH(url: string): boolean {
    return url.toLowerCase().includes('.mpd');
  }

  /**
   * Log message
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.enableLogging || this.enableLogging === false) {
      return;
    }

    const prefix = '[VideoExtractor]';
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
