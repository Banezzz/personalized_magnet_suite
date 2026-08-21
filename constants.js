/**
 * Shared constants for popup modules and the background service worker.
 */

export const SITE_PRESETS = {
  javdb: {
    selector: '.movie-list.h.cols-4 a.box',
    baseUrl: 'https://javdb.com'
  },
  javbus: {
    selector: '.movie-box',
    baseUrl: ''
  },
  javlibrary: {
    selector: '.video a[href*="/v="]',
    baseUrl: ''
  },
  'generic-list': {
    selector: 'a[href]',
    baseUrl: ''
  },
  custom: {
    selector: '',
    baseUrl: ''
  }
};

export const ACTIONS = {
  openMovieLinks: 'openMovieLinks',
  cancelMovieTask: 'cancelMovieTask',
  getMovieTaskStatus: 'getMovieTaskStatus',
  movieProgress: 'movieProgress',
  movieComplete: 'movieComplete',
  movieError: 'movieError',
  movieTaskCancelled: 'movieTaskCancelled',
  startRefreshing: 'startRefreshing',
  stopRefreshing: 'stopRefreshing',
  getRefreshTaskStatus: 'getRefreshTaskStatus',
  refreshProgress: 'refreshProgress',
  refreshComplete: 'refreshComplete'
};

export const STORAGE_KEYS = {
  movieTaskProgress: 'movieTaskProgress',
  refreshTaskProgress: 'refreshTaskProgress',
  taskHistory: 'taskHistory',
  persistentLogs: 'persistentLogs',
  isDarkTheme: 'isDarkTheme',
  movieSettings: 'movieSettings'
};

export const LIMITS = {
  maxLogs: 200,
  maxHistory: 50
};

export const DEFAULTS = {
  batchSize: 2,
  delaySeconds: 3,
  topPages: 8,
  maxTopPages: 20,
  extractTimeoutMs: 10000,
  extractPollMs: 500,
  extractMaxWaitMs: 15000,
  topPageDelayMinMs: 5000,
  topPageDelayMaxMs: 7000,
  keepAliveMinutes: 0.4,
  emptyPagesToStop: 2,
  jitterRatio: 0.3
};

export const ALARM_KEEP_ALIVE = 'taskKeepAlive';

export const JAVDB_STRIP_QUERY_PARAMS = ['lang', 'f', 'locale', 'utm_source', 'utm_medium', 'utm_campaign'];
