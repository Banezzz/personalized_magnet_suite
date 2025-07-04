import { initMovieLinks } from './movie-links.js';
import { initTabReloader } from './tab-reloader.js';
import { initMagnetExtractor } from './magnet-extractor.js';
import { initThemeToggle, showTabCount } from './utils.js';

// 入口
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  showTabCount();
  initMovieLinks();
  initTabReloader();
  initMagnetExtractor();
});