/**
 * Background Service Worker for SocviDL Chrome Extension
 * Handles video extraction, downloads, and message passing
 */

console.log('SocviDL Background Service Worker initialized');

// Listen for installation
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    console.log('SocviDL Extension installed');
    // Set default storage values
    chrome.storage.local.set({
      settings: {
        defaultQuality: 'highest',
        autoDownload: false,
        filenameTemplate: '{platform}_{username}_{timestamp}',
      },
      downloadHistory: [],
    });
  } else if (details.reason === 'update') {
    console.log('SocviDL Extension updated to version', chrome.runtime.getManifest().version);
  }
});

// Message handler for content script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);

  switch (request.action) {
    case 'downloadVideo':
      handleVideoDownload(request.data, sender.tab)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Will respond asynchronously

    case 'getSettings':
      chrome.storage.local.get('settings', data => {
        sendResponse(data.settings);
      });
      return true;

    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

/**
 * Handle video download request
 * @param {Object} data - Video information
 * @param {chrome.tabs.Tab} _tab - Source tab
 */
async function handleVideoDownload(data, _tab) {
  try {
    const { videoUrl, platform, username, timestamp } = data;

    // Generate filename based on template
    const filename = generateFilename(platform, username, timestamp);

    // Initiate download using Chrome Downloads API
    const downloadId = await chrome.downloads.download({
      url: videoUrl,
      filename: filename,
      saveAs: false,
    });

    // Track download in history
    await trackDownload(downloadId, data);

    return { success: true, downloadId };
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  }
}

/**
 * Generate filename based on template and sanitize it
 * @param {string} platform - Platform name (twitter/reddit)
 * @param {string} username - User who posted the video
 * @param {string} timestamp - Post timestamp
 */
function generateFilename(platform, username, timestamp) {
  const date = new Date(timestamp || Date.now());
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');

  // Sanitize filename components
  const safePlatform = platform.replace(/[^a-z0-9]/gi, '');
  const safeUsername = username.replace(/[^a-z0-9_]/gi, '');

  return `socvidl_${safePlatform}_${safeUsername}_${dateStr}_${timeStr}.mp4`;
}

/**
 * Track download in extension history
 * @param {number} downloadId - Chrome download ID
 * @param {Object} videoData - Video metadata
 */
async function trackDownload(downloadId, videoData) {
  const history = await chrome.storage.local.get('downloadHistory');
  const downloads = history.downloadHistory || [];

  downloads.unshift({
    id: downloadId,
    ...videoData,
    downloadedAt: new Date().toISOString(),
  });

  // Keep only last 100 downloads
  if (downloads.length > 100) {
    downloads.splice(100);
  }

  await chrome.storage.local.set({ downloadHistory: downloads });
}
