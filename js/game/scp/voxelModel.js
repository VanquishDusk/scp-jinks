// Build a merged, vertex-colored box model (MagicaVoxel-style) from a list of
// [x0, y0, z0, x1, y1, z1, color] boxes. Faces get fixed directional shading.

import * as THREE from 'three';

const SHADE = [0.82, 0.82, 1.0, 0.6, 0.92, 0.92];

export function boxGeometry(boxes, unit = 1 / 16) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (const b of boxes) {
    const [x0, y0, z0, x1, y1, z1] = b.slice(0, 6).map((v) => v * unit);
    c.setHex(b[6]);
    const faces = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    faces.forEach((f, fi) => {
      const base = pos.length / 3;
      const k = b[7] ? 1 : SHADE[fi];
      for (const v of f) {
        pos.push(v[0], v[1], v[2]);
        col.push(c.r * k, c.g * k, c.b * k);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}
