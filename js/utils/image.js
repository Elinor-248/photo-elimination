// 照片擷取與壓縮（SPEC 5.5）
import { MAX_PHOTO_CHARS } from '../config.js';

// 寬：高 = 3：4 的直式照片
const PHOTO_RATIO = 3 / 4;

// 依序嘗試，第一個不超過 MAX_PHOTO_CHARS 的就用它
export const COMPRESS_STEPS = [
  { longEdge: 800, quality: 0.7 },
  { longEdge: 800, quality: 0.5 },
  { longEdge: 800, quality: 0.4 },
  { longEdge: 600, quality: 0.4 },
];

// 從畫面正中間裁出 3:4 的範圍
export function cropRect(width, height) {
  if (width / height > PHOTO_RATIO) {
    const sw = Math.round(height * PHOTO_RATIO);
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sh = Math.round(width / PHOTO_RATIO);
  return { sx: 0, sy: Math.round((height - sh) / 2), sw: width, sh };
}

export function outputSize(longEdge) {
  return { width: Math.round(longEdge * PHOTO_RATIO), height: longEdge };
}

// encode(step) 回傳 data URL。全部都太大時回傳 null。
export function compress(encode, steps = COMPRESS_STEPS, maxChars = MAX_PHOTO_CHARS) {
  for (const step of steps) {
    const dataUrl = encode(step);
    if (dataUrl.length <= maxChars) return dataUrl;
  }
  return null;
}

// 從 <video> 擷取目前畫面。前鏡頭的預覽有鏡像，但存下來的照片不鏡像（直接畫原始畫面）。
export function capturePhoto(video) {
  const crop = cropRect(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  return compress(({ longEdge, quality }) => {
    const { width, height } = outputSize(longEdge);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  });
}
