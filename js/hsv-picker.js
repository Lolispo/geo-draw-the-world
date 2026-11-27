// The HSV colour picker: a saturation/value square and a hue strip. Shared by the Flag
// Color Picker game and the quiz's colour-mix question.

import { rgbToHex } from './color.js';

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

// Neutral grey, so the start hints at no colour in particular.
const START = { hue: 0, sat: 0, val: 0.5 };
const toHex = (h, s, v) => { const { r, g, b } = hsvToRgb(h, s, v); return rgbToHex(r, g, b); };

export function createHsvPicker({ onChange } = {}) {
  let { hue, sat, val } = START, disabled = false, touched = false;
  const hex = () => toHex(hue, sat, val);

  const el = document.createElement('div');
  el.className = 'picker-wrap';
  const sv = document.createElement('canvas');
  sv.className = 'picker-sv';
  sv.width = 220; sv.height = 180;
  const hueC = document.createElement('canvas');
  hueC.className = 'picker-hue';
  hueC.width = 24; hueC.height = 180;
  const row = document.createElement('div');
  row.className = 'picker-row';
  row.append(sv, hueC);
  const swatchRow = document.createElement('div');
  swatchRow.className = 'picker-swatch-row';
  const swatch = document.createElement('div');
  swatch.className = 'picker-swatch';
  swatchRow.append(swatch);
  el.append(row, swatchRow);

  const drawSV = () => {
    const ctx = sv.getContext('2d');
    const w = sv.width, h = sv.height;
    const base = hsvToRgb(hue, 1, 1);
    ctx.fillStyle = rgbToHex(base.r, base.g, base.b);
    ctx.fillRect(0, 0, w, h);
    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, 'rgba(255,255,255,1)');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = white; ctx.fillRect(0, 0, w, h);
    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = black; ctx.fillRect(0, 0, w, h);
    const mx = sat * w, my = (1 - val) * h;
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, 7, 0, Math.PI * 2);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  };
  const drawHue = () => {
    const ctx = hueC.getContext('2d');
    const w = hueC.width, h = hueC.height;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= 6; i++) {
      const { r, g, b } = hsvToRgb(((i / 6) * 360) % 360, 1, 1);
      grad.addColorStop(i / 6, rgbToHex(r, g, b));
    }
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    const y = (hue / 360) * h;
    ctx.beginPath(); ctx.rect(0, y - 2, w, 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  };
  const update = () => {
    touched = true;
    drawSV(); drawHue();
    swatch.style.background = hex();
    onChange?.(hex());
  };
  const drag = (surface, handler) => {
    let active = false;
    surface.addEventListener('pointerdown', (e) => {
      if (disabled) return;
      active = true; surface.setPointerCapture?.(e.pointerId); handler(e); e.preventDefault();
    });
    surface.addEventListener('pointermove', (e) => { if (active) handler(e); });
    const up = (e) => { active = false; surface.releasePointerCapture?.(e.pointerId); };
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
  };
  drag(sv, (e) => {
    const r = sv.getBoundingClientRect();
    sat = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    val = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    update();
  });
  drag(hueC, (e) => {
    const r = hueC.getBoundingClientRect();
    hue = Math.max(0, Math.min(359.9, ((e.clientY - r.top) / r.height) * 360));
    update();
  });
  drawSV(); drawHue();
  swatch.style.background = hex();

  return { el, swatchRow, hex, touched: () => touched, disable: () => { disabled = true; } };
}
