// Animated globe with flying airplanes for the menu background

const PLANE_COUNT = 8;
const GLOBE_COLOR = '#1a2d44';
const GRID_COLOR = '#1e3a5f';
const OCEAN_LINE_COLOR = '#152538';
const TRAIL_COLOR = '#58a6ff18';

// Rough continent outlines in lat/lon (simplified)
const CONTINENTS = [
  // Africa
  { points: [[-18,35],[10,37],[33,30],[42,12],[50,-2],[40,-15],[35,-34],[20,-35],[12,-17],[5,5],[-18,5],[-18,15],[-18,35]] },
  // Europe
  { points: [[-10,36],[0,38],[5,43],[10,45],[15,55],[25,60],[30,70],[40,65],[45,55],[30,45],[25,37],[15,38],[5,36],[-10,36]] },
  // Asia
  { points: [[25,37],[30,45],[45,55],[60,55],[80,70],[100,65],[120,55],[140,45],[130,35],[120,30],[105,22],[95,10],[80,8],[70,25],[55,25],[40,12],[33,30],[25,37]] },
  // North America
  { points: [[-170,65],[-160,70],[-140,60],[-125,50],[-120,35],[-105,30],[-100,20],[-90,15],[-85,10],[-80,25],[-75,45],[-60,47],[-65,60],[-80,65],[-95,70],[-170,65]] },
  // South America
  { points: [[-80,10],[-77,0],[-75,-5],[-70,-15],[-65,-22],[-70,-40],[-73,-50],[-68,-55],[-60,-35],[-50,-23],[-35,-5],[-50,5],[-60,10],[-80,10]] },
  // Australia
  { points: [[115,-10],[130,-12],[145,-15],[150,-25],[148,-35],[140,-38],[130,-32],[115,-35],[114,-25],[115,-10]] },
];

class Airplane {
  constructor() {
    this.reset();
    // Start at random progress
    this.progress = Math.random();
    this.isSwedish = Math.random() < 0.5;
  }

  reset() {
    // Random great-circle-ish route
    this.startLon = Math.random() * 360 - 180;
    this.startLat = Math.random() * 120 - 60;
    this.endLon = this.startLon + (Math.random() * 200 - 100);
    this.endLat = Math.random() * 120 - 60;
    this.altitude = 0.06 + Math.random() * 0.04; // above globe surface
    this.speed = 0.015 + Math.random() * 0.025;
    this.progress = 0;
    this.trail = [];
  }

  update(dt) {
    this.progress += this.speed * dt;
    if (this.progress > 1) {
      this.isSwedish = Math.random() < 0.5;
      this.reset();
    }

    const pos = this.getPosition();
    this.trail.push(pos);
    if (this.trail.length > 30) this.trail.shift();
  }

  getPosition() {
    const t = this.progress;
    const lat = this.startLat + (this.endLat - this.startLat) * t;
    const lon = this.startLon + (this.endLon - this.startLon) * t;
    return { lat, lon };
  }
}

export class MenuGlobe {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rotation = 0;
    this.tilt = 0.35; // slight tilt
    this.planes = [];
    this.animId = null;
    this.lastTime = 0;

    for (let i = 0; i < PLANE_COUNT; i++) {
      this.planes.push(new Airplane());
    }
  }

  start() {
    if (this.animId) return; // already running
    this._resize();
    this.lastTime = performance.now();
    this._animate();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  stop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.animId = null;
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.displayWidth = rect.width;
    this.displayHeight = rect.height;
  }

  _animate() {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.rotation += dt * 8; // degrees per second

    for (const plane of this.planes) {
      plane.update(dt);
    }

    this._render();
    this.animId = requestAnimationFrame(() => this._animate());
  }

  // Convert lat/lon to 3D point on unit sphere, then project
  _project(lat, lon, radius, cx, cy) {
    const latR = lat * Math.PI / 180;
    const lonR = (lon + this.rotation) * Math.PI / 180;
    const tilt = this.tilt;

    const x = Math.cos(latR) * Math.sin(lonR);
    const y = Math.sin(latR);
    const z = Math.cos(latR) * Math.cos(lonR);

    // Apply tilt (rotate around X axis)
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
    const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);

    return {
      x: cx + x * radius,
      y: cy - y2 * radius,
      z: z2, // positive = facing us
      visible: z2 > -0.05
    };
  }

  _render() {
    const ctx = this.ctx;
    const w = this.displayWidth;
    const h = this.displayHeight;

    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.48;
    const radius = Math.min(w, h) * 0.32;

    // Globe glow
    const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.6);
    glowGrad.addColorStop(0, '#58a6ff08');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    // Globe disc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = GLOBE_COLOR;
    ctx.fill();

    // Inner shading
    const shadeGrad = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    shadeGrad.addColorStop(0, '#1e3a5f22');
    shadeGrad.addColorStop(0.7, 'transparent');
    shadeGrad.addColorStop(1, '#0005');
    ctx.fillStyle = shadeGrad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    // Latitude lines
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 3) {
        const p = this._project(lat, lon, radius, cx, cy);
        if (p.visible) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }

    // Longitude lines
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -90; lat <= 90; lat += 3) {
        const p = this._project(lat, lon, radius, cx, cy);
        if (p.visible) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }

    // Continents
    for (const cont of CONTINENTS) {
      ctx.beginPath();
      let started = false;
      let anyVisible = false;
      for (const [lon, lat] of cont.points) {
        const p = this._project(lat, lon, radius, cx, cy);
        if (p.visible) {
          anyVisible = true;
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else {
          started = false;
        }
      }
      if (anyVisible) {
        ctx.closePath();
        ctx.fillStyle = '#22334488';
        ctx.fill();
        ctx.strokeStyle = '#3a5f7f66';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.restore();

    // Globe edge ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e3a5f88';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Airplanes
    for (const plane of this.planes) {
      this._drawPlane(ctx, plane, radius, cx, cy);
    }
  }

  _drawPlane(ctx, plane, radius, cx, cy) {
    const pos = plane.getPosition();
    const planeRadius = radius * (1 + plane.altitude);
    const p = this._project(pos.lat, pos.lon, planeRadius, cx, cy);

    if (!p.visible) return;

    // Trail
    if (plane.trail.length > 2) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < plane.trail.length; i++) {
        const tp = this._project(plane.trail[i].lat, plane.trail[i].lon, planeRadius, cx, cy);
        if (tp.visible) {
          if (!started) { ctx.moveTo(tp.x, tp.y); started = true; }
          else ctx.lineTo(tp.x, tp.y);
        }
      }
      ctx.strokeStyle = TRAIL_COLOR;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Compute heading for rotation
    const nextT = Math.min(plane.progress + 0.01, 1);
    const nextLat = plane.startLat + (plane.endLat - plane.startLat) * nextT;
    const nextLon = plane.startLon + (plane.endLon - plane.startLon) * nextT;
    const pNext = this._project(nextLat, nextLon, planeRadius, cx, cy);
    const angle = Math.atan2(pNext.y - p.y, pNext.x - p.x);

    // Depth-based opacity and size
    const depthAlpha = 0.4 + p.z * 0.6;
    const size = 6 + p.z * 4;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.globalAlpha = depthAlpha;

    // Airplane body
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.6, -size * 0.35);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.6, size * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#c9d1d9';
    ctx.fill();

    // Wings
    ctx.beginPath();
    ctx.moveTo(size * 0.1, 0);
    ctx.lineTo(-size * 0.2, -size * 0.8);
    ctx.lineTo(-size * 0.4, -size * 0.7);
    ctx.lineTo(-size * 0.15, 0);
    ctx.lineTo(-size * 0.4, size * 0.7);
    ctx.lineTo(-size * 0.2, size * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#8b949e';
    ctx.fill();

    // Flag on tail
    ctx.rotate(-angle); // un-rotate for upright flag
    if (plane.isSwedish) {
      this._drawSwedishFlag(ctx, 0, -size * 1.2, Math.max(8, size * 0.8));
    } else {
      this._drawChineseFlag(ctx, 0, -size * 1.2, Math.max(8, size * 0.8));
    }

    ctx.restore();
  }

  _drawSwedishFlag(ctx, x, y, s) {
    const w = s;
    const h = s * 0.65;
    const lx = x - w / 2;
    const ty = y - h / 2;

    // Blue background
    ctx.fillStyle = '#006AA7';
    ctx.fillRect(lx, ty, w, h);

    // Yellow cross
    const cw = h * 0.15;
    ctx.fillStyle = '#FECC00';
    // Horizontal bar
    ctx.fillRect(lx, ty + h / 2 - cw / 2, w, cw);
    // Vertical bar (offset left like real flag)
    const crossX = lx + w * 0.36;
    ctx.fillRect(crossX - cw / 2, ty, cw, h);
  }

  _drawChineseFlag(ctx, x, y, s) {
    const w = s;
    const h = s * 0.67;
    const lx = x - w / 2;
    const ty = y - h / 2;

    // Red background
    ctx.fillStyle = '#DE2910';
    ctx.fillRect(lx, ty, w, h);

    // Yellow stars (simplified)
    ctx.fillStyle = '#FFDE00';
    const starSize = h * 0.22;
    this._drawStar(ctx, lx + w * 0.22, ty + h * 0.3, starSize);

    // Small stars
    const smSize = starSize * 0.35;
    this._drawStar(ctx, lx + w * 0.45, ty + h * 0.15, smSize);
    this._drawStar(ctx, lx + w * 0.55, ty + h * 0.28, smSize);
    this._drawStar(ctx, lx + w * 0.55, ty + h * 0.48, smSize);
    this._drawStar(ctx, lx + w * 0.45, ty + h * 0.62, smSize);
  }

  _drawStar(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}
