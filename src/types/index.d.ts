/**
 * Type definitions for SocviDL Chrome Extension
 */

// Platform types
export type Platform = 'twitter' | 'reddit' | null;

// Video data structure
export interface VideoData {
  videoUrl: string;
  platform: Platform;
  username: string;
  postId: string;
  timestamp: number;
  pageUrl: string;
  quality?: VideoQuality;
}

// Video quality options
export interface VideoQuality {
  resolution: string;
  bitrate: number;
  format: string;
}

// Download status
export interface DownloadStatus {
  id: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress?: number;
  error?: string;
}

// Extension settings
export interface ExtensionSettings {
  defaultQuality: 'highest' | 'lowest' | 'auto';
  autoDownload: boolean;
  filenameTemplate: string;
  downloadLocation?: string;
  enableNotifications: boolean;
}

// Message types for extension communication
export interface ExtensionMessage {
  action: string;
  data?: unknown;
  tabId?: number;
}

export interface DownloadMessage extends ExtensionMessage {
  action: 'downloadVideo';
  data: VideoData;
}

export interface SettingsMessage extends ExtensionMessage {
  action: 'getSettings' | 'updateSettings';
  data?: Partial<ExtensionSettings>;
}

// Download history entry
export interface DownloadHistoryEntry extends VideoData {
  id: number;
  downloadedAt: string;
  fileSize?: number;
  fileName?: string;
}

// Chrome API augmentations
declare global {
  interface Window {
    socvidlDebounce?: NodeJS.Timeout;
  }
}

// M3U8 parsing types
export interface M3U8Variant {
  uri: string;
  bandwidth: number;
  resolution?: {
    width: number;
    height: number;
  };
  codecs?: string;
}

export interface M3U8Playlist {
  variants: M3U8Variant[];
  segments?: string[];
  duration?: number;
}

// Reddit DASH types
export interface RedditDASHStream {
  url: string;
  type: 'video' | 'audio';
  quality?: string;
  bitrate?: number;
}

// Button state
export type ButtonState = 'idle' | 'loading' | 'success' | 'error';

// Reload message types (for development)
export interface ReloadMessage {
  type: 'reload-extension' | 'reload-tab' | 'reload-content' | 'update-css' | 'connected';
  timestamp: number;
  file?: string;
}
