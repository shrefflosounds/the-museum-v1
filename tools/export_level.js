// tools/export_level.js - Export complete Three.js level for https://threejs.org/editor/
// Usage: deno run -A tools/export_level.js

import { resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

const repoRoot = resolve(import.meta.dirname, "..");
const desktopPath = "/Users/johnobrien/Desktop/The_Museum_Level.json";

globalThis.window = globalThis;
const makeEl = () => ({
  addEventListener: () => {},
  style: {},
  textContent: "",
  appendChild: () => {},
  removeChild: () => {},
  setAttribute: () => {},
  classList: { add: () => {}, remove: () => {} },
  getContext: () => ({
    fillRect: () => {},
    strokeRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 50 }),
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} })
  })
});

globalThis.document = {
  getElementById: () => makeEl(),
  createElement: () => makeEl(),
  createElementNS: () => makeEl(),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  body: makeEl(),
  readyState: "complete"
};

globalThis.navigator = { userAgent: "Deno" };
globalThis.requestAnimationFrame = () => {};

class AudioParam {
  constructor(v = 0) { this.value = v; }
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

globalThis.AudioContext = class {
  constructor() {
    this.destination = { connect() {} };
    this.currentTime = 0;
    this.sampleRate = 44100;
  }
  createGain() { return { gain: new AudioParam(1), connect() {} }; }
  createBufferSource() { return { connect() {}, start() {}, stop() {}, playbackRate: new AudioParam(1) }; }
  createDynamicsCompressor() { return { threshold: new AudioParam(-4), knee: new AudioParam(12), ratio: new AudioParam(4), attack: new AudioParam(0.003), release: new AudioParam(0.25), connect() {} }; }
  createBiquadFilter() { return { frequency: new AudioParam(1000), Q: new AudioParam(1), connect() {} }; }
  createConvolver() { return { connect() {} }; }
  createBuffer(channels, len) { return { getChannelData: () => new Float32Array(len) }; }
};

globalThis.Image = class { addEventListener() {} set src(_v) {} };
globalThis.location = { search: "" };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.XMLHttpRequest = class { open() {} send() {} overrideMimeType() {} addEventListener() {} };
globalThis.fetch = () => Promise.resolve({ ok: false, arrayBuffer: () => new ArrayBuffer(0) });

// Load Three.js and modules
await import(resolve(repoRoot, "libs/three.min.js"));
await import(resolve(repoRoot, "libs/BufferGeometryUtils.js"));
await import(resolve(repoRoot, "libs/GLTFLoader.js"));
await import(resolve(repoRoot, "libs/GLTFExporter.js"));
await import(resolve(repoRoot, "text_loader.js"));

THREE.WebGLRenderer = class {
  constructor() {
    this.domElement = document.createElement("canvas");
    this.shadowMap = {};
  }
  setSize() {}
  setPixelRatio() {}
  render() {}
  compile() {}
};

THREE.GLTFLoader.prototype.load = function(_url, _onLoad) {};

// Load game code and instantiate level
await import(resolve(repoRoot, "game.js"));

if (globalThis.gameInstance && globalThis.gameInstance.scene) {
  const scene = globalThis.gameInstance.scene;
  console.log(`Scene constructed with ${scene.children.length} root objects.`);
  const json = scene.toJSON();
  const jsonStr = JSON.stringify(json, null, 2);
  await Deno.writeTextFile(desktopPath, jsonStr);
  console.log(`Saved level to ${desktopPath} (${(jsonStr.length / 1024 / 1024).toFixed(2)} MB)`);
  Deno.exit(0);
} else {
  console.error("Failed to initialize gameInstance scene.");
  Deno.exit(1);
}
