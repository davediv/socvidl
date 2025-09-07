/**
 * SegmentDownloader module for downloading and concatenating m3u8 video segments
 * Handles HLS/m3u8 segment downloads with retry logic and progress tracking
 */

export interface SegmentInfo {
  url: string;
  duration: number;
  index: number;
}

export interface DownloadProgress {
  currentSegment: number;
  totalSegments: number;
  percentage: number;
  bytesDownloaded: number;
  totalBytes?: number;
  speed?: number;
  eta?: number;
}

export interface DownloadOptions {
  maxRetries?: number;
  retryDelay?: number;
  maxConcurrent?: number;
  onProgress?: (progress: DownloadProgress) => void;
  signal?: AbortSignal;
}

export interface DownloadResult {
  blob: Blob;
  mimeType: string;
  size: number;
  duration: number;
}

export class SegmentDownloader {
  private static readonly DEFAULT_MAX_RETRIES = 3;
  private static readonly DEFAULT_RETRY_DELAY = 1000; // 1 second
  private static readonly DEFAULT_MAX_CONCURRENT = 5;
  private static readonly EXPONENTIAL_BACKOFF_FACTOR = 2;

  /**
   * Downloads all segments from a parsed m3u8 playlist
   */
  async downloadSegments(
    segments: SegmentInfo[],
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const {
      maxRetries = SegmentDownloader.DEFAULT_MAX_RETRIES,
      retryDelay = SegmentDownloader.DEFAULT_RETRY_DELAY,
      maxConcurrent = SegmentDownloader.DEFAULT_MAX_CONCURRENT,
      onProgress,
      signal,
    } = options;

    if (segments.length === 0) {
      throw new Error('No segments provided for download');
    }

    const downloadedSegments: ArrayBuffer[] = [];
    let totalBytesDownloaded = 0;
    const startTime = Date.now();

    // Download segments with concurrency control
    const downloadQueue = [...segments];
    const activeDownloads = new Map<number, Promise<ArrayBuffer>>();

    while (downloadQueue.length > 0 || activeDownloads.size > 0) {
      // Check for abort signal
      if (signal?.aborted === true) {
        throw new Error('Download aborted');
      }

      // Start new downloads up to the concurrent limit
      while (downloadQueue.length > 0 && activeDownloads.size < maxConcurrent) {
        const segment = downloadQueue.shift();
        if (!segment) continue;
        const downloadPromise = this.downloadSegmentWithRetry(
          segment.url,
          maxRetries,
          retryDelay,
          signal
        );

        activeDownloads.set(segment.index, downloadPromise);

        // Handle completion
        downloadPromise
          .then(data => {
            downloadedSegments[segment.index] = data;
            totalBytesDownloaded += data.byteLength;
            activeDownloads.delete(segment.index);

            // Report progress
            if (onProgress) {
              const completed = downloadedSegments.filter(Boolean).length;
              const elapsedTime = (Date.now() - startTime) / 1000;
              const speed = totalBytesDownloaded / elapsedTime;
              const remainingSegments = segments.length - completed;
              const avgSegmentSize = totalBytesDownloaded / completed;
              const eta = (remainingSegments * avgSegmentSize) / speed;

              onProgress({
                currentSegment: completed,
                totalSegments: segments.length,
                percentage: Math.round((completed / segments.length) * 100),
                bytesDownloaded: totalBytesDownloaded,
                speed: Math.round(speed),
                eta: Math.round(eta),
              });
            }
          })
          .catch(error => {
            activeDownloads.delete(segment.index);
            throw error;
          });
      }

      // Wait for at least one download to complete
      if (activeDownloads.size > 0) {
        await Promise.race(Array.from(activeDownloads.values()));
      }
    }

    // Concatenate all segments
    const concatenated = this.concatenateSegments(downloadedSegments);

    // Calculate total duration
    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);

    return {
      blob: concatenated,
      mimeType: 'video/mp4',
      size: concatenated.size,
      duration: totalDuration,
    };
  }

  /**
   * Downloads a single segment with retry logic
   */
  private async downloadSegmentWithRetry(
    url: string,
    maxRetries: number,
    retryDelay: number,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check for abort signal
        if (signal?.aborted === true) {
          throw new Error('Download aborted');
        }

        const response = await fetch(url, {
          signal,
          headers: {
            Range: 'bytes=0-',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.arrayBuffer();

        if (data.byteLength === 0) {
          throw new Error('Empty segment received');
        }

        return data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort
        if (signal?.aborted ?? (error instanceof Error && error.message === 'Download aborted')) {
          throw error;
        }

        // Log retry attempt
        if (attempt < maxRetries) {
          const delay =
            retryDelay * Math.pow(SegmentDownloader.EXPONENTIAL_BACKOFF_FACTOR, attempt);
          console.warn(
            `Segment download failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries}):`,
            error
          );
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to download segment after ${maxRetries} retries: ${lastError?.message}`
    );
  }

  /**
   * Concatenates array buffers into a single blob
   */
  concatenateSegments(segments: ArrayBuffer[]): Blob {
    if (segments.length === 0) {
      throw new Error('No segments to concatenate');
    }

    // Filter out any undefined segments
    const validSegments = segments.filter(seg => seg !== undefined);

    if (validSegments.length === 0) {
      throw new Error('No valid segments to concatenate');
    }

    // Check if segments are in correct order
    if (validSegments.length !== segments.length) {
      console.warn(
        `Missing segments detected: ${segments.length - validSegments.length} segments failed to download`
      );
    }

    // Create blob from segments
    const blob = new Blob(
      validSegments.map(buffer => new Uint8Array(buffer)),
      {
        type: 'video/mp4',
      }
    );

    return blob;
  }

  /**
   * Helper function to sleep for a given duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parses segment information from m3u8 content
   */
  static parseSegmentsFromM3U8(m3u8Content: string, baseUrl?: string): SegmentInfo[] {
    const segments: SegmentInfo[] = [];
    const lines = m3u8Content.split('\n');
    let currentDuration = 0;
    let segmentIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Parse segment duration
      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch?.[1] !== null && durationMatch[1] !== undefined && durationMatch[1] !== '') {
          currentDuration = parseFloat(durationMatch[1]);
        }
      }
      // Parse segment URL
      else if (line && !line.startsWith('#') && currentDuration > 0) {
        let segmentUrl = line;

        // Resolve relative URLs
        if (baseUrl !== null && baseUrl !== undefined && baseUrl !== '' && !segmentUrl.startsWith('http')) {
          if (segmentUrl.startsWith('/')) {
            // Absolute path
            const urlObj = new URL(baseUrl);
            segmentUrl = `${urlObj.protocol}//${urlObj.host}${segmentUrl}`;
          } else {
            // Relative path
            const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
            segmentUrl = basePath + segmentUrl;
          }
        }

        segments.push({
          url: segmentUrl,
          duration: currentDuration,
          index: segmentIndex++,
        });

        currentDuration = 0;
      }
    }

    return segments;
  }

  /**
   * Estimates the total size of segments to download
   */
  static async estimateDownloadSize(segments: SegmentInfo[]): Promise<number> {
    if (segments.length === 0) {
      return 0;
    }

    // Sample first few segments to estimate average size
    const sampleSize = Math.min(3, segments.length);
    const sampleSegments = segments.slice(0, sampleSize);
    let totalSampleSize = 0;

    for (const segment of sampleSegments) {
      try {
        const response = await fetch(segment.url, {
          method: 'HEAD',
        });

        if (response.ok) {
          const contentLength = response.headers.get('content-length');
          if (contentLength !== null && contentLength !== '') {
            totalSampleSize += parseInt(contentLength);
          }
        }
      } catch (error) {
        console.warn('Failed to get segment size:', error);
      }
    }

    // Estimate total size based on sample
    if (totalSampleSize > 0) {
      const avgSegmentSize = totalSampleSize / sampleSize;
      return Math.round(avgSegmentSize * segments.length);
    }

    // Fallback estimate: ~500KB per segment
    return segments.length * 500 * 1024;
  }
}
