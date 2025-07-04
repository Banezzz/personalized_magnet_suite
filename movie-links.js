import { showToast } from './utils.js';

export function initMovieLinks() {
  const openBtn = document.getElementById('openMovieLinks');
  if (!openBtn) return;

  openBtn.addEventListener('click', () => {
    const urlInput = document.getElementById('movieUrl').value.trim();
    const isTopChecked = document.getElementById('topOption').checked;

    if (!urlInput) {
      showToast('请输入有效的电影链接 URL');
      return;
    }

    if (isTopChecked) {
      const baseUrl = new URL(urlInput);
      Array.from({ length: 8 }, (_, i) => i + 1).forEach(page => {
        const pageUrl = new URL(baseUrl);
        pageUrl.searchParams.set('page', page);
        fetchAndOpenLinks(pageUrl.toString());
      });
    } else {
      fetchAndOpenLinks(urlInput);
    }
  });
}

async function fetchAndOpenLinks(url) {
  try {
    const response = await fetch(url);
    const data = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(data, 'text/html');
    const links = doc.querySelectorAll('.movie-list.h.cols-4 a.box');

    links.forEach(link => {
      const href = link.getAttribute('href');
      const fullUrl = `https://javdb.com${href}`;
      chrome.tabs.create({ url: fullUrl });
    });
  } catch (error) {
    console.error('获取 URL 失败:', error);
    showToast('获取链接时出错，请检查 URL');
  }
} 