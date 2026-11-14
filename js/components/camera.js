// 相機（SPEC 4.3）。第一次一定要在使用者點擊後打開（T02），打開後整局都不關，直到 stopCamera。
// <video> 要有 autoplay、playsinline、muted，iOS 才不會跳成全螢幕或一片黑（T01）。
import { h } from '../utils/dom.js';

let stream = null;
let facing = 'environment';

// 錯誤代碼對應 i18n 的 capture.camera* 說明
function errorCode(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'cameraDenied';
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'cameraMissing';
  return 'cameraFailed';
}

async function requestStream() {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false,
  });
}

export function isCameraOpen() {
  return stream != null;
}

export function isFrontCamera() {
  return facing === 'user';
}

// 回傳 null 代表成功，否則回傳錯誤代碼
export async function openCamera() {
  if (stream) return null;
  // http 加區網 IP 時 mediaDevices 是 undefined（T04）
  if (!navigator.mediaDevices?.getUserMedia) return 'cameraInsecure';
  try {
    stream = await requestStream();
    return null;
  } catch (error) {
    console.error(error);
    return errorCode(error);
  }
}

export async function switchCamera() {
  const previous = facing;
  facing = facing === 'environment' ? 'user' : 'environment';
  stopTracks();
  try {
    stream = await requestStream();
    return null;
  } catch (error) {
    // 換不過去就換回原本的鏡頭
    console.error(error);
    facing = previous;
    stream = await requestStream().catch(() => null);
    return errorCode(error);
  }
}

function stopTracks() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

// 出局、遊戲結束、離開房間時呼叫
export function stopCamera() {
  stopTracks();
  facing = 'environment';
}

export function createVideo() {
  const video = h('video', { class: 'camera-video', autoplay: true, playsinline: true, muted: true });
  // iOS 要的是 muted 屬性值，不只是 HTML attribute
  video.muted = true;
  return video;
}

export function attachVideo(video) {
  video.srcObject = stream;
  video.classList.toggle('camera-video--mirror', isFrontCamera());
  video.play().catch(() => {});
}
