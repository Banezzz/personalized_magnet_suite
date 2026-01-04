import { initMovieLinks } from './movie-links.js';
import { initTabReloader } from './tab-reloader.js';
import { initMagnetExtractor } from './magnet-extractor.js';
import {
  initThemeToggle,
  showTabCount,
  initCollapsibles,
  initNetworkStatus,
  addLog
} from './utils.js';

// 入口
document.addEventListener('DOMContentLoaded', () => {
  // 初始化主题
  initThemeToggle();

  // 显示标签计数
  showTabCount();

  // 初始化各功能模块
  initMovieLinks();
  initTabReloader();
  initMagnetExtractor();

  // 初始化可折叠区域
  initCollapsibles();

  // 初始化网络状态检测
  initNetworkStatus();

  // 记录启动日志
  addLog('扩展已加载', 'info');
});
