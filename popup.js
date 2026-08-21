import { initMovieLinks } from './movie-links.js';
import { initTabReloader } from './tab-reloader.js';
import { initMagnetExtractor } from './magnet-extractor.js';
import {
  initThemeToggle,
  showTabCount,
  initCollapsibles,
  initNetworkStatus,
  addLog,
  loadLogs
} from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  initThemeToggle();
  showTabCount();
  await loadLogs();
  initMovieLinks();
  initTabReloader();
  initMagnetExtractor();
  initCollapsibles();
  initNetworkStatus();
  addLog('扩展已加载', 'info');
});
