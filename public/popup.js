/**
 * Popup script for SocviDL extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Load download statistics
  loadStatistics();

  // Set up settings link
  document.getElementById('settingsLink').addEventListener('click', e => {
    e.preventDefault();
    // TODO: Open settings page (Phase 2)
    console.log('Settings page not yet implemented');
  });
});

/**
 * Load and display download statistics
 */
async function loadStatistics() {
  try {
    const { downloadHistory = [] } = await chrome.storage.local.get('downloadHistory');

    // Calculate statistics
    const today = new Date().toDateString();
    const todayDownloads = downloadHistory.filter(item => {
      return new Date(item.downloadedAt).toDateString() === today;
    });

    // Update UI
    document.getElementById('todayCount').textContent = todayDownloads.length;
    document.getElementById('totalCount').textContent = downloadHistory.length;
  } catch (error) {
    console.error('Failed to load statistics:', error);
  }
}
