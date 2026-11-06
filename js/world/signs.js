// Wall signs rendered with the pixel font, plus the Foundation emblem panel.

import * as THREE from 'three';
import { VOXEL } from '../config.js';
import { drawPixelText, textWidth, GLYPH_H } from './pixelFont.js';
import { pixelTexture } from './textures.js';

const PX_PER_M = 40;

const SIGN_STYLES = {
  white: { bg: '#d8d8d2', border: '#8a8a86', fg: '#26282c' },
  dark: { bg: '#2a2c30', border: '#55585e', fg: '#d8d8d2' },
  yellow: { bg: '#d4ad2e', border: '#2a2a2a', fg: '#1c1c1c' },
  red: { bg: '#8e1f1a', border: '#3a0c0a', fg: '#f2e6e0' },
  blue: { bg: '#2a4a7a', border: '#16263e', fg: '#e6eef6' },
  orange: { bg: '#c46a26', border: '#4a260c', fg: '#1a1410' },
  green: { bg: '#2e6e48', border: '#143020', fg: '#e6f2ea' },
};

const FACE_ROT = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const FACE_NORMAL = { s: [0, 0, 1], n: [0, 0, -1], e: [1, 0, 0], w: [-1, 0, 0] };

function makeTextCanvas(lines, style, scale, hazard) {
  const pad = 3 * scale;
  const lineH = (GLYPH_H + 3) * scale;
  const w = Math.max(...lines.map((l) => textWidth(l.toUpperCase(), scale))) + pad * 2;
  const h = lines.length * lineH - 3 * scale + pad * 2 + (hazard ? 4 : 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, w);
  canvas.height = Math.max(8, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.border;
  ctx.fillRect(0, 0, canvas.width, 1);
  ctx.fillRect(0, canvas.height - 1, canvas.width, 1);
  ctx.fillRect(0, 0, 1, canvas.height);
  ctx.fillRect(canvas.width - 1, 0, 1, canvas.height);
  let y = pad + (hazard ? 2 : 0);
  if (hazard) {
    for (let x = 0; x < canvas.width; x++) {
      const on = Math.floor(x / 3) % 2 === 0;
      ctx.fillStyle = on ? '#1c1c1c' : style.bg;
      ctx.fillRect(x, 1, 1, 2);
      ctx.fillRect(x, canvas.height - 3, 1, 2);
    }
  }
  for (const line of lines) {
    drawPixelText(ctx, line, canvas.width / 2, y, scale, style.fg, 'center');
    y += lineH;
  }
  return canvas;
}

/** The SCP Foundation emblem + motto, drawn pixel by pixel. */
function makeLogoCanvas() {
  const W = 168;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ecece6';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b8b8b2';
  ctx.fillRect(0, H - 1, W, 1);
  ctx.fillRect(W - 1, 0, 1, H);
  ctx.fillStyle = '#d0d0ca';
  ctx.fillRect(0, 0, W, 1);
  ctx.fillRect(0, 0, 1, H);

  const cx = 33;
  const cy = 32;
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  ctx.fillStyle = '#2c2c30';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 66; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const th = Math.atan2(dy, dx);
      let ink = (d >= 18 && d <= 24) || (d >= 6 && d <= 10);
      for (const a of angles) {
        const along = d * Math.cos(th - a);
        const across = Math.abs(d * Math.sin(th - a));
        if (along > 0) {
          // Cut a gap in the outer ring, then draw an inward-pointing arrow.
          if (along >= 15 && along <= 25 && across <= 5) ink = false;
          if (along >= 15 && along <= 27 && across <= 2) ink = true;
          if (along >= 11 && along <= 16 && across <= (along - 11) * 1.1) ink = true;
        }
      }
      if (ink) ctx.fillRect(x, y, 1, 1);
    }
  }
  drawPixelText(ctx, 'SCP', 66, 9, 4, '#2c2c30', 'left');
  drawPixelText(ctx, 'SECURE.', 68, 41, 1, '#3c3c40', 'left');
  drawPixelText(ctx, 'CONTAIN.', 68 + 46, 41, 1, '#3c3c40', 'left');
  drawPixelText(ctx, 'PROTECT.', 68, 51, 1, '#3c3c40', 'left');
  return canvas;
}

/**
 * Build a sign mesh.
 * def = { x, y, z, face, lines?, style?, scale?, lit?, logo?, hazard? }
 *   x/y/z: sign center in voxel coordinates, on the wall surface
 *   face:  direction the sign faces: 'n' (-z) | 's' (+z) | 'e' (+x) | 'w' (-x)
 */
export function buildSign(def, world) {
  const canvas = def.logo
    ? makeLogoCanvas()
    : makeTextCanvas(def.lines, SIGN_STYLES[def.style || 'white'], def.scale || 1, def.hazard);
  const tex = pixelTexture(canvas);
  const ppm = def.logo ? 42 : PX_PER_M;
  const w = canvas.width / ppm;
  const h = canvas.height / ppm;
  const n = FACE_NORMAL[def.face];
  const px = def.x * VOXEL + n[0] * 0.015;
  const py = def.y * VOXEL;
  const pz = def.z * VOXEL + n[2] * 0.015;

  let color;
  if (def.lit) {
    color = new THREE.Color(1.12, 1.12, 1.1);
  } else {
    const l = world.sampleLight(px + n[0] * 0.3, py, pz + n[2] * 0.3, [0, 0, 0]);
    const k = 1.15;
    color = new THREE.Color(
      Math.min(1.2, Math.max(0.32, l[0] * k)),
      Math.min(1.2, Math.max(0.32, l[1] * k)),
      Math.min(1.2, Math.max(0.32, l[2] * k)),
    );
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, color, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  mesh.position.set(px, py, pz);
  mesh.rotation.y = FACE_ROT[def.face];

  if (def.logo) {
    // Backing plate gives the lightbox some depth.
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x55585e }),
    );
    plate.position.set(px - n[0] * 0.03, py, pz - n[2] * 0.03);
    plate.rotation.y = FACE_ROT[def.face];
    mesh.position.set(px + n[0] * 0.03, py, pz + n[2] * 0.03);
    const g = new THREE.Group();
    g.add(plate, mesh);
    return g;
  }
  return mesh;
}
