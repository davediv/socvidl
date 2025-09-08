/**
 * DownloadManager module for handling Chrome extension downloads
 * Integrates with Chrome Downloads API to save video files
 */

export interface DownloadOptions {
  url?: string;
  blob?: Blob;
  filename?: string;
  platform?: 'twitter' | 'reddit' | 'unknown';
  username?: string;
  postId?: string;
  timestamp?: number;
  saveAs?: boolean;
  conflictAction?: chrome.downloads.FilenameConflictAction;
}

export interface DownloadResult {
  success: boolean;
  downloadId?: number;
  filename?: string;
  error?: string;
}

export interface FilenameTemplate {
  platform: string;
  username: string;
  postId: string;
  timestamp: string;
  date: string;
  time: string;
  extension: string;
}

export class DownloadManager {
  private static instance: DownloadManager;
  private defaultTemplate = '{platform}_{username}_{timestamp}';
  private readonly maxFilenameLength = 255;
  private readonly forbiddenChars = /[<>:"/\\|?*\x00-\x1F]/g;
  private readonly reservedNames = [
    'CON',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'COM2',
    'COM3',
    'COM4',
    'COM5',
    'COM6',
    'COM7',
    'COM8',
    'COM9',
    'LPT1',
    'LPT2',
    'LPT3',
    'LPT4',
    'LPT5',
    'LPT6',
    'LPT7',
    'LPT8',
    'LPT9',
  ];

  private constructor() {}

  /**
   * Get singleton instance of DownloadManager
   */
  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  /**
   * Initiates a download using Chrome Downloads API
   */
  async initiateDownload(options: DownloadOptions): Promise<DownloadResult> {
    try {
      // Validate Chrome API availability
      if (!chrome?.downloads) {
        throw new Error('Chrome Downloads API not available');
      }

      // Generate filename if not provided
      const filename = options.filename || this.generateFilename(options);

      // Validate filename
      if (!this.isValidFilename(filename)) {
        throw new Error('Invalid filename generated');
      }

      let downloadUrl: string;

      // Handle blob downloads
      if (options.blob) {
        downloadUrl = URL.createObjectURL(options.blob);

        // Clean up blob URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(downloadUrl);
        }, 60000); // Clean up after 1 minute
      } else if (options.url) {
        downloadUrl = options.url;
      } else {
        throw new Error('No URL or blob provided for download');
      }

      // Prepare download options
      const downloadOptions: chrome.downloads.DownloadOptions = {
        url: downloadUrl,
        filename: filename,
        saveAs: options.saveAs ?? false,
        conflictAction: options.conflictAction ?? 'uniquify',
      };

      // Initiate download
      const downloadId = await this.chromeDownload(downloadOptions);

      // Monitor download progress
      await this.monitorDownload(downloadId);

      return {
        success: true,
        downloadId,
        filename,
      };
    } catch (error) {
      console.error('Download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generates a descriptive filename based on video metadata
   */
  generateFilename(options: DownloadOptions): string {
    const {
      platform = 'unknown',
      username = 'user',
      postId = '',
      timestamp = Date.now(),
    } = options;

    // Create template variables
    const date = new Date(timestamp);
    const templateVars: FilenameTemplate = {
      platform: this.sanitizeFilename(platform),
      username: this.sanitizeFilename(username),
      postId: this.sanitizeFilename(postId || ''),
      timestamp: timestamp.toString(),
      date: date.toISOString().split('T')[0] ?? '', // YYYY-MM-DD
      time: date.toTimeString().split(' ')[0]?.replace(/:/g, '-') ?? '', // HH-MM-SS
      extension: 'mp4',
    };

    // Get template from storage or use default
    const template = this.getFilenameTemplate();

    // Replace template variables
    let filename = template;
    Object.entries(templateVars).forEach(([key, value]) => {
      filename = filename.replace(`{${key}}`, value);
    });

    // Remove any remaining empty template variables
    filename = filename.replace(/\{[^}]+\}/g, '');

    // Clean up multiple underscores or dashes
    filename = filename.replace(/[_-]{2,}/g, '_');

    // Add extension if not present
    if (!filename.endsWith('.mp4')) {
      filename += '.mp4';
    }

    // Ensure filename doesn't exceed max length
    if (filename.length > this.maxFilenameLength) {
      const extension = '.mp4';
      const baseLength = this.maxFilenameLength - extension.length - 3; // Reserve space for "..." and extension
      filename = filename.substring(0, baseLength) + '...' + extension;
    }

    return filename;
  }

  /**
   * Sanitizes a filename to be filesystem-safe
   */
  private sanitizeFilename(input: string): string {
    if (!input) return '';

    // Remove forbidden characters
    let sanitized = input.replace(this.forbiddenChars, '_');

    // Replace spaces with underscores (optional)
    sanitized = sanitized.replace(/\s+/g, '_');

    // Remove leading/trailing dots and spaces
    sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');

    // Check for reserved names (Windows)
    const nameWithoutExt = sanitized.split('.')[0]?.toUpperCase();
    if (nameWithoutExt && this.reservedNames.includes(nameWithoutExt)) {
      sanitized = '_' + sanitized;
    }

    // Remove any remaining problematic patterns
    sanitized = sanitized.replace(/\.{2,}/g, '_'); // Multiple dots
    sanitized = sanitized.replace(/^-+|-+$/g, ''); // Leading/trailing hyphens

    // Fallback to timestamp if empty
    if (!sanitized) {
      sanitized = Date.now().toString();
    }

    return sanitized;
  }

  /**
   * Validates if a filename is safe for the filesystem
   */
  private isValidFilename(filename: string): boolean {
    if (!filename || filename.length === 0) return false;
    if (filename.length > this.maxFilenameLength) return false;

    // Check for forbidden characters
    if (this.forbiddenChars.test(filename)) return false;

    // Check for reserved names
    const nameWithoutExt = filename.split('.')[0]?.toUpperCase();
    if (nameWithoutExt && this.reservedNames.includes(nameWithoutExt)) return false;

    // Check for problematic patterns
    if (filename.startsWith('.')) return false;
    if (filename.endsWith('.')) return false;
    if (/\.{2,}/.test(filename)) return false; // Multiple consecutive dots

    return true;
  }

  /**
   * Wraps Chrome download API in a promise
   */
  private chromeDownload(options: chrome.downloads.DownloadOptions): Promise<number> {
    return new Promise((resolve, reject) => {
      chrome.downloads.download(options, downloadId => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (downloadId === undefined) {
          reject(new Error('Download failed to start'));
        } else {
          resolve(downloadId);
        }
      });
    });
  }

  /**
   * Monitors download progress until completion
   */
  private monitorDownload(downloadId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkDownload = () => {
        chrome.downloads.search({ id: downloadId }, downloads => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          const download = downloads[0];
          if (!download) {
            reject(new Error('Download not found'));
            return;
          }

          switch (download.state) {
            case 'complete':
              resolve();
              break;
            case 'interrupted':
              reject(new Error(`Download interrupted: ${download.error || 'Unknown error'}`));
              break;
            case 'in_progress':
              // Continue monitoring
              setTimeout(checkDownload, 500);
              break;
          }
        });
      };

      // Start monitoring
      checkDownload();
    });
  }

  /**
   * Gets the filename template from storage or returns default
   */
  private getFilenameTemplate(): string {
    // TODO: Implement storage integration
    // For now, return default template
    return this.defaultTemplate;
  }

  /**
   * Sets a custom filename template
   */
  setFilenameTemplate(template: string): void {
    this.defaultTemplate = template;
    // TODO: Save to storage
  }

  /**
   * Cancels an ongoing download
   */
  async cancelDownload(downloadId: number): Promise<boolean> {
    return new Promise(resolve => {
      chrome.downloads.cancel(downloadId, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  /**
   * Pauses a download
   */
  async pauseDownload(downloadId: number): Promise<boolean> {
    return new Promise(resolve => {
      chrome.downloads.pause(downloadId, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  /**
   * Resumes a paused download
   */
  async resumeDownload(downloadId: number): Promise<boolean> {
    return new Promise(resolve => {
      chrome.downloads.resume(downloadId, () => {
        resolve(!chrome.runtime.lastError);
      });
    });
  }

  /**
   * Gets download history
   */
  async getDownloadHistory(limit = 100): Promise<chrome.downloads.DownloadItem[]> {
    return new Promise(resolve => {
      chrome.downloads.search(
        {
          limit,
          orderBy: ['-startTime'],
        },
        downloads => {
          resolve(downloads || []);
        }
      );
    });
  }

  /**
   * Clears completed downloads from history
   */
  async clearDownloadHistory(): Promise<void> {
    return new Promise(resolve => {
      chrome.downloads.erase({}, () => {
        resolve();
      });
    });
  }
}
