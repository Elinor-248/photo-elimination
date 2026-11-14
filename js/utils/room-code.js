// 4 位數房號，可以是 0 開頭
export function generateRoomCode(random = Math.random) {
  return String(Math.floor(random() * 10000)).padStart(4, '0');
}

export function isRoomCode(text) {
  return /^[0-9]{4}$/.test(text);
}
