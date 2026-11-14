// LINE、Instagram、Facebook 的內建瀏覽器常常不能開相機（SPEC 4.1）
const IN_APP_PATTERN = /\bLine\/|Instagram|FBAN|FBAV|FB_IAB/i;

export function isInAppBrowser(userAgent = navigator.userAgent) {
  return IN_APP_PATTERN.test(userAgent);
}

// localStorage 只存暱稱和靜音設定（CLAUDE.md）。私密瀏覽模式下可能會丟錯，所以包起來。
const NICKNAME_KEY = 'nickname';

export function loadNickname() {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(name) {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch {
    // 存不了就下次重打
  }
}
