// A flag with one colour taken out, greyed and hatched. Shared by the flag games and
// the quiz, so the blank looks the same everywhere.

import { hexToRgb } from './color.js';
import { flagUrl } from './flags.js';

const images = new Map();
function loadImage(url) {
  if (!images.has(url)) {
    images.set(url, new Promise((resolve, reject) => {
      const img = new Image();
      // Pixels are read back, so a CDN image must come without tainting the canvas.
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => { images.delete(url); reject(new Error(url)); };
      img.src = url;
    }));
  }
  return images.get(url);
}

// Resolves with a second canvas of the same flag where the removed colour is
// transparent, so any colour drawn underneath shows through — or null when the image
// could not load, in which case a named placeholder is painted instead.
export async function paintBlanked(canvas, code, hex, { name = code, colors = [] } = {}) {
  try {
    return blank(canvas, await loadImage(flagUrl(code, 'w640')), hex);
  } catch {
    return paintSwatches(canvas, name, colors, hex);
  }
}

// No image, or one whose pixels can't be read (the unblanked flag would give the answer
// away): the flag's colours as stripes with the missing one greyed out, so the question
// still says which colour is gone. The hole canvas it returns works like an image's.
function paintSwatches(canvas, name, colors, hex) {
  const w = 640, h = 400;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const hole = document.createElement('canvas');
  hole.width = w; hole.height = h;
  const hctx = hole.getContext('2d');
  const list = colors.length ? colors : [hex];
  const sw = w / list.length;
  list.forEach((c, i) => {
    const missing = c === hex;
    ctx.fillStyle = missing ? '#c8c8c8' : c;
    ctx.fillRect(i * sw, 0, Math.ceil(sw), h - 60);
    if (!missing) { hctx.fillStyle = c; hctx.fillRect(i * sw, 0, Math.ceil(sw), h - 60); }
    if (missing) {
      ctx.save(); ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = i * sw - h; x < (i + 1) * sw; x += 14) { ctx.moveTo(x, h - 60); ctx.lineTo(x + h - 60, 0); }
      ctx.rect(i * sw, 0, sw, h - 60); ctx.clip(); ctx.stroke(); ctx.restore();
    }
  });
  for (const c of [ctx, hctx]) {
    c.fillStyle = '#222'; c.fillRect(0, h - 60, w, 60);
    c.fillStyle = '#bbb'; c.font = '26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(`${name} flag colours`, w / 2, h - 30);
  }
  return hole;
}

function blank(canvas, img, hex) {
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = data.data;
  const holeData = ctx.createImageData(canvas.width, canvas.height);
  holeData.data.set(d);
  const hole = holeData.data;
  const t = hexToRgb(hex);
  for (let p = 0; p < d.length; p += 4) {
    if (Math.hypot(d[p] - t.r, d[p + 1] - t.g, d[p + 2] - t.b) < 80) {
      d[p] = 200; d[p + 1] = 200; d[p + 2] = 200; d[p + 3] = 255;
      hole[p + 3] = 0;
    }
  }
  ctx.putImageData(data, 0, 0);
  ctx.save(); ctx.strokeStyle = '#bbb'; ctx.lineWidth = 2;
  ctx.beginPath();
  const step = 12, w = canvas.width, h = canvas.height;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const p = (y * w + x) * 4;
    if (hole[p + 3] === 0) { ctx.moveTo(x, y); ctx.lineTo(x + step * 0.7, y + step * 0.7); }
  }
  ctx.stroke(); ctx.restore();
  const holeCanvas = document.createElement('canvas');
  holeCanvas.width = w; holeCanvas.height = h;
  holeCanvas.getContext('2d').putImageData(holeData, 0, 0);
  return holeCanvas;
}

// The full flag, for after the answer.
export async function paintFull(canvas, code) {
  try {
    const img = await loadImage(flagUrl(code, 'w640'));
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
  } catch { /* the blanked or placeholder version stays */ }
}

// The flag drawn with `fill` showing through its hole.
export function paintFilled(canvas, holeCanvas, fill) {
  if (!holeCanvas) return;
  canvas.width = holeCanvas.width; canvas.height = holeCanvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(holeCanvas, 0, 0);
}
