/**
 * Content Script for SocviDL Chrome Extension
 * Injects download buttons and detects videos on Twitter/X and Reddit
 */

console.log('SocviDL Content Script loaded on', window.location.hostname);

// Platform detection
const PLATFORM = detectPlatform();
const VIDEO_SELECTOR = getVideoSelector();
const BUTTON_CLASS = 'socvidl-download-btn';

/**
 * Detect current platform
 */
function detectPlatform() {
  const hostname = window.location.hostname;
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  } else if (hostname.includes('reddit.com')) {
    return 'reddit';
  }
  return null;
}

/**
 * Get platform-specific video selector
 */
function getVideoSelector() {
  switch (PLATFORM) {
    case 'twitter':
      return 'video, div[data-testid="videoPlayer"] video';
    case 'reddit':
      return 'video[class*="media-element"], shreddit-player video';
    default:
      return 'video';
  }
}

/**
 * Initialize video detection and button injection
 */
function initialize() {
  if (!PLATFORM) {
    console.warn('SocviDL: Unsupported platform');
    return;
  }

  // Initial scan for videos
  detectAndInjectButtons();

  // Set up mutation observer for dynamically loaded content
  observePageChanges();

  console.log(`SocviDL initialized for ${PLATFORM}`);
}

/**
 * Detect videos and inject download buttons
 */
function detectAndInjectButtons() {
  const videos = document.querySelectorAll(VIDEO_SELECTOR);

  videos.forEach(video => {
    // Skip if button already injected
    if (video.dataset.socvidlProcessed === 'true') {
      return;
    }

    // Mark as processed
    video.dataset.socvidlProcessed = 'true';

    // Find appropriate container for button
    const container = findButtonContainer(video);
    if (container) {
      injectDownloadButton(container, video);
    }
  });
}

/**
 * Find the appropriate container for the download button
 * @param {HTMLVideoElement} video - The video element
 */
function findButtonContainer(video) {
  // Platform-specific container selection
  if (PLATFORM === 'twitter') {
    // Look for tweet action buttons container
    return (
      video.closest('article')?.querySelector('[role="group"]') ||
      video.closest('div[data-testid="tweet"]')?.querySelector('[role="group"]')
    );
  } else if (PLATFORM === 'reddit') {
    // Look for post action buttons
    return video
      .closest('shreddit-post, .Post, [data-test-id="post-content"]')
      ?.querySelector('.Post__buttons, [class*="PostFooter"], [class*="controls"]');
  }

  // Fallback: inject near video
  return video.parentElement;
}

/**
 * Inject download button into container
 * @param {HTMLElement} container - Container element
 * @param {HTMLVideoElement} video - Associated video element
 */
function injectDownloadButton(container, video) {
  // Create button element
  const button = document.createElement('button');
  button.className = BUTTON_CLASS;
  button.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
    </svg>
    <span>Download</span>
  `;
  button.title = 'Download video with SocviDL';

  // Add click handler
  button.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    handleDownloadClick(video, button);
  });

  // Insert button into container
  if (PLATFORM === 'twitter') {
    // Insert as sibling to other action buttons
    const firstButton = container.querySelector('[role="button"]');
    if (firstButton) {
      firstButton.parentElement.appendChild(button);
    } else {
      container.appendChild(button);
    }
  } else {
    container.appendChild(button);
  }
}

/**
 * Handle download button click
 * @param {HTMLVideoElement} video - Video to download
 * @param {HTMLButtonElement} button - Download button
 */
async function handleDownloadClick(video, button) {
  try {
    // Update button state
    button.classList.add('loading');
    button.querySelector('span').textContent = 'Processing...';

    // Extract video information
    const videoData = await extractVideoData(video);

    // Send download request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'downloadVideo',
      data: videoData,
    });

    if (response.success) {
      // Success feedback
      button.classList.remove('loading');
      button.classList.add('success');
      button.querySelector('span').textContent = 'Downloaded!';

      // Reset button after 3 seconds
      setTimeout(() => {
        button.classList.remove('success');
        button.querySelector('span').textContent = 'Download';
      }, 3000);
    } else {
      throw new Error(response.error || 'Download failed');
    }
  } catch (error) {
    console.error('Download error:', error);
    button.classList.remove('loading');
    button.classList.add('error');
    button.querySelector('span').textContent = 'Error';

    // Reset button after 3 seconds
    setTimeout(() => {
      button.classList.remove('error');
      button.querySelector('span').textContent = 'Download';
    }, 3000);
  }
}

/**
 * Extract video data for download
 * @param {HTMLVideoElement} video - Video element
 */
async function extractVideoData(video) {
  const videoUrl = video.src || video.querySelector('source')?.src;

  // Extract platform-specific metadata
  let username = 'unknown';
  let postId = '';

  if (PLATFORM === 'twitter') {
    const tweet = video.closest('article');
    username =
      tweet?.querySelector('[dir="ltr"] span')?.textContent?.replace('@', '') || 'twitter_user';
    postId = window.location.pathname.split('/status/')[1]?.split('/')[0] || '';
  } else if (PLATFORM === 'reddit') {
    const post = video.closest('shreddit-post, .Post, [data-test-id="post-content"]');
    username =
      post?.querySelector('[data-author], [class*="author"]')?.textContent || 'reddit_user';
    postId =
      post?.dataset.postId || window.location.pathname.split('/comments/')[1]?.split('/')[0] || '';
  }

  return {
    videoUrl,
    platform: PLATFORM,
    username,
    postId,
    timestamp: Date.now(),
    pageUrl: window.location.href,
  };
}

/**
 * Set up mutation observer to detect new videos
 */
function observePageChanges() {
  const observer = new MutationObserver(_mutations => {
    // Debounce to avoid excessive processing
    clearTimeout(window.socvidlDebounce);
    window.socvidlDebounce = setTimeout(() => {
      detectAndInjectButtons();
    }, 500);
  });

  // Observe the entire document for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
