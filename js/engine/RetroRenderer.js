// Low-resolution renderer with a PS2-era post pass: the scene is drawn into a
// small render target, then color-quantized with ordered (Bayer) dithering and
// a soft vignette. The canvas is upscaled by CSS with nearest-neighbour
// filtering, which produces the chunky pixel look.

import * as THREE from 'three';

const POST_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const POST_FRAG = /* glsl */ `
  precision mediump float;
  uniform sampler2D tScene;
  uniform float uDither;
  uniform float uLevels;
  uniform float uFade;
  uniform float uDesat;
  varying vec2 vUv;

  float bayer4(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float x = q.x, y = q.y;
    // 4x4 Bayer matrix, normalized to [0,1).
    float v =
      (y == 0.0) ? ((x == 0.0) ? 0.0 : (x == 1.0) ? 8.0 : (x == 2.0) ? 2.0 : 10.0) :
      (y == 1.0) ? ((x == 0.0) ? 12.0 : (x == 1.0) ? 4.0 : (x == 2.0) ? 14.0 : 6.0) :
      (y == 2.0) ? ((x == 0.0) ? 3.0 : (x == 1.0) ? 11.0 : (x == 2.0) ? 1.0 : 9.0) :
                   ((x == 0.0) ? 15.0 : (x == 1.0) ? 7.0 : (x == 2.0) ? 13.0 : 5.0);
    return v / 16.0;
  }

  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;

    // Gentle console-style grade: slightly lifted blacks, cool shadows.
    c = c * 0.96 + vec3(0.008, 0.010, 0.016);
    float luma = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(luma), uDesat);

    // Vignette.
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.85;

    c *= uFade;

    // Ordered dithering + quantization to a limited color depth.
    float d = bayer4(gl_FragCoord.xy) - 0.5;
    c += d * uDither / uLevels;
    c = floor(c * uLevels + 0.5) / uLevels;

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export class RetroRenderer {
  constructor(canvas) {
    // Classic, non color-managed pipeline: colors are used exactly as authored.
    THREE.ColorManagement.enabled = false;

    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;

    this.target = new THREE.WebGLRenderTarget(4, 4, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.uniforms = {
      tScene: { value: this.target.texture },
      uDither: { value: 1.0 },
      uLevels: { value: 31.0 },
      uFade: { value: 1.0 },
      uDesat: { value: 0.0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    this.lines = 360;
    this.width = 4;
    this.height = 4;
    this.cameras = new Set();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setLines(lines) {
    this.lines = lines;
    this.resize();
  }

  setDither(on) {
    this.uniforms.uDither.value = on ? 1.0 : 0.0;
    this.uniforms.uLevels.value = on ? 31.0 : 255.0;
  }

  setFade(v) {
    this.uniforms.uFade.value = v;
  }

  setDesaturate(v) {
    this.uniforms.uDesat.value = v;
  }

  /** Register a camera whose aspect ratio should follow the canvas. */
  trackCamera(camera) {
    this.cameras.add(camera);
    camera.aspect = this.width / this.height;
    camera.updateProjectionMatrix();
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const lowH = Math.max(120, Math.min(this.lines, h));
    const lowW = Math.max(160, Math.round((lowH * w) / h));
    this.width = lowW;
    this.height = lowH;
    this.renderer.setSize(lowW, lowH, false);
    this.target.setSize(lowW, lowH);
    for (const cam of this.cameras) {
      cam.aspect = lowW / lowH;
      cam.updateProjectionMatrix();
    }
  }

  render(scene, camera) {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }
}
