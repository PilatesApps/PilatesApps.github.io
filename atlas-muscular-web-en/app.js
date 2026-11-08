/* Atlas Muscular · Digital Coloring Book · Edición Digital 2026 */
(() => {
'use strict';
const W = 1224, H = 1584, PT = 2; // píxeles de página y escala desde puntos PDF
const $ = s => document.querySelector(s);
const viewport = $('#viewport'), stage = $('#stage'), pageImg = $('#pageImg');
const cColor = $('#cColor'), cLive = $('#cLive'), cInk = $('#cInk'), cWipe = $('#cWipe'), cTop = $('#cTop');
for (const c of [cColor, cLive, cInk, cWipe, cTop]) { c.width = W; c.height = H; }
const xWipe = cWipe.getContext('2d'), xTop = cTop.getContext('2d');
// borrador mágico: máscara de lo borrado del dibujo (rayas negras incluidas)
const mWipe = document.createElement('canvas'); mWipe.width = W; mWipe.height = H; const xMask = mWipe.getContext('2d', { willReadFrequently: true });
let paper = null, wipeUsed = false;
const xColor = cColor.getContext('2d', { willReadFrequently: true });
const xLive = cLive.getContext('2d', { willReadFrequently: true });
const xInk = cInk.getContext('2d', { willReadFrequently: true });

let META = [], N = 0, cur = 1, page = null;
let labels = null;            // Uint16Array W*H
let lockCanvas = null;        // zonas que no se pintan
let texts = {};               // textos escritos con teclado: idx -> string
const undo = [], redo = [];

/* ---------------- colores y lápices ---------------- */
const COLORS = [
  ['Blue', '#2F62D6'], ['Teal', '#16B3A8'], ['Green', '#1E9E4A'], ['Yellow', '#F2C230'],
  ['Orange', '#E8732A'], ['Terracotta', '#B5533A'], ['Red', '#D7322F'], ['Pink', '#E5578E'], ['Purple', '#8E3FD1'],
  ['Skin', '#E8B596'], ['Blush white', '#F4E4DE'], ['Bone', '#EADFC4'], ['Gray', '#9AA3AD'],
  ['White', '#FFFFFF'], ['Black', '#1C1C1C']
];
const BRUSHES = [
  { id: 'marcador', name: 'Marker', size: 18, opa: 70, hard: 85 },
  { id: 'lapiz', name: 'Pencil', size: 6, opa: 90, hard: 60 },
  { id: 'creyon', name: 'Crayon', size: 16, opa: 90, hard: 50 },
  { id: 'tiza', name: 'Chalk', size: 22, opa: 70, hard: 40 },
  { id: 'carboncillo', name: 'Charcoal', size: 18, opa: 85, hard: 30 },
  { id: 'acuarela', name: 'Watercolor', size: 34, opa: 80, hard: 10 },
  { id: 'oleo', name: 'Oil paint', size: 30, opa: 100, hard: 90 },
  { id: 'aero', name: 'Airbrush', size: 50, opa: 25, hard: 0 },
  { id: 'chispeado', name: 'Splatter', size: 44, opa: 100, hard: 60 },
  { id: 'balde', name: 'Bucket', size: 0, opa: 90, hard: 100 },
  { id: 'textura', name: 'Texture', size: 40, opa: 100, hard: 100 },
  { id: 'borrador', name: 'Eraser', size: 26, opa: 100, hard: 80 },
  { id: 'magia', name: 'Magic eraser', size: 26, opa: 100, hard: 80 },
  { id: 'pluma', name: 'Write', size: 3, opa: 100, hard: 100 },
  { id: 'resaltador', name: 'Highlighter', size: 24, opa: 45, hard: 100 },
  { id: 'boligrafo', name: 'Pen', size: 2.4, opa: 100, hard: 100 },
  { id: 'teclado', name: 'Keyboard', size: 0, opa: 100, hard: 100 },
  { id: 'gotero', name: 'Eyedropper', size: 0, opa: 100, hard: 100 },
];
const store = {
  get(k, d) { try { const v = localStorage.getItem('amen:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('amen:' + k, JSON.stringify(v)); } catch (e) {} }
};
let brush = store.get('brush', 'marcador'); if (brush === 'gotero') brush = 'marcador';
let prevBrush = null;
let lastPaint = store.get('lastPaint', 'marcador');   // para volver a pintar después de borrar   // para volver del cuentagotas
let color = store.get('color', COLORS[0][1]);
let recent = store.get('recent', []);
let settings = store.get('settings', {});   // por lápiz: {size,opa,hard}
let tape = store.get('tape', true);
const B = id => BRUSHES.find(b => b.id === id);
const HL = [['Yellow', '#FFF200'], ['Teal', '#3FE6FF'], ['Pink', '#FF58C8'], ['Green', '#6BFF4A']];
const PEN = [['Blue', '#1F3B9E'], ['Black', '#1C1C1C'], ['Red', '#C62828']];
const FREE = ['resaltador', 'boligrafo'];
const TEXT_BRUSHES = ['resaltador', 'boligrafo', 'borrador'];
const TEXT_OFF = ['balde', 'textura', 'teclado', 'pluma'];   // en cuentos y textos se pinta libre: todo menos el balde y lo de escribir en cuadritos
const ERASERS = ['borrador', 'magia'];
let hlColor = store.get('hl', HL[0][1]), penColor = store.get('pen', PEN[0][1]);
const isText = () => page && !page.plate;
const S = () => Object.assign({ size: B(brush).size, opa: B(brush).opa, hard: B(brush).hard }, settings[brush] || {});



/* ---------------- instalar como app ---------------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });
window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; $('#instBox').hidden = true; toast('App installed: you can now use it offline'); });
function standalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function env() {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|TikTok|Telegram/i.test(ua)) return 'inapp';
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
function showInstall() { if (!standalone()) $('#btnInstall').hidden = false; }
function setupInstall() {
  if (standalone()) return;
  const e = env();
  if (e !== 'desktop' || installEvt) showInstall();
  $('#btnInstall').onclick = async () => {
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; installEvt = null; if (r.outcome === 'accepted') $('#btnInstall').hidden = true; return; }
    const ipad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const T = {
      inapp: '<p>This link opened inside another app (WhatsApp, Instagram...) where it cannot be installed.</p><ol><li>Tap the <b>three dots</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> at the top.</li><li>Choose <b>Open in Chrome</b> (or <b>Open in Safari</b> on iPhone).</li><li>There, tap the yellow <b>Install</b> button.</li></ol>',
      ios: ipad
        ? '<p>On iPad, in <b>Safari</b>:</p><ol><li>At the top right, next to the address, tap <b>Share</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span> (the square with the up arrow).</li><li>Scroll down the list and tap <b>Add to Home Screen</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>.</li><li>At the top right, tap <b>Add</b>.</li></ol>'
        : '<p>On iPhone, in <b>Safari</b>:</p><ol><li>Go to the <b>bottom of the screen</b>, to the Safari bar, and tap the <b>three dots</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> on the right.<br><small>If your iPhone shows the <b>Share</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span> button at the bottom center, tap it directly and go to step 3.</small></li><li>Tap <b>Share</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span>.</li><li>Scroll down the list and tap <b>Add to Home Screen</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>.</li><li>At the top right, tap <b>Add</b>. The Atlas icon appears on your screen.</li></ol>',
      'ios-other': '<p>On iPhone or iPad, <b>Safari</b> is easiest:</p><ol><li>Copy the link and open it in <b>Safari</b>.</li><li>At the bottom, tap the <b>three dots</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> and then <b>Share</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span>.</li><li>Tap <b>Add to Home Screen</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span> and then <b>Add</b>.</li></ol>',
      samsung: '<ol><li>Tap the menu (the <b>three lines</b> at the bottom right).</li><li>Tap <b>Add page to</b> and then <b>Home screen</b>.</li></ol><p>Or open the link in Chrome and use the yellow <b>Install</b> button.</p>',
      android: '<ol><li>In Chrome, tap the <b>three dots</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> at the top right.</li><li>Choose <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm with <b>Install</b>.</li></ol>',
      desktop: '<ol><li>In Chrome or Edge, tap the install icon in the address bar.</li><li>Or open the menu and choose <b>Install Muscle Atlas</b>.</li></ol>'
    };
    $('#instText').innerHTML = T[e] + '<p>Once installed, it works <b>offline</b>.</p>';
    $('#instBox').hidden = false;
  };
  $('#instClose').onclick = () => { $('#instBox').hidden = true; };
  if (e === 'inapp' && !store.get('inappSeen', false)) { store.set('inappSeen', true); $('#btnInstall').click(); }
}
/* ---------------- sonido y vibración ---------------- */
let sound = store.get('sound', true);
const SFX = (() => {
  // sonidos suaves: ruido rosa y marrón filtrado, nada de chasquidos; volumen general bajo
  let ac = null, bufs = {}, live = null, master = null;
  const ctx = () => {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A();
      const comp = ac.createDynamicsCompressor(); comp.threshold.value = -28; comp.ratio.value = 6; comp.attack.value = 0.01; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = 0.55; master.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume(); return ac;
  };
  function buf(kind) {
    if (bufs[kind]) return bufs[kind];
    const a = ctx(), n = a.sampleRate * 3, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, br = 0, env = 0.5, tgt = 0.5;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
      const pink = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      br = (br + 0.02 * w) / 1.02;
      if (i % 600 === 0) tgt = 0.35 + Math.random() * 0.65;      // textura lenta, sin golpes
      env += (tgt - env) * 0.002;
      d[i] = kind === 'brown' ? br * 3.2 : kind === 'paper' ? pink * env : pink;
    }
    // bordes del bucle sin clic
    const f = 2000; for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[n - 1 - i] *= k; }
    return (bufs[kind] = b);
  }
  const P = {
    lapiz:      { b: 'paper', t: 'bandpass', f: 4200, q: 0.8, g: 0.10 },
    creyon:     { b: 'paper', t: 'bandpass', f: 1900, q: 0.7, g: 0.13 },
    tiza:       { b: 'paper', t: 'bandpass', f: 2600, q: 0.6, g: 0.12 },
    carboncillo:{ b: 'paper', t: 'bandpass', f: 1500, q: 0.6, g: 0.12 },
    marcador:   { b: 'pink',  t: 'bandpass', f: 1300, q: 1.0, g: 0.08 },
    resaltador: { b: 'pink',  t: 'bandpass', f: 1500, q: 1.0, g: 0.08 },
    acuarela:   { b: 'brown', t: 'lowpass',  f: 700,  q: 0.4, g: 0.16 },
    oleo:       { b: 'brown', t: 'lowpass',  f: 520,  q: 0.6, g: 0.18 },
    aero:       { b: 'pink',  t: 'highpass', f: 3500, q: 0.4, g: 0.05, steady: true },
    borrador:   { b: 'paper', t: 'bandpass', f: 700,  q: 0.6, g: 0.12 },
    magia:      { b: 'paper', t: 'bandpass', f: 900,  q: 0.6, g: 0.12 },
    pluma:      { b: 'paper', t: 'highpass', f: 3200, q: 0.6, g: 0.06 },
    boligrafo:  { b: 'paper', t: 'highpass', f: 3200, q: 0.6, g: 0.06 },
  };
  return {
    start(id) {
      if (!sound) return; const p = P[id]; const a = ctx(); if (!p || !a) return;
      this.stop();
      const src = a.createBufferSource(); src.buffer = buf(p.b); src.loop = true;
      src.playbackRate.value = 0.95 + Math.random() * 0.1;
      const f = a.createBiquadFilter(); f.type = p.t; f.frequency.value = p.f; f.Q.value = p.q;
      const g = a.createGain(); g.gain.value = 0;
      if (p.steady) g.gain.setTargetAtTime(p.g, a.currentTime, 0.08);
      src.connect(f).connect(g).connect(master); src.start(0, Math.random() * 2);
      live = { src, f, g, p, t: performance.now(), d: 0, v: 0 };
    },
    move(dist) {
      if (!live) return; const now = performance.now(), dt = Math.max(8, now - live.t);
      live.t = now; const v = Math.min(1, dist / dt / 1.8);
      live.v += (v - live.v) * 0.25;                       // la velocidad se suaviza: no hay saltos de volumen
      const p = live.p, a = ac;
      if (!p.steady) live.g.gain.setTargetAtTime(p.g * Math.min(1, live.v * 1.2), a.currentTime, 0.06);
      live.f.frequency.setTargetAtTime(p.f * (0.9 + 0.2 * live.v), a.currentTime, 0.08);
    },
    stop() {
      if (!live) return; const l = live; live = null;
      try { l.g.gain.setTargetAtTime(0, ac.currentTime, 0.07); l.src.stop(ac.currentTime + 0.5); } catch (e) {}
    },
    blip(kind) {
      if (!sound) return; const a = ctx(); if (!a) return; const t = a.currentTime;
      if (kind === 'page') {                               /* hoja que pasa, suave */
        const s = a.createBufferSource(); s.buffer = buf('pink');
        const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.6;
        f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.28);
        const g = a.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
        s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.4); return;
      }
      if (kind === 'fill') {                               /* gota de pintura que cae */
        const o = a.createOscillator(), g = a.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(760, t + 0.09);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.10, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        o.connect(g).connect(master); o.start(t); o.stop(t + 0.2); return;
      }
      const o = a.createOscillator(), g = a.createGain(); o.type = 'sine';
      o.frequency.value = kind === 'undo' ? 520 : 760;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.12);
    }
  };
})();
function buzz(ms) { if (sound && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
/* texturas de papel para lápiz, creyón y tiza */
function noiseCanvas(sz, scale, density, streak) {
  const c = document.createElement('canvas'); c.width = c.height = sz;
  const x = c.getContext('2d'); const id = x.createImageData(sz, sz);
  // ruido de valor suavizado
  const g = sz / scale | 0, grid = [];
  for (let i = 0; i < (g + 1) * (g + 1); i++) grid.push(Math.random());
  const at = (i, j) => grid[(j % g) * (g + 1) + (i % g)];
  for (let y = 0; y < sz; y++) for (let x2 = 0; x2 < sz; x2++) {
    const fx = x2 / scale, fy = y / (streak ? scale * 0.25 : scale);
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    const v = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
    const r = Math.random() * 0.35 + v * 0.65;
    const a = r < density ? 255 : Math.max(0, 255 - (r - density) * 255 * 6);
    id.data[(y * sz + x2) * 4 + 3] = a;
  }
  x.putImageData(id, 0, 0); return c;
}
// textura de papel con transparencias suaves (no blanco y negro): para tiza y acuarela
function toothCanvas(sz, scale, lo, hi, streak) {
  const c = noiseCanvas(sz, scale, 0, streak), x = c.getContext('2d'), id = x.getImageData(0, 0, sz, sz), d = id.data;
  // rehacer el alfa como gradiente continuo
  const g = sz / scale | 0, grid = []; for (let i = 0; i < (g + 1) * (g + 1); i++) grid.push(Math.random());
  const at = (i, j) => grid[(j % g) * (g + 1) + (i % g)];
  for (let y = 0; y < sz; y++) for (let x2 = 0; x2 < sz; x2++) {
    const fx = x2 / scale, fy = y / (streak ? scale * 0.3 : scale), i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j;
    const v = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
    const r = v * 0.7 + Math.random() * 0.3; const k = Math.max(0, Math.min(1, (r - lo) / (hi - lo)));
    d[(y * sz + x2) * 4 + 3] = 255 * (1 - k);
  }
  x.putImageData(id, 0, 0); return c;
}
const GRAIN = {
  lapiz: noiseCanvas(128, 2, 0.55, false),
  creyon: noiseCanvas(256, 5, 0.62, true),
  tiza: toothCanvas(256, 2.2, 0.3, 0.75, false),
  carboncillo: toothCanvas(256, 3, 0.25, 0.85, true),
  papel: toothCanvas(256, 3, 0.2, 0.9, false),
};

/* ---------------- interfaz ---------------- */
function preview(id) {
  const c = document.createElement('canvas'); c.width = 88; c.height = 44;
  const x = c.getContext('2d'); x.lineCap = 'round'; x.strokeStyle = '#3F4A57'; x.fillStyle = '#3F4A57';
  const wave = (w) => { x.lineWidth = w; x.beginPath(); x.moveTo(10, 30); x.bezierCurveTo(30, 6, 55, 40, 78, 14); x.stroke(); };
  if (id === 'marcador') { x.globalAlpha = .6; wave(10); }
  else if (id === 'lapiz') wave(2.5);
  else if (id === 'creyon') { wave(9); x.globalCompositeOperation = 'destination-in'; x.drawImage(GRAIN.creyon, 0, 0); }
  else if (id === 'tiza') { x.globalAlpha = .8; wave(12); x.globalCompositeOperation = 'destination-in'; x.drawImage(GRAIN.tiza, 0, 0); x.drawImage(GRAIN.tiza, 40, 7); }
  else if (id === 'carboncillo') { wave(9); x.globalCompositeOperation = 'destination-in'; x.drawImage(GRAIN.carboncillo, 0, 0); }
  else if (id === 'acuarela') { x.globalAlpha = .35; wave(15); x.globalAlpha = .7; x.lineWidth = 1.5; x.beginPath(); x.moveTo(10, 23); x.bezierCurveTo(30, -1, 55, 33, 78, 7); x.stroke(); x.beginPath(); x.moveTo(10, 37); x.bezierCurveTo(30, 13, 55, 47, 78, 21); x.stroke(); x.globalAlpha = .5; for (const [a, b, r] of [[22, 40, 2.5], [64, 36, 2], [80, 26, 1.6]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); } }
  else if (id === 'oleo') { wave(11); x.strokeStyle = '#fff'; x.globalAlpha = .55; x.lineWidth = 1.4; x.beginPath(); x.moveTo(10, 27); x.bezierCurveTo(30, 3, 55, 37, 78, 11); x.stroke(); x.strokeStyle = '#1d232b'; x.globalAlpha = .6; x.beginPath(); x.moveTo(12, 34); x.bezierCurveTo(32, 10, 56, 44, 78, 18); x.stroke(); }
  else if (id === 'chispeado') { const R = seeded(7); x.fillStyle = '#3F4A57'; for (let i = 0; i < 26; i++) { const a = 14 + R() * 60, b = 8 + R() * 28, q = R() < .15 ? 3.2 + R() * 2.5 : .6 + R() * 1.6; x.beginPath(); x.arc(a, b, q, 0, 7); x.fill(); } x.beginPath(); x.moveTo(52, 20); x.lineTo(52.6, 34); x.arc(53.3, 34, 1.2, Math.PI, 0, true); x.lineTo(54.2, 20); x.fill(); }
  else if (id === 'aero') { const g = x.createRadialGradient(44, 22, 2, 44, 22, 18); g.addColorStop(0, 'rgba(63,74,87,.55)'); g.addColorStop(1, 'rgba(63,74,87,0)'); x.fillStyle = g; x.fillRect(0, 0, 88, 44); for (let i = 0; i < 70; i++) { const a = Math.random() * 7, d = Math.abs((Math.random() + Math.random() - 1)) * 20; x.globalAlpha = .6; x.fillRect(44 + Math.cos(a) * d, 22 + Math.sin(a) * d, 1, 1); } }
  else if (id === 'balde') { x.font = '28px sans-serif'; x.textAlign = 'center'; x.fillText('🪣', 44, 33); }
  else if (id === 'textura') { const q = [['rayas', '#2F62D6', 20, 6], ['puntos', '#F2C230', 44, 6], ['flores', '#1E9E4A', 20, 22], ['cuadros', '#E8732A', 44, 22]]; for (const [tid, tc, qx, qy] of q) { x.fillStyle = x.createPattern(texTile(tid, tc, .2), 'repeat'); x.fillRect(qx, qy, 24, 16); } x.strokeStyle = '#3F4A57'; x.lineWidth = 1.5; x.strokeRect(20.5, 6.5, 47, 31); }
  else if (id === 'borrador') { x.fillRect(26, 12, 36, 20); x.clearRect(29, 15, 14, 14); }
  else if (id === 'magia') { x.fillRect(22, 14, 34, 18); x.clearRect(25, 17, 12, 12); x.fillStyle = '#C9A227'; const st = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * .38 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } x.closePath(); x.fill(); }; st(66, 13, 9); st(76, 30, 5); st(60, 34, 3.5); }
  else if (id === 'resaltador') { x.save(); x.translate(44, 22); x.rotate(-0.5); x.fillStyle = '#FFF200'; x.fillRect(-26, -5, 30, 10); x.fillStyle = '#3F4A57'; x.fillRect(4, -6, 22, 12); x.beginPath(); x.moveTo(-26, -5); x.lineTo(-34, -1); x.lineTo(-34, 3); x.lineTo(-26, 5); x.closePath(); x.fillStyle = '#E6D800'; x.fill(); x.restore(); }
  else if (id === 'boligrafo') { x.save(); x.translate(44, 22); x.rotate(-0.6); x.fillStyle = '#1F3B9E'; x.fillRect(-20, -3, 36, 6); x.fillStyle = '#9AA3AD'; x.beginPath(); x.moveTo(-20, -3); x.lineTo(-30, 0); x.lineTo(-20, 3); x.closePath(); x.fill(); x.fillStyle = '#1F3B9E'; x.fillRect(12, -5, 4, 3); x.restore(); }
  else if (id === 'pluma') { x.font = 'italic 24px Caveat, cursive'; x.textAlign = 'center'; x.fillText('Abc', 44, 32); }
  else if (id === 'teclado') { x.strokeRect(14, 10, 60, 24); for (let i = 0; i < 5; i++) x.fillRect(20 + i * 10, 16, 6, 5); x.fillRect(30, 25, 28, 4); }
  else if (id === 'gotero') { x.lineWidth = 3; x.beginPath(); x.moveTo(30, 36); x.lineTo(56, 10); x.stroke(); x.beginPath(); x.arc(58, 9, 6, 0, 7); x.fill(); }
  return c;
}
function updateDock() {
  const ic = document.getElementById('dkToolIcon'); if (!ic) return;
  const x = ic.getContext('2d'); x.clearRect(0, 0, 88, 44); x.drawImage(preview(brush), 0, 0);
  const b = BRUSHES.find(b => b.id === brush); document.getElementById('dkToolName').textContent = b ? b.name : '';
  const c = brush === 'resaltador' ? hlColor : brush === 'boligrafo' ? penColor : color;
  const sw = document.getElementById('dkSwatch'), er = ERASERS.includes(brush);
  sw.classList.toggle('erase', er); sw.style.background = er ? '' : c;
  sw.innerHTML = er ? '<svg viewBox="0 0 24 24"><path d="M7 21h10M5.5 15.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 19H8z"/><path d="m9.5 11.5 5 5"/></svg>' : '';
  const lb = document.getElementById('dkColorName'); if (lb) lb.textContent = er ? 'Erasing' : 'Color';
}
function openSheet(sec) {
  const b = document.body;
  if (b.classList.contains('sheet') && b.dataset.sheet === sec) { closeSheet(); return; }
  b.dataset.sheet = sec; b.classList.add('sheet');
  document.querySelectorAll('.dk').forEach(d => d.classList.toggle('on', d.id === 'dk' + sec[0].toUpperCase() + sec.slice(1)));
  $('#tools').scrollTop = 0;
}
function closeSheet() { document.body.classList.remove('sheet'); document.querySelectorAll('.dk').forEach(d => d.classList.remove('on')); }
function buildBrushes() {
  const row = $('#brushRow'); row.innerHTML = '';
  const GROUPS = [['Paint', ['marcador', 'lapiz', 'creyon', 'tiza', 'carboncillo', 'acuarela', 'oleo', 'aero', 'chispeado', 'balde', 'textura']],
                  ['Write and mark', ['pluma', 'teclado', 'boligrafo', 'resaltador']],
                  ['Erase', ['borrador', 'magia']]];
  for (const [gname, ids] of GROUPS) {
    const list = ids.map(B).filter(b => !(isText() && TEXT_OFF.includes(b.id)) && !(page && page.nobucket && (b.id === 'balde' || b.id === 'textura')));
    if (!list.length) continue;
    { const h = document.createElement('div'); h.className = 'glabel'; h.textContent = gname; row.appendChild(h); }
    for (const b of list) {
      const bt = document.createElement('button'); bt.setAttribute('aria-pressed', b.id === brush);
      bt.appendChild(preview(b.id)); const s = document.createElement('span'); s.textContent = b.name; bt.appendChild(s);
      bt.onclick = () => { if (!ERASERS.includes(b.id) && !['gotero', 'teclado', 'pluma', 'resaltador', 'boligrafo'].includes(b.id)) { lastPaint = b.id; store.set('lastPaint', b.id); } brush = b.id; store.set(isText() ? 'tbrush' : 'brush', brush); buildBrushes(); buildColors(); syncSliders(); updateDock(); };
      row.appendChild(bt);
    }
  }
}
function buildColors() {
  const row = $('#colorRow'); row.innerHTML = '';
  if (brush === 'resaltador' || brush === 'boligrafo') {
    const hl = brush === 'resaltador', list = hl ? HL : PEN, curC = hl ? hlColor : penColor;
    for (const [n, c] of list) {
      const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = n;
      b.setAttribute('aria-label', n); b.setAttribute('aria-pressed', c === curC); b.innerHTML = `<span>${n}</span>`;
      b.onclick = () => { if (hl) { hlColor = c; store.set('hl', c); } else { penColor = c; store.set('pen', c); } buildColors(); };
      row.appendChild(b);
    }
    const lab = document.createElement('span'); lab.className = 'plabel'; lab.textContent = hl ? 'Fluorescent highlighter' : 'Pen'; row.appendChild(lab);
    return;
  }
  if (ERASERS.includes(brush)) { const nt = document.createElement('div'); nt.className = 'glabel erasing'; nt.textContent = 'Erasing: tap a color to paint again'; row.appendChild(nt); }
  for (const [n, c] of COLORS) {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = n;
    b.setAttribute('aria-label', n); b.setAttribute('aria-pressed', c.toLowerCase() === color.toLowerCase()); b.innerHTML = `<span>${n}</span>`;
    b.onclick = () => setColor(c); row.appendChild(b);
  }
  const extra = recent.filter(c => !COLORS.some(k => k[1].toLowerCase() === c.toLowerCase()));
  const gl = document.createElement('div'); gl.className = 'glabel'; gl.textContent = extra.length ? 'Other and recent colors' : 'Other color'; row.appendChild(gl);
  const wh = document.createElement('button'); wh.className = 'tool wheel'; wh.title = 'Other color'; wh.setAttribute('aria-label', 'Choose another color');
  wh.onclick = () => { const p = $('#colorPick'); p.value = color; p.click(); }; row.appendChild(wh);
  const gt = document.createElement('button'); gt.className = 'tool drop'; gt.title = 'Eyedropper: pick a color from the plate'; gt.setAttribute('aria-label', 'Eyedropper');
  gt.setAttribute('aria-pressed', brush === 'gotero');
  gt.innerHTML = '<svg viewBox="0 0 24 24"><path d="m14 4 6 6M12 6l6 6-9 9H3v-6z"/></svg><span>Eyedropper</span>';
  gt.onclick = () => { if (brush !== 'gotero') prevBrush = brush; brush = 'gotero'; updateDock(); closeSheet(); toast('Tap a color already painted on the plate'); };
  row.appendChild(gt);
  for (const c of extra) {
    const b = document.createElement('button'); b.className = 'sw recent'; b.style.background = c; b.title = 'Recently used';
    b.setAttribute('aria-pressed', c.toLowerCase() === color.toLowerCase()); b.onclick = () => setColor(c); row.appendChild(b);
  }
}
$('#colorPick').addEventListener('input', e => setColor(e.target.value));
document.addEventListener('click', e => { if (e.target.closest('#colorRow .sw')) { updateDock(); if (window.innerWidth < 900) setTimeout(closeSheet, 150); } });
$('#dkTool').onclick = () => openSheet('tool');
$('#dkColor').onclick = () => openSheet('color');
$('#dkMore').onclick = () => openSheet('more');
$('#dkUndo').onclick = () => $('#btnUndo').click();
// bloquear la lámina: lo pintado queda protegido
let locks = store.get('locks', {});
const isLocked = () => !!locks[cur];
function syncLock() {
  const on = isLocked();
  $('#btnLock').classList.toggle('on', on); $('#btnLock').setAttribute('aria-checked', on);
  $('#dkLock').classList.toggle('active', on); 
  $('#lockArc').setAttribute('d', on ? 'M8 11V7a4 4 0 0 1 8 0v4' : 'M8 11V7a4 4 0 0 1 7.5-2');
  document.body.classList.toggle('locked', on);
}
function toggleLock() { locks[cur] = !isLocked(); if (!locks[cur]) delete locks[cur]; store.set('locks', locks); syncLock(); buzz(12); toast(isLocked() ? 'Plate locked: your drawing is protected' : 'Plate unlocked: you can keep painting'); if (isLocked()) { const had = DONE[cur]; checkDone(true); if (!DONE[cur] && !had && page.plate) setTimeout(() => toast('When the plate is complete, with its table filled in, you will earn your star'), 2200); } }
$('#btnLock').onclick = toggleLock; $('#dkLock').onclick = () => { closeSheet(); toggleLock(); };
$('#dkTape').onclick = () => { closeSheet(); tapeBtn.click(); };
$('#btnCloseTools').onclick = closeSheet;
function setColor(c) {
  if (FREE.includes(brush)) { brush = 'marcador'; store.set('brush', brush); buildBrushes(); syncSliders(); }
  color = c; store.set("color", c); setTimeout(updateDock, 0); if (brush === 'textura') setTimeout(buildTex, 0);
  recent = [c, ...recent.filter(r => r.toLowerCase() !== c.toLowerCase())].slice(0, 6); store.set('recent', recent);
  if (['borrador', 'magia', 'gotero', 'pluma', 'teclado'].includes(brush)) { brush = (lastPaint && !(isText() && TEXT_OFF.includes(lastPaint))) ? lastPaint : 'marcador'; store.set(isText() ? 'tbrush' : 'brush', brush); buildBrushes(); syncSliders(); }
  buildColors();
}
function syncSliders() {
  const s = S(), tx = brush === 'textura';
  $('#sSize').previousElementSibling.textContent = tx ? 'Pattern size' : 'Size'; $('#sHard').parentElement.hidden = tx;
  const tr = $('#texRow'); if (tr) { tr.hidden = !tx; if (tx) buildTex(); }
  $('#sSize').value = s.size; $('#oSize').textContent = s.size;
  $('#sOpa').value = s.opa; $('#oOpa').textContent = s.opa + '%';
  $('#sHard').value = s.hard; $('#oHard').textContent = s.hard + '%';
}
for (const [id, key, out, suf] of [['#sSize', 'size', '#oSize', ''], ['#sOpa', 'opa', '#oOpa', '%'], ['#sHard', 'hard', '#oHard', '%']]) {
  $(id).addEventListener('input', e => {
    settings[brush] = Object.assign({}, settings[brush], { [key]: +e.target.value }); store.set('settings', settings);
    $(out).textContent = e.target.value + suf;
  });
  if (key === 'size') $(id).addEventListener('change', () => { if (brush === 'textura') buildTex(); });
}
const sndBtn = $('#btnSound');
function syncSound() { sndBtn.classList.toggle('on', sound); sndBtn.setAttribute('aria-checked', sound); }
sndBtn.onclick = () => { sound = !sound; store.set('sound', sound); syncSound(); if (sound) { SFX.blip('tick'); buzz(10); } };
syncSound();
const tapeBtn = $('#btnTape');
function syncTape() { tapeBtn.classList.toggle('on', tape); tapeBtn.setAttribute('aria-checked', tape); $('#dkTape').classList.toggle('active', tape); $('#dkTape').setAttribute('aria-pressed', tape); }
tapeBtn.onclick = () => { tape = !tape; store.set('tape', tape); syncTape(); toast(tape ? 'Stay inside: the color stays inside the part you started painting' : 'Free: the color can go past the line'); };

let toastT = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200); }

/* ---------------- vista: zoom y desplazamiento ---------------- */
let view = { s: 1, x: 0, y: 0, base: 1 };
function measureTools() {}
// rueda del ratón mueve las barras de lado
document.querySelectorAll('.row').forEach(r => r.addEventListener('wheel', e => {
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && r.scrollWidth > r.clientWidth) { r.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false }));
// arrastrar con el ratón también desliza
document.querySelectorAll('.row').forEach(r => {
  let d = null;
  r.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') d = { x: e.clientX, s: r.scrollLeft, moved: false }; });
  window.addEventListener('pointermove', e => { if (d) { const dx = e.clientX - d.x; if (Math.abs(dx) > 4) d.moved = true; r.scrollLeft = d.s - dx; } });
  window.addEventListener('pointerup', () => { if (d && d.moved) { r.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true }); } d = null; });
});
new ResizeObserver(() => fit()).observe(viewport);
// arrastrar el panel de herramientas con el ratón (vertical u horizontal)
(() => {
  const t = document.getElementById('tools'); let d = null;
  t.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.target.closest('input')) return; d = { x: e.clientX, y: e.clientY, st: t.scrollTop, moved: false }; });
  window.addEventListener('pointermove', e => { if (!d) return; const dy = e.clientY - d.y; if (Math.abs(dy) > 4) d.moved = true; if (t.scrollHeight > t.clientHeight) t.scrollTop = d.st - dy; });
  window.addEventListener('pointerup', () => { if (d && d.moved) t.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true }); d = null; });
})();
function fit() {
  measureTools();
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const base = Math.min(vw / W, vh / H) * 0.98;
  stage.style.width = W * base + 'px'; stage.style.height = H * base + 'px';
  view.base = base; clampView(); apply();
}
function clampView() {
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  const w = W * view.base * view.s, h = H * view.base * view.s;
  view.x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, view.x));
  view.y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, view.y));
}
function apply() { stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`; document.body.classList.toggle('zoomed', view.s > 1.01); }
window.addEventListener('resize', fit);

function toPage(e) {
  const r = stage.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}

/* ---------------- páginas ---------------- */
let MAP = {};
async function loadMeta() {
  META = await (await fetch('pages.json')).json(); N = META.length;
  try { MAP = await (await fetch('map.json')).json(); } catch (e) { MAP = {}; }
}
function pageFile(n, suf) { return `pages/p${String(n).padStart(2, '0')}${suf}`; }
function loadImg(src) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; }); }

/* pasar la hoja: la página vieja se levanta y gira como una hoja de papel */
function pageFlip(fwd) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !Element.prototype.animate) return;
    const vr = viewport.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (sr.width < 20) return;
    const k = Math.min(1, 900 / sr.width) * Math.min(2, devicePixelRatio || 1), cw = Math.round(sr.width * k), ch = Math.round(sr.height * k);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
    for (const el of [pageImg, cWipe, cColor, $('#topImg'), cTop, cInk]) { try { if (el && !el.hidden && (el.tagName !== 'IMG' || el.complete && el.naturalWidth)) x.drawImage(el, 0, 0, cw, ch); } catch (e) {} }
    document.querySelectorAll('.flip').forEach(f => f.remove());
    const f = document.createElement('div'); f.className = 'flip';
    Object.assign(f.style, { left: (sr.left - vr.left) + 'px', top: (sr.top - vr.top) + 'px', width: sr.width + 'px', height: sr.height + 'px' });
    f.innerHTML = '<div class="under"></div><div class="leaf"><div class="face front"></div><div class="face back"></div></div>';
    const leaf = f.querySelector('.leaf'), front = f.querySelector('.front'), under = f.querySelector('.under');
    front.appendChild(c); const sh = document.createElement('div'); sh.className = 'shade'; front.appendChild(sh);
    sh.style.background = fwd ? 'linear-gradient(90deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.35))' : 'linear-gradient(270deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.35))';
    leaf.style.transformOrigin = fwd ? 'left center' : 'right center';
    viewport.appendChild(f);
    const D = 720, E = 'cubic-bezier(.42,.06,.28,1)', sgn = fwd ? -1 : 1;
    leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${sgn * 18}deg) skewY(${sgn * -1.2}deg)`, offset: .18 }, { transform: `rotateY(${sgn * 180}deg)` }], { duration: D, easing: E, fill: 'forwards' });
    sh.animate([{ opacity: 0 }, { opacity: .9, offset: .5 }, { opacity: 0 }], { duration: D, easing: E, fill: 'forwards' });
    under.animate([{ opacity: .9 }, { opacity: 0 }], { duration: D, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => f.remove(), D + 60);
  } catch (e) {}
}
async function openPage(n) {
  n = Math.max(1, Math.min(N, n));
  if (page && n !== cur) { try { checkDone(true); } catch (e) {} }
  await saveNow();
  if (n !== cur && META.length) { SFX.blip('page'); buzz(8); if (page) pageFlip(n > cur); }
  cur = n; page = META[n - 1]; store.set('page', n); setTimeout(syncLock, 0);
  undo.length = 0; redo.length = 0;
  $('#pgLabel').textContent = `${n} / ${N}`; $('#pgName').textContent = PN[n - 1] || '';
  $('#btnPrev').disabled = n <= 1; $('#btnNext').disabled = n >= N; closeSheet();
  document.body.classList.toggle('freemode', !!page.nobucket);
  $('#btnShare').hidden = !page.plate;
  if (typeof storyUI === 'function') setTimeout(storyUI, 0);
  if (page.nobucket) setTimeout(() => toast('Free canvas: draw the whole muscle group, from origin to insertion, however you like'), 600);
  pageImg.src = pageFile(n, '.jpg');
  const topI = document.getElementById('topImg'); if (page.top) { topI.src = pageFile(n, '_top.png'); topI.hidden = false; } else { topI.hidden = true; topI.removeAttribute('src'); }
  xColor.clearRect(0, 0, W, H); xInk.clearRect(0, 0, W, H); xLive.clearRect(0, 0, W, H);
  xMask.clearRect(0, 0, W, H); xWipe.clearRect(0, 0, W, H); xTop.clearRect(0, 0, W, H); paper = null; wipeUsed = false;
  if (page.top) topI.onload = () => { if (page === META[n - 1]) renderWipe(); };
  labels = null; lockCanvas = null; zoneCache.clear(); texts = {};
  const plate = !!page.plate;
  $('#tools').hidden = false; document.body.classList.add('tools'); document.body.classList.toggle('textmode', !plate);
  // cada tipo de página recuerda su herramienta: al pasar de lámina se queda como usted la tenía
  if (brush !== 'gotero') brush = plate ? store.get('brush', 'marcador') : store.get('tbrush', 'resaltador');
  if (brush === 'gotero' && !plate) brush = store.get('tbrush', 'resaltador');
  if (!plate && TEXT_OFF.includes(brush)) { brush = 'resaltador'; }
  if (page.nobucket && (brush === 'balde' || brush === 'textura')) { brush = 'marcador'; }   // solo en esta página, no se guarda
  buildBrushes(); buildColors(); syncSliders(); updateDock();
  view.s = 1; fit();
  buildHotspots();
  if (plate) {
    const [li] = await Promise.all([loadImg(pageFile(n, '_lab.png'))]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.drawImage(li, 0, 0); const d = x.getImageData(0, 0, W, H).data;
    labels = new Uint16Array(W * H);
    for (let i = 0, j = 0; i < labels.length; i++, j += 4) labels[i] = d[j] | (d[j + 1] << 8);
    buildLock();
  }
  const saved = await idbGet('p' + n);
  if (saved && cur === n) {
    if (saved.color) xColor.drawImage(await blobImg(saved.color), 0, 0);
    if (saved.ink) xInk.drawImage(await blobImg(saved.ink), 0, 0);
    if (saved.wipe) { xMask.drawImage(await blobImg(saved.wipe), 0, 0); wipeUsed = true; if (!pageImg.complete) await new Promise(ok => { pageImg.onload = ok; setTimeout(ok, 3000); }); renderWipe(); }
    texts = saved.texts || {};
  }
  renderTexts();
}
function blobImg(b) { return loadImg(URL.createObjectURL(b)); }

/* zonas bloqueadas: bolitas, cuadritos de escribir y la franja de abajo */
function buildLock() {
  lockCanvas = document.createElement('canvas'); lockCanvas.width = W; lockCanvas.height = H;
  const x = lockCanvas.getContext('2d'); x.fillStyle = '#000';
  for (const r of page.lock || []) {
    const X0 = r[0] * PT, Y0 = r[1] * PT, w = (r[2] - r[0]) * PT, h = (r[3] - r[1]) * PT;
    if (r[4]) { const rad = h / 2; x.beginPath(); x.moveTo(X0 + rad, Y0); x.lineTo(X0 + w - 4, Y0); x.lineTo(X0 + w, Y0 + 4); x.lineTo(X0 + w, Y0 + h - 4); x.lineTo(X0 + w - 4, Y0 + h); x.lineTo(X0 + rad, Y0 + h); x.arc(X0 + rad, Y0 + rad, rad, Math.PI / 2, Math.PI * 1.5); x.closePath(); x.fill(); }
    else x.fillRect(X0, Y0, w, h);
  }
  if (!page.top || (page.leaders && page.leaders.length)) for (const r of page.write || []) x.fillRect(r[0] * PT - 2, r[1] * PT - 2, (r[2] - r[0]) * PT + 4, (r[3] - r[1]) * PT + 4);
  // bolitas de número: gota de pintura blanca irregular alrededor (solo se nota cuando se pinta el fondo)
  let seed = cur * 97 + 13; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blobs = (page.circles || []).map(c => [(c[0] + c[2]) * PT / 2, (c[1] + c[3]) * PT / 2, (c[2] - c[0]) * PT / 2]);
  for (const r of page.lock || []) if (r[4]) { const rad = (r[3] - r[1]) * PT / 2; blobs.push([r[0] * PT + rad, r[1] * PT + rad, rad]); }   // bolitas de color al lado de los cuadros
  for (const [cx, cy, R] of blobs) {   // mancha de pintura: borde orgánico, lóbulos y salpicaduras
    const N = 72, H = [2, 3, 4, 5, 7, 9].map(f => [f, (0.035 + rnd() * 0.07) / Math.sqrt(f / 2), rnd() * 7]);
    x.beginPath();
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2; let k = 1.42; for (const [f, am, p] of H) k += am * Math.sin(f * a + p);
      const px = cx + Math.cos(a) * R * k, py = cy + Math.sin(a) * R * k; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath(); x.fill();
    const nd = 4 + (rnd() * 4 | 0);
    for (let j = 0; j < nd; j++) { const a = rnd() * 7, d = R * (1.65 + rnd() * 0.8), r = R * (0.05 + rnd() * 0.12); x.beginPath(); x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, r * (0.7 + rnd() * 0.3), a, 0, 7); x.fill(); }
    if (rnd() < 0.7) { const a = rnd() * 7, d0 = R * 1.3, d1 = R * (1.9 + rnd() * 0.4), w = R * (0.1 + rnd() * 0.08);   // chorrito
      x.beginPath(); x.moveTo(cx + Math.cos(a - 0.15) * d0, cy + Math.sin(a - 0.15) * d0); x.quadraticCurveTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, cx + Math.cos(a + 0.15) * d0, cy + Math.sin(a + 0.15) * d0); x.fill();
      x.beginPath(); x.arc(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1, w, 0, 7); x.fill(); }
  }
}
/* máscara de un músculo (zona) */
const zoneCache = new Map();
function zoneMask(L) {
  if (zoneCache.has(L)) return zoneCache.get(L);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const id = x.createImageData(W, H); const d = id.data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] === L) {
    d[i * 4 + 3] = 255; const px = i % W, py = (i / W) | 0;
    if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  x.putImageData(id, 0, 0);
  const z = { c, box: [x0, y0, x1 + 1, y1 + 1] }; zoneCache.set(L, z);
  if (zoneCache.size > 12) zoneCache.delete(zoneCache.keys().next().value);
  return z;
}
function labelAt(px, py) { if (!labels) return 0; px |= 0; py |= 0; if (px < 0 || py < 0 || px >= W || py >= H) return 0; return labels[py * W + px]; }
function writeZoneAt(px, py) {
  const P = [px / PT, py / PT];
  const w = (page.write || []).findIndex(r => P[0] >= r[0] && P[0] <= r[2] && P[1] >= r[1] && P[1] <= r[3]);
  if (w >= 0) return { kind: 'w', i: w, r: page.write[w] };
  const c = (page.circles || []).findIndex(r => P[0] >= r[0] && P[0] <= r[2] && P[1] >= r[1] && P[1] <= r[3]);
  if (c >= 0) return { kind: 'c', i: c, r: page.circles[c] };
  return null;
}

/* ---------------- pintura ---------------- */
let stroke = null;
function rgba(hex, a) { const v = parseInt(hex.slice(1), 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; }
function jitter(hex, amt) {
  const v = parseInt(hex.slice(1), 16); const f = 1 + (Math.random() * 2 - 1) * amt;
  const ch = s => Math.max(0, Math.min(255, Math.round((v >> s & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function mix(a, b, k) {
  const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(a.length === 4 ? '#' + [...a.slice(1)].map(c => c + c).join('') : a), B2 = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B2[i] - v) * k)).join(',')})`;
}
// acuarela: máscara húmeda + capas (aguada, borde de pigmento, granulado del papel)
const WC = (() => { const m = document.createElement('canvas'); m.width = W; m.height = H; const t = document.createElement('canvas'); t.width = W; t.height = H; const s = document.createElement('canvas'); return { m, x: m.getContext('2d'), t, tx: t.getContext('2d'), s, sx: s.getContext('2d'), pat: null }; })();
function wcRender() {
  const b = stroke.box, x0 = Math.max(0, b[0] | 0), y0 = Math.max(0, b[1] | 0), x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]));
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
  const k = Math.max(3, Math.min(10, stroke.s.size / 7));            // ancho del borde húmedo
  const sw = Math.max(1, Math.round(w / k)), sh = Math.max(1, Math.round(h / k));
  WC.s.width = sw; WC.s.height = sh; WC.sx.imageSmoothingEnabled = true; WC.sx.drawImage(WC.m, x0, y0, w, h, 0, 0, sw, sh);
  const T = WC.tx, X = xLive;
  X.save(); X.clearRect(x0, y0, w, h);
  // 1. aguada: color transparente en toda la mancha
  T.save(); T.globalCompositeOperation = 'copy'; T.drawImage(WC.m, x0, y0, w, h, x0, y0, w, h);
  T.globalCompositeOperation = 'source-in'; T.fillStyle = color; T.fillRect(x0, y0, w, h); T.restore();
  X.globalAlpha = .38; X.drawImage(WC.t, x0, y0, w, h, x0, y0, w, h);
  // 2. borde: el pigmento se acumula donde se seca el agua
  T.save(); T.globalCompositeOperation = 'copy'; T.drawImage(WC.m, x0, y0, w, h, x0, y0, w, h);
  T.globalCompositeOperation = 'destination-out'; T.imageSmoothingEnabled = true; T.drawImage(WC.s, 0, 0, sw, sh, x0, y0, w, h);
  T.globalCompositeOperation = 'source-in'; T.fillStyle = color; T.fillRect(x0, y0, w, h); T.restore();
  X.globalAlpha = .75; X.drawImage(WC.t, x0, y0, w, h, x0, y0, w, h);
  // 3. granulado: el papel deja ver su textura
  if (!WC.pat) WC.pat = X.createPattern(GRAIN.papel, 'repeat');
  X.globalCompositeOperation = 'destination-out'; X.globalAlpha = .28; X.fillStyle = WC.pat; X.fillRect(x0, y0, w, h);
  X.restore();
}
let patCache = {};
function grainPattern(kind) {
  const key = kind + color; if (patCache[key]) return patCache[key];
  const g = GRAIN[kind]; const c = document.createElement('canvas'); c.width = g.width; c.height = g.height;
  const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(g, 0, 0);
  patCache = { [key]: xLive.createPattern(c, 'repeat') }; return patCache[key];
}
function dab(x, y, r, p, dir) {
  const s = stroke.s, hard = s.hard / 100, X = xLive;
  switch (stroke.brush) {
    case 'resaltador': {
      X.fillStyle = stroke.col; X.save(); X.translate(x, y); X.rotate(-0.35); X.fillRect(-r * 0.45, -r, r * 0.9, r * 2); X.restore(); break;
    }
    case 'boligrafo': { X.fillStyle = stroke.col; X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); break; }
    case 'marcador': case 'borrador': case 'magia': case 'pluma': {
      if (hard > 0.95) { X.fillStyle = stroke.brush === 'pluma' ? stroke.ink : color; X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); }
      else { const g = X.createRadialGradient(x, y, r * hard, x, y, r); const c = stroke.brush === 'pluma' ? stroke.ink : color; g.addColorStop(0, rgba(c, 1)); g.addColorStop(1, rgba(c, 0)); X.fillStyle = g; X.beginPath(); X.arc(x, y, r, 0, 7); X.fill(); }
      break;
    }
    case 'lapiz': case 'creyon': {
      X.fillStyle = grainPattern(stroke.brush);
      const ox = (Math.random() - .5) * r * .3, oy = (Math.random() - .5) * r * .3; X.beginPath(); X.arc(x + ox, y + oy, r * (0.88 + Math.random() * .16), 0, 7); X.fill();
      break;
    }
    case 'tiza': {
      // tiza sutil: solo se pega en el grano del papel y se va cargando con las pasadas
      X.save(); X.globalAlpha = 0.22 + 0.25 * hard; X.fillStyle = grainPattern('tiza');
      for (let i = 0; i < 2; i++) { const a = Math.random() * 7, d = Math.random() * r * .25; X.beginPath(); X.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.75 + Math.random() * .3), 0, 7); X.fill(); }
      X.globalAlpha = .18; X.fillStyle = color;           // polvo suelto en el borde
      for (let i = 0; i < 5; i++) { const a = Math.random() * 7, d = r * (0.8 + Math.random() * .45); X.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.2, 1.2); }
      X.restore(); break;
    }
    case 'carboncillo': {
      // carboncillo: núcleo oscuro con grano alargado, bordes difuminados y polvo
      X.save(); X.fillStyle = grainPattern('carboncillo');
      X.globalAlpha = .55; X.beginPath(); X.ellipse(x, y, r * .95, r * .6, dir + Math.PI / 2, 0, 7); X.fill();
      const g = X.createRadialGradient(x, y, r * .2, x, y, r * 1.25); g.addColorStop(0, rgba(color, .10)); g.addColorStop(1, rgba(color, 0));
      X.globalAlpha = 1; X.fillStyle = g; X.beginPath(); X.arc(x, y, r * 1.25, 0, 7); X.fill();
      X.globalAlpha = .3; X.fillStyle = color;
      for (let i = 0; i < 3; i++) { const a = Math.random() * 7, d = r * (0.6 + Math.random() * .7); X.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1, 1); }
      X.restore(); break;
    }
    case 'acuarela': {
      // la acuarela se dibuja como máscara húmeda; el color, los bordes y las gotas los pone wcRender
      const M = WC.x; M.fillStyle = '#000';
      const rr = r * (0.9 + Math.random() * 0.2); M.beginPath();
      for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, k = rr * (0.84 + Math.random() * 0.26); i ? M.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k) : M.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k); }
      M.fill();
      if (Math.random() < 0.045) {                          // gota que salta
        const a = Math.random() * 7, d = rr * (1.15 + Math.random() * .7), q = rr * (0.06 + Math.random() * 0.12);
        M.beginPath(); M.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, q, 0, 7); M.fill(); grow(x + Math.cos(a) * d - q - 4, y + Math.sin(a) * d - q - 4, x + Math.cos(a) * d + q + 4, y + Math.sin(a) * d + q + 4);
      }
      if (Math.random() < 0.02) {                           // mancha que se expande
        const a = Math.random() * 7, d = rr * (0.5 + Math.random() * .4), q = rr * (0.35 + Math.random() * 0.25);
        M.beginPath(); for (let i = 0; i <= 12; i++) { const b = i / 12 * 7, k = q * (0.7 + Math.random() * .5); i ? M.lineTo(x + Math.cos(a) * d + Math.cos(b) * k, y + Math.sin(a) * d + Math.sin(b) * k) : M.moveTo(x + Math.cos(a) * d + Math.cos(b) * k, y + Math.sin(a) * d + Math.sin(b) * k); } M.fill();
      }
      const pad = rr * 2.1 + 6; grow(x - pad, y - pad, x + pad, y + pad); return;
    }
    case 'oleo': {
      // óleo con cerdas: cada cerda deja su surco; luz y sombra dan volumen; la carga se acaba en trazos largos
      const st = stroke; if (!st.br) {
        st.br = []; const n = Math.max(7, Math.min(22, r * 0.9 | 0));
        for (let i = 0; i < n; i++) st.br.push({ o: ((i / (n - 1)) * 2 - 1) * 0.9 + (Math.random() - .5) * .08, w: 0.6 + Math.random() * 0.6, c: Math.random() < .5 ? mix(color, '#ffffff', Math.random() * .22) : mix(color, '#000000', Math.random() * .22), last: null });
        st.load = 1;
      }
      const nx = -Math.sin(dir), ny = Math.cos(dir);
      st.load = Math.max(0.25, st.load - 0.0009 * (r / 10));
      X.save(); X.lineCap = 'round'; X.lineJoin = 'round';
      // cuerpo de pintura continuo (cubre el papel), con borde algo irregular
      const L = [x + nx * r * (0.92 + Math.random() * .1), y + ny * r * (0.92 + Math.random() * .1)], R = [x - nx * r * (0.92 + Math.random() * .1), y - ny * r * (0.92 + Math.random() * .1)];
      if (st.eL && (st.load > 0.4 || Math.random() < st.load * 2)) { X.globalAlpha = 1; X.fillStyle = st.base || (st.base = mix(color, '#000000', .04)); X.beginPath(); X.moveTo(st.eL[0], st.eL[1]); X.lineTo(L[0], L[1]); X.lineTo(R[0], R[1]); X.lineTo(st.eR[0], st.eR[1]); X.closePath(); X.fill(); }
      st.eL = L; st.eR = R;
      for (let i = 0; i < st.br.length; i++) {
        const b = st.br[i], px = x + nx * b.o * r, py = y + ny * b.o * r;
        if (b.last && (st.load > 0.55 || Math.random() < st.load * 1.4)) {
          const lw = Math.max(1.2, (2 * r / st.br.length) * 1.15 * b.w);
          X.globalAlpha = 1; X.strokeStyle = b.c; X.lineWidth = lw; X.beginPath(); X.moveTo(b.last[0], b.last[1]); X.lineTo(px, py); X.stroke();
          if (i % 3 === 0) { X.globalAlpha = .55; X.strokeStyle = mix(color, '#ffffff', .45); X.lineWidth = Math.max(.6, lw * .35); X.beginPath(); X.moveTo(b.last[0] - nx * lw * .4, b.last[1] - ny * lw * .4); X.lineTo(px - nx * lw * .4, py - ny * lw * .4); X.stroke(); }
          if (i % 3 === 1) { X.globalAlpha = .4; X.strokeStyle = mix(color, '#000000', .35); X.lineWidth = Math.max(.6, lw * .3); X.beginPath(); X.moveTo(b.last[0] + nx * lw * .45, b.last[1] + ny * lw * .45); X.lineTo(px + nx * lw * .45, py + ny * lw * .45); X.stroke(); }
        }
        b.last = [px, py];
      }
      if (Math.random() < 0.025 * st.load) {               // grumo de pintura con brillo
        const a = (Math.random() - .5) * 2, gx = x + nx * a * r * .9, gy = y + ny * a * r * .9, q = r * (0.12 + Math.random() * .12);
        X.globalAlpha = 1; X.fillStyle = mix(color, '#000000', .15); X.beginPath(); X.ellipse(gx, gy, q * 1.4, q, dir, 0, 7); X.fill();
        X.fillStyle = mix(color, '#ffffff', .6); X.globalAlpha = .7; X.beginPath(); X.ellipse(gx - nx * q * .3, gy - ny * q * .3, q * .5, q * .25, dir, 0, 7); X.fill();
      }
      X.restore(); break;
    }
    case 'chispeado': {
      // pintura chispeada: muchas gotas irregulares, grandes y pequeñas, con gotitas alrededor y un rocío suave
      const st = stroke; X.save(); X.lineCap = 'round'; X.lineJoin = 'round';
      const sh = st.sh || (st.sh = [mix(color, '#ffffff', .15), color, color, mix(color, '#000000', .15)]);
      // carga de la brocha: a veces viene cargada de pintura (más gotas y chorro más grueso), a veces casi seca
      if (!st.sp) st.sp = { ph: Math.random() * 100, on: true, last: null, load: .6, tgt: .6 };
      const sp = st.sp; if (Math.random() < .04) sp.tgt = Math.random() < .3 ? 1.6 + Math.random() * .8 : .3 + Math.random() * .7; sp.load += (sp.tgt - sp.load) * .12;
      const k = (0.35 + hard * 0.9) * sp.load; sp.ph += 0.09 + Math.random() * .05;
      const jx = x + Math.sin(sp.ph * 1.7) * r * .3, jy = y + Math.cos(sp.ph * 1.3) * r * .3;   // hilo de pintura que serpentea con el gesto
      if (sp.on ? Math.random() < .03 : Math.random() < .08) sp.on = !sp.on;
      if (sp.last && sp.on) { const w = r * (0.03 + 0.17 * sp.load * Math.pow(0.5 + 0.5 * Math.sin(sp.ph * 2.3) * Math.sin(sp.ph * .9 + 1), 2)); X.strokeStyle = color; X.lineWidth = Math.max(.7, w); X.beginPath(); X.moveTo(sp.last[0], sp.last[1]); X.lineTo(jx, jy); X.stroke(); }
      sp.last = [jx, jy];
      const n = Math.random() < Math.min(.95, k * .7) ? 1 + (Math.random() * 1.8 * k | 0) : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 7, d = Math.pow(Math.random(), 1.3) * r * 1.7, bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d;
        const t = Math.random(), q = Math.max(.8, r * (t < .12 * sp.load ? 0.16 + Math.random() * .26 : t < .45 ? 0.06 + Math.random() * .08 : 0.02 + Math.random() * .04));
        X.fillStyle = sh[Math.random() * 4 | 0]; dropBlob(X, bx, by, q);
        if (q > r * .17) for (let j = 0; j < 3 + (Math.random() * 6 | 0); j++) {   // gotitas que quedan pegadas alrededor de la gota grande
          const b = Math.random() * 7, e = q * (1.25 + Math.random() * 1.3), tq = Math.max(.5, q * (0.06 + Math.random() * .16));
          X.beginPath(); X.ellipse(bx + Math.cos(b) * e, by + Math.sin(b) * e, tq * (1 + Math.random() * .7), tq, b, 0, 7); X.fill();
        }
        grow(bx - q * 3, by - q * 3, bx + q * 3, by + q * 3);
      }
      for (let i = 0; i < (2 + Math.random() * 4 * k | 0); i++) { const a = Math.random() * 7, d = Math.sqrt(Math.random()) * r * 1.6; X.globalAlpha = .55 + Math.random() * .45; X.fillStyle = sh[Math.random() * 4 | 0]; X.beginPath(); X.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, .45 + Math.random() * Math.max(.5, r * .016), 0, 7); X.fill(); }   // rocío suave
      X.globalAlpha = 1; grow(x - r * 1.8, y - r * 1.8, x + r * 1.8, y + r * 1.8);
      X.restore(); break;
    }
    case 'aero': {
      const g = X.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(color, .07)); g.addColorStop(1, rgba(color, 0));
      X.fillStyle = g; X.beginPath(); X.arc(x, y, r, 0, 7); X.fill();
      X.save(); X.fillStyle = color;                        // gotitas finas del aerosol
      for (let i = 0; i < Math.max(4, r * 0.35); i++) { const a = Math.random() * 7, d = Math.abs(Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * r; X.globalAlpha = 0.15 + Math.random() * .3; const q = 0.5 + Math.random() * 0.9; X.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, q, q); }
      X.restore(); break;
    }
  }
  const pad = r + 6; grow(x - pad, y - pad, x + pad, y + pad);
}
/* gota irregular: un contorno con lóbulos suaves, nunca dos iguales */
function dropBlob(X, bx, by, q) {
  const lobes = 2 + (Math.random() * 3 | 0), ph = Math.random() * 7, amp = .05 + Math.random() * .11, ph2 = Math.random() * 7, sq = .8 + Math.random() * .3, rot = Math.random() * 7;
  X.beginPath(); for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2, m = q * (1 + amp * Math.sin(a * lobes + ph) + amp * .6 * Math.sin(a * (lobes + 3) + ph2)), ex = Math.cos(a) * m, ey = Math.sin(a) * m * sq, px = bx + ex * Math.cos(rot) - ey * Math.sin(rot), py = by + ex * Math.sin(rot) + ey * Math.cos(rot); i ? X.lineTo(px, py) : X.moveTo(px, py); } X.closePath(); X.fill();
}
/* toque con el chispeado: una salpicadura distinta cada vez, fina y gruesa, irregular */
function splash(x, y, r) {
  const X = xLive, hard = stroke.s.hard / 100, k = 0.4 + hard * .9, sh = [mix(color, '#ffffff', .2), color, color, mix(color, '#000000', .2)];
  X.save(); X.lineCap = 'round';
  const big = Math.random();
  const blob = (bx, by, q) => { const lobes = 3 + (Math.random() * 4 | 0), ph = Math.random() * 7, amp = .12 + Math.random() * .22; X.beginPath(); for (let i = 0; i <= 26; i++) { const a = i / 26 * Math.PI * 2, m = q * (1 + amp * Math.sin(a * lobes + ph) + (Math.random() - .5) * .08); i ? X.lineTo(bx + Math.cos(a) * m, by + Math.sin(a) * m) : X.moveTo(bx + Math.cos(a) * m, by + Math.sin(a) * m); } X.fill(); };
  X.fillStyle = color;
  if (big < .6) dropBlob(X, x + (Math.random() - .5) * r * .3, y + (Math.random() - .5) * r * .3, r * (0.25 + Math.random() * .35));   // gota grande irregular (no siempre)
  for (let i = 0; i < (Math.random() * 4 | 0); i++) { const a = Math.random() * 7, d = r * (0.4 + Math.random() * 1.2), q = r * (0.09 + Math.random() * .18); X.fillStyle = sh[Math.random() * 4 | 0]; dropBlob(X, x + Math.cos(a) * d, y + Math.sin(a) * d, q); }
  const dirB = Math.random() * 7, spread = Math.random() < .5 ? Math.PI * 2 : 1.4 + Math.random() * 1.6;   // a veces sale hacia un lado, como un golpe de pincel
  const n = (14 + Math.random() * 30 * k) | 0;
  for (let i = 0; i < n; i++) {
    const a = dirB + (Math.random() - .5) * spread, d = r * (0.15 + Math.pow(Math.random(), .8) * 1.9), q = Math.max(.6, r * (0.02 + Math.pow(Math.random(), 2.2) * .18) * (1.25 - d / (r * 2.4)));
    X.fillStyle = sh[Math.random() * 4 | 0]; const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d, el = 1 + Math.min(2.2, d / r) * Math.random();
    X.beginPath(); X.ellipse(bx, by, q * el, q, a, 0, 7); X.fill();
  }
  for (let i = 0; i < (Math.random() * 3 * k | 0); i++) {   // uno o dos hilos que salen con fuerza
    const a = dirB + (Math.random() - .5) * spread, L = r * (0.6 + Math.random() * 1.3), w = Math.max(.6, r * (0.012 + Math.random() * .03)), bend = (Math.random() - .5) * r * .8;
    X.strokeStyle = sh[Math.random() * 4 | 0]; X.lineWidth = w; X.beginPath(); X.moveTo(x + Math.cos(a) * r * .15, y + Math.sin(a) * r * .15);
    X.quadraticCurveTo(x + Math.cos(a) * L * .5 - Math.sin(a) * bend, y + Math.sin(a) * L * .5 + Math.cos(a) * bend, x + Math.cos(a) * L, y + Math.sin(a) * L); X.stroke();
    X.fillStyle = X.strokeStyle; X.beginPath(); X.arc(x + Math.cos(a) * L, y + Math.sin(a) * L, w * 1.4, 0, 7); X.fill();
  }
  const m = (40 + Math.random() * 90 * k) | 0;              // rocío de cepillo de dientes
  for (let i = 0; i < m; i++) { const a = dirB + (Math.random() - .5) * (spread + .6), d = r * Math.sqrt(Math.random()) * 2.2; X.globalAlpha = .5 + Math.random() * .5; X.fillStyle = sh[Math.random() * 4 | 0]; X.beginPath(); X.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, .4 + Math.random() * Math.max(.5, r * .02), 0, 7); X.fill(); }
  X.restore(); grow(x - r * 2.6, y - r * 2.6, x + r * 2.6, y + r * 2.6);
}
function grow(a, b, c, d) { const s = stroke; s.box[0] = Math.min(s.box[0], a); s.box[1] = Math.min(s.box[1], b); s.box[2] = Math.max(s.box[2], c); s.box[3] = Math.max(s.box[3], d); }
function clipLive(box) {
  const [x0, y0, x1, y1] = box.map(Math.round); const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
  xLive.save();
  if (stroke.zone) { xLive.globalCompositeOperation = 'destination-in'; xLive.drawImage(stroke.zone.c, x0, y0, w, h, x0, y0, w, h); }
  else if (stroke.wzone) { xLive.globalCompositeOperation = 'destination-in'; xLive.fillStyle = '#000'; xLive.fillRect(...stroke.wzone); }
  if (stroke.layer === 'color' && !stroke.free && lockCanvas) { xLive.globalCompositeOperation = 'destination-out'; xLive.drawImage(lockCanvas, x0, y0, w, h, x0, y0, w, h); }
  xLive.restore();
}
function startStroke(e) {
  if (isLocked()) { toast('Plate locked: tap the lock to keep painting'); return; }
  const [x, y] = toPage(e), s = S();
  if (brush === 'gotero') { pickColor(x, y); return; }
  if (brush === 'balde') { if (page.nobucket) { toast('This page is painted by hand: choose a brush'); return; } bucket(x, y); return; }
  if (brush === 'textura') { if (page.nobucket) { toast('This page is painted by hand: choose a brush'); return; } texFill(x, y); return; }
  if (brush === 'teclado') { openKeyboard(x, y); return; }
  if (FREE.includes(brush)) {
    const hl = brush === 'resaltador';
    stroke = { brush, s, layer: hl ? 'color' : 'ink', free: true, zone: null, wzone: null, ink: hl ? hlColor : penColor, col: hl ? hlColor : penColor, pts: [[x, y]], box: [x, y, x, y], last: [x, y], dist: 0, id: e.pointerId };
    cLive.style.opacity = s.opa / 100; cLive.style.mixBlendMode = hl ? 'multiply' : 'normal'; cLive.style.filter = ''; cLive.style.zIndex = hl ? '' : '4';
    const r = radius(e); dab(x, y, r, e.pressure, 0); SFX.start(brush); return;
  }
  if (brush === 'magia') {
    if (!paper) buildPaper();
    stroke = { brush, s, layer: 'both', free: true, magic: true, zone: null, wzone: null, pts: [[x, y]], box: [x, y, x, y], last: [x, y], dist: 0, id: e.pointerId };
    stroke.snap = snapLayers('both'); const mc = document.createElement('canvas'); mc.width = W; mc.height = H; mc.getContext('2d').drawImage(mWipe, 0, 0); stroke.msnap = mc;
    cLive.style.opacity = 0; const r = radius(e); dab(x, y, r, e.pressure, 0); eraseLive(stroke.box); SFX.start('magia'); return;
  }
  if (isText() && brush === 'borrador') {
    stroke = { brush, s, layer: 'both', free: true, zone: null, wzone: null, pts: [[x, y]], box: [x, y, x, y], last: [x, y], dist: 0, id: e.pointerId };
    stroke.snap = snapLayers('both');
    cLive.style.opacity = 0; const r = radius(e); dab(x, y, r, e.pressure, 0); eraseLive(stroke.box); SFX.start('borrador'); return;
  }
  const layer = brush === 'pluma' ? 'ink' : 'color';
  let zone = null, wzone = null, eraseInk = false;
  if (layer === 'ink' || brush === 'borrador') {
    const wz = writeZoneAt(x, y);
    if (layer === 'ink' && !wz) { toast('Write inside the boxes or the circles'); return; }
    if (wz) { const r = wz.r; wzone = [r[0] * PT, r[1] * PT, (r[2] - r[0]) * PT, (r[3] - r[1]) * PT]; if (brush === 'borrador') eraseInk = true; }
  }
  if (brush === 'borrador' && !eraseInk) {
    // si toca una línea de bolígrafo o escritura, el borrador borra esa tinta (sin límites de zona)
    const R = Math.max(6, S().size / 2) | 0, d = xInk.getImageData(Math.max(0, (x | 0) - R), Math.max(0, (y | 0) - R), 2 * R, 2 * R).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 20) { eraseInk = true; wzone = null; break; }
  }
  if (layer === 'color' && !eraseInk && tape && !page.nobucket && labels) {
    const L = labelAt(x, y);
    if (!L && brush !== 'borrador') return;
    if (L) zone = zoneMask(L);   // el borrador sobre una raya borra libre
  }
  stroke = { brush, s, layer: eraseInk ? 'ink' : layer, zone, wzone, eraseInk, ink: '#1F3B73', pts: [[x, y]], box: [x, y, x, y], last: [x, y], dist: 0, id: e.pointerId };
  if (brush === 'chispeado') {   // dedo apoyado y quieto: la pintura se acumula y, pasados 3 segundos, chorrea hacia abajo
    const me = stroke; me.t0 = performance.now(); me.x0 = x; me.y0 = y;
    me.hold = setInterval(() => {
      if (stroke !== me) { clearInterval(me.hold); return; }
      const t = performance.now() - me.t0, r = radius({ pointerType: 'touch' }), [hx, hy] = me.last;
      if (me.hp && Math.hypot(hx - me.hp[0], hy - me.hp[1]) > 6) { me.hp = null; me.t0 = performance.now(); me.drips = null; return; }   // si se mueve, vuelve a contar
      if (t < 400) return; me.held = true; me.hp = me.hp || [hx, hy];
      const X = xLive; X.save(); X.fillStyle = color;
      const pq = r * Math.min(.38, .12 + (t - 400) / 2600 * .26); dropBlob(X, me.hp[0], me.hp[1], pq); grow(me.hp[0] - pq * 1.5, me.hp[1] - pq * 1.5, me.hp[0] + pq * 1.5, me.hp[1] + pq * 1.5);
      if (t > 3000) {
        if (!me.drips) me.drips = Array.from({ length: 2 + (Math.random() * 3 | 0) }, () => ({ x: me.hp[0] + (Math.random() - .5) * pq * 1.4, y: me.hp[1] + pq * .3, w: pq * (0.18 + Math.random() * .22), v: .6 + Math.random() * 1.6, L: 0, max: r * (1.5 + Math.random() * 4) }));
        X.strokeStyle = color; X.lineCap = 'round';
        for (const d of me.drips) { if (d.L >= d.max) continue; const ny = d.y + d.v * 2.2, nx = d.x + (Math.random() - .5) * .5; X.lineWidth = d.w * (1 - d.L / d.max * .35); X.beginPath(); X.moveTo(d.x, d.y); X.lineTo(nx, ny); X.stroke();
          d.x = nx; d.y = ny; d.L += d.v * 2.2; X.beginPath(); X.ellipse(d.x, d.y, d.w * .75, d.w * .95, 0, 0, 7); X.fill(); grow(d.x - d.w * 2, d.y - d.w * 2, d.x + d.w * 2, d.y + d.w * 2); }
      }
      X.restore(); clipLive(me.box);
    }, 45);
  }
  cLive.style.opacity = (stroke.brush === 'borrador' ? 0 : s.opa / 100);
  cLive.style.mixBlendMode = stroke.brush === 'acuarela' ? 'multiply' : 'normal'; cLive.style.zIndex = stroke.layer === 'ink' ? '4' : '';   // se ve igual que como queda, también encima de texturas y fotos oscuras
  cLive.style.filter = '';
  if (stroke.brush === 'acuarela') { WC.x.clearRect(0, 0, W, H); stroke.wc = true; }
  if (brush === 'borrador') stroke.snap = snapLayers(stroke.layer);
  const r = radius(e); dab(x, y, r, e.pressure, 0); if (stroke.wc) wcRender(); clipLive(stroke.box); if (stroke.snap) eraseLive(stroke.box); SFX.start(brush);
}
// borrador en vivo: se ve lo que borra mientras arrastra
function snapLayers(layer) {
  const out = {};
  for (const [k, cx] of [['color', xColor], ['ink', xInk]]) {
    if (layer !== 'both' && layer !== k) continue;
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(cx.canvas, 0, 0); out[k] = c;
  }
  return out;
}
function eraseLive(box) {
  const [x0, y0, x1, y1] = box.map((v, i) => Math.max(0, Math.min(i % 2 ? H : W, Math.round(v))));
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
  for (const k in stroke.snap) {
    const cx = k === 'ink' ? xInk : xColor;
    cx.save(); cx.clearRect(x0, y0, w, h); cx.drawImage(stroke.snap[k], x0, y0, w, h, x0, y0, w, h);
    cx.globalCompositeOperation = 'destination-out'; cx.globalAlpha = stroke.s.opa / 100;
    cx.drawImage(cLive, x0, y0, w, h, x0, y0, w, h); cx.restore();
  }
  if (stroke.msnap) {
    xMask.save(); xMask.clearRect(x0, y0, w, h); xMask.drawImage(stroke.msnap, x0, y0, w, h, x0, y0, w, h);
    xMask.globalAlpha = stroke.s.opa / 100; xMask.drawImage(cLive, x0, y0, w, h, x0, y0, w, h); xMask.restore();
    renderWipe(x0, y0, w, h);
  }
}
// papel limpio: la lámina sin rayas (filtro de máximo), para tapar lo que borra el borrador mágico
function buildPaper() {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); if (pageImg.complete) x.drawImage(pageImg, 0, 0, W, H);
  const im = x.getImageData(0, 0, W, H), d = im.data, R = 7, t = new Uint8ClampedArray(d.length);
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) { const o = (y * W + xx) * 4; let br = -1, bi = o; for (let k = -R; k <= R; k++) { const q = xx + k; if (q < 0 || q >= W) continue; const p = (y * W + q) * 4, v = d[p] + d[p + 1] + d[p + 2]; if (v > br) { br = v; bi = p; } } t[o] = d[bi]; t[o + 1] = d[bi + 1]; t[o + 2] = d[bi + 2]; t[o + 3] = 255; }
  for (let xx = 0; xx < W; xx++) for (let y = 0; y < H; y++) { const o = (y * W + xx) * 4; let br = -1, bi = o; for (let k = -R; k <= R; k++) { const q = y + k; if (q < 0 || q >= H) continue; const p = (q * W + xx) * 4, v = t[p] + t[p + 1] + t[p + 2]; if (v > br) { br = v; bi = p; } } d[o] = t[bi]; d[o + 1] = t[bi + 1]; d[o + 2] = t[bi + 2]; d[o + 3] = 255; }
  x.putImageData(im, 0, 0); paper = c;
}
function renderWipe(x0 = 0, y0 = 0, w = W, h = H) {
  if (wipeUsed || stroke) { if (!paper) buildPaper();
  xWipe.save(); xWipe.beginPath(); xWipe.rect(x0, y0, w, h); xWipe.clip();   // source-in borra todo lo que queda fuera: se limita al recuadro
  xWipe.clearRect(x0, y0, w, h); xWipe.drawImage(mWipe, x0, y0, w, h, x0, y0, w, h);
  xWipe.globalCompositeOperation = 'source-in'; xWipe.drawImage(paper, x0, y0, w, h, x0, y0, w, h); xWipe.restore(); }
  const tI = document.getElementById('topImg');
  xTop.save(); xTop.clearRect(x0, y0, w, h);
  if (page && page.top && tI.complete && tI.naturalWidth) { xTop.drawImage(tI, 0, 0, W, H); xTop.globalCompositeOperation = 'destination-out'; xTop.drawImage(mWipe, 0, 0); }
  xTop.restore();
}
function radius(e) {
  const s = stroke ? stroke.s : S(); let r = Math.max(0.8, s.size / 2) * 1.0;
  if (e.pointerType === 'pen' && e.pressure > 0) r *= 0.35 + e.pressure * 0.9;
  return r;
}
function moveStroke(e) {
  if (!stroke) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const b0 = stroke.box.slice();
  for (const ev of evs) {
    let [x, y] = toPage(ev); const r = radius(ev);
    const k = (stroke.brush === 'pluma' || stroke.brush === 'boligrafo') ? 0.55 : 0.4;   // suavizado
    if (stroke.sm) { x = stroke.sm[0] + (x - stroke.sm[0]) * k; y = stroke.sm[1] + (y - stroke.sm[1]) * k; }
    stroke.sm = [x, y];
    const [lx, ly] = stroke.last, dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy);
    const sp = Math.max(0.5, r * (stroke.brush === 'aero' ? 0.15 : stroke.brush === 'chispeado' ? 0.3 : stroke.brush === 'oleo' ? 0.12 : stroke.brush === 'acuarela' ? 0.22 : stroke.brush === 'tiza' ? 0.3 : stroke.brush === 'carboncillo' ? 0.2 : (stroke.brush === 'marcador' || stroke.brush === 'pluma' || stroke.brush === 'borrador' || stroke.brush === 'magia' || stroke.brush === 'resaltador' || stroke.brush === 'boligrafo') ? 0.08 : 0.18));
    const dir = Math.atan2(dy, dx);
    let t = sp - stroke.dist;
    while (t <= d) { dab(lx + dx * t / d, ly + dy * t / d, r, ev.pressure, dir); t += sp; }
    stroke.dist = d - (t - sp); stroke.last = [x, y]; SFX.move(d);
  }
  const nb = [Math.min(b0[0], stroke.box[0]), Math.min(b0[1], stroke.box[1]), Math.max(b0[2], stroke.box[2]), Math.max(b0[3], stroke.box[3])];
  if (stroke.wc) { if (!stroke.raf) stroke.raf = requestAnimationFrame(() => { if (!stroke || !stroke.wc) return; stroke.raf = 0; wcRender(); clipLive(stroke.box); }); return; }
  if (stroke.layer !== 'both') clipLive(nb);
  if (stroke.snap) eraseLive(nb);
}
function endStroke() {
  SFX.stop();
  if (!stroke) return;
  if (stroke.hold) clearInterval(stroke.hold);
  if (stroke.brush === 'chispeado' && !stroke.held && performance.now() - stroke.t0 < 320 && Math.hypot(stroke.last[0] - stroke.x0, stroke.last[1] - stroke.y0) < 12) { splash(stroke.x0, stroke.y0, radius({ pointerType: 'touch' })); clipLive(stroke.box); }
  if (stroke.wc) { if (stroke.raf) cancelAnimationFrame(stroke.raf); wcRender(); clipLive(stroke.box); }
  const st = stroke; stroke = null;
  const box = st.box.map((v, i) => Math.max(0, Math.min(i % 2 ? H : W, Math.round(v))));
  const [x0, y0, x1, y1] = box; const w = x1 - x0, h = y1 - y0;
  if (w > 0 && h > 0 && st.snap) {
    // el borrado ya se aplicó en vivo: solo guardamos el deshacer con lo que había antes
    const grp = []; for (const k in st.snap) grp.push({ layer: k, x: x0, y: y0, data: st.snap[k].getContext('2d').getImageData(x0, y0, w, h) });
    if (st.msnap) { grp.push({ layer: 'wipe', x: x0, y: y0, data: st.msnap.getContext('2d').getImageData(x0, y0, w, h) }); wipeUsed = true; }
    undo.push(grp.length === 1 ? grp[0] : { group: grp }); if (undo.length > 30) undo.shift();
    redo.length = 0; xLive.clearRect(0, 0, W, H); cLive.style.opacity = 1; cLive.style.filter = ''; queueSave(); return;
  }
  if (w > 0 && h > 0) {
    if (st.layer === 'both') {
      for (const [lay, cx] of [['color', xColor], ['ink', xInk]]) { pushUndo(lay, x0, y0, w, h); cx.save(); cx.globalCompositeOperation = 'destination-out'; cx.drawImage(cLive, x0, y0, w, h, x0, y0, w, h); cx.restore(); }
      xLive.clearRect(0, 0, W, H); cLive.style.opacity = 1; queueSave(); return;
    }
    const ctx = st.layer === 'ink' ? xInk : xColor;
    pushUndo(st.layer, x0, y0, w, h);
    ctx.save();
    if (st.brush === 'borrador') ctx.globalCompositeOperation = 'destination-out';
    else if (st.brush === 'acuarela') { ctx.globalCompositeOperation = 'multiply'; }
    ctx.globalAlpha = st.brush === 'borrador' ? st.s.opa / 100 : st.s.opa / 100;
    ctx.drawImage(cLive, x0, y0, w, h, x0, y0, w, h);
    ctx.restore();
  }
  xLive.clearRect(0, 0, W, H); cLive.style.opacity = 1; cLive.style.filter = '';
  queueSave();
}
function cancelStroke() { SFX.stop(); if (stroke) { if (stroke.hold) clearInterval(stroke.hold); stroke = null; xLive.clearRect(0, 0, W, H); } }

function bucket(x, y) {
  const L = labelAt(x, y); if (!L) return;
  const z = zoneMask(L); const [x0, y0, x1, y1] = z.box; const w = x1 - x0, h = y1 - y0;
  pushUndo('color', x0, y0, w, h);
  const t = document.createElement('canvas'); t.width = w; t.height = h; const tx = t.getContext('2d');
  tx.fillStyle = color; tx.fillRect(0, 0, w, h);
  tx.globalCompositeOperation = 'destination-in'; tx.drawImage(z.c, x0, y0, w, h, 0, 0, w, h);
  tx.globalCompositeOperation = 'destination-out'; tx.drawImage(lockCanvas, x0, y0, w, h, 0, 0, w, h);
  xColor.save(); xColor.globalAlpha = S().opa / 100; xColor.drawImage(t, x0, y0); xColor.restore();
  SFX.blip('fill'); buzz(18); queueSave();
}
/* ---------------- texturas, estampados y su foto ---------------- */
const TEXTURES = [['lino', 'Linen'], ['acuarela', 'Watercolor paper'], ['madera', 'Wood'], ['marmol', 'Marble'], ['jean', 'Denim'], ['kraft', 'Kraft paper'],
  ['puntos', 'Dots'], ['rayas', 'Stripes'], ['cuadros', 'Gingham'], ['ondas', 'Waves'], ['estrellas', 'Stars'], ['flores', 'Flowers'], ['corazones', 'Hearts']];
let texId = store.get('tex', 'lino'), texFit = store.get('texFit', 'mosaico'), texPhoto = null, texPhotoTry = false;
const rgbOf = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mixC = (c, w, k) => c.map((v, i) => Math.round(v + (w[i] - v) * k));
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
function seeded(n) { let a = n >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const texCache = new Map();
function texTile(id, col, k) {
  const key = id + col + k.toFixed(2); if (texCache.has(key)) return texCache.get(key);
  const c0 = rgbOf(col), wh = [255, 255, 255], bk = [20, 20, 24];
  const S0 = Math.max(16, Math.round(120 * k)), mat = ['lino', 'acuarela', 'madera', 'marmol', 'jean', 'kraft'].includes(id);
  const T = mat ? Math.max(64, Math.round(256 * k)) : S0;
  const cv = document.createElement('canvas'); cv.width = T; cv.height = T; const x = cv.getContext('2d'); const R = seeded(id.length * 7919 + T);
  const light = mixC(c0, wh, .78), mid = mixC(c0, wh, .35);
  if (mat) {
    const d = x.createImageData(T, T), p = d.data, TAU = Math.PI * 2;
    const rows = Array.from({ length: T }, () => R() - .5), colsN = Array.from({ length: T }, () => R() - .5);
    const blob = Array.from({ length: 9 }, () => [R() * T, R() * T, (0.15 + R() * .3) * T, R() - .5]);
    for (let y = 0; y < T; y++) for (let xx = 0; xx < T; xx++) {
      const u = xx / T, v = y / T, n = R() - .5; let rgb, f = 0;
      if (id === 'lino') { rgb = mixC(c0, wh, .62); f = rows[y] * .22 + colsN[xx] * .22 + n * .08; }
      else if (id === 'acuarela') { rgb = mixC(c0, wh, .45); for (const [bx, by, br, bs] of blob) { for (const ox of [-T, 0, T]) for (const oy of [-T, 0, T]) { const dd = Math.hypot(xx - bx - ox, y - by - oy) / br; if (dd < 1) f += bs * .35 * (1 - dd * dd); } } f += n * .1; }
      else if (id === 'madera') { rgb = mixC(c0, [120, 80, 45], .25); const w = Math.sin(TAU * (v * 6 + .35 * Math.sin(TAU * u) + .15 * Math.sin(TAU * (2 * u + v)))); f = w * .16 + (Math.abs(w) > .93 ? -.18 : 0) + n * .06 + rows[y] * .05; }
      else if (id === 'marmol') { rgb = mixC(c0, wh, .82); const t = Math.sin(TAU * (u + v + .25 * Math.sin(TAU * (2 * v)) + .15 * Math.sin(TAU * (3 * u + v)))); const vein = Math.pow(1 - Math.abs(t), 14); f = n * .03; rgb = mixC(rgb, c0, vein * .85); }
      else if (id === 'jean') { rgb = mixC(c0, bk, .25); const tw = ((xx + y) % 4 < 2) ? .12 : -.08; f = tw + n * .14 + (R() < .02 ? .35 : 0); }
      else { rgb = mixC(mixC(c0, [176, 132, 82], .55), wh, .25); f = n * .12 + (R() < .03 ? (R() - .5) * .5 : 0); }
      const tgt = f > 0 ? wh : bk, a = Math.min(1, Math.abs(f)), q = (y * T + xx) * 4;
      p[q] = rgb[0] + (tgt[0] - rgb[0]) * a; p[q + 1] = rgb[1] + (tgt[1] - rgb[1]) * a; p[q + 2] = rgb[2] + (tgt[2] - rgb[2]) * a; p[q + 3] = 255;
    }
    x.putImageData(d, 0, 0);
  } else {
    x.fillStyle = css(light); x.fillRect(0, 0, T, T); x.fillStyle = css(c0); x.strokeStyle = css(c0);
    const at = (fn) => { for (const [ox, oy] of [[0, 0], [T, 0], [0, T], [T, T], [T / 2, T / 2], [-T / 2, T / 2], [T / 2, -T / 2], [-T / 2, -T / 2]]) fn(ox, oy); };
    const star = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } x.closePath(); x.fill(); };
    const heart = (cx, cy, r) => { x.beginPath(); x.moveTo(cx, cy + r * .9); x.bezierCurveTo(cx - r * 1.3, cy, cx - r * .7, cy - r * 1.1, cx, cy - r * .35); x.bezierCurveTo(cx + r * .7, cy - r * 1.1, cx + r * 1.3, cy, cx, cy + r * .9); x.fill(); };
    const flower = (cx, cy, r) => { for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; x.beginPath(); x.ellipse(cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55, r * .48, r * .3, a, 0, 7); x.fill(); } x.save(); x.fillStyle = css(mixC(c0, [255, 214, 80], .7)); x.beginPath(); x.arc(cx, cy, r * .28, 0, 7); x.fill(); x.restore(); };
    if (id === 'puntos') at((ox, oy) => { x.beginPath(); x.arc(ox, oy, T * .14, 0, 7); x.fill(); });
    else if (id === 'rayas') { x.lineWidth = T * .17; for (const c of [0, T / 2, T, T * 1.5, T * 2]) { x.beginPath(); x.moveTo(c + 2, -2); x.lineTo(c - T - 2, T + 2); x.stroke(); } }
    else if (id === 'cuadros') { x.globalAlpha = .45; x.fillRect(0, 0, T / 2, T); x.fillRect(0, 0, T, T / 2); x.globalAlpha = .35; x.fillRect(0, 0, T / 2, T / 2); x.globalAlpha = 1; }
    else if (id === 'ondas') { x.lineWidth = T * .07; x.lineCap = 'round'; for (const yy of [T * .25, T * .75]) { x.beginPath(); for (let i = 0; i <= T; i += 2) x.lineTo(i, yy + Math.sin(i / T * Math.PI * 2) * T * .12); x.stroke(); } }
    else if (id === 'estrellas') at((ox, oy) => star(ox, oy, T * .2));
    else if (id === 'flores') at((ox, oy) => flower(ox, oy, T * .22));
    else at((ox, oy) => heart(ox, oy, T * .18));
  }
  if (texCache.size > 40) texCache.clear(); texCache.set(key, cv); return cv;
}
async function loadTexPhoto() {
  if (texPhoto || texPhotoTry) return texPhoto; texPhotoTry = true;
  try { const b = await idbGet('foto'); if (b) texPhoto = await blobImg(b); } catch (e) {}
  return texPhoto;
}
function choosePhoto() {
  let inp = $('#texFile'); if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.id = 'texFile'; inp.hidden = true; document.body.appendChild(inp); }
  inp.value = ''; inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const im = await blobImg(f), m = 1600 / Math.max(im.width, im.height), sc = Math.min(1, m);
      const c = document.createElement('canvas'); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const b = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .86)); await idbSet('foto', b); texPhoto = c; texPhotoTry = true;
      texId = 'foto'; store.set('tex', texId); buildTex(); toast('Photo ready: tap the part you want to fill');
    } catch (e) { toast('That photo could not be opened'); }
  };
  inp.click();
}
function buildTex() {
  const row = $('#texRow'); if (!row) return; row.innerHTML = '';
  const k = Math.max(.15, S().size / 40);
  const head = (t) => { const h = document.createElement('div'); h.className = 'glabel'; h.textContent = t; row.appendChild(h); };
  const btn = (id, name, draw) => {
    const b = document.createElement('button'); b.setAttribute('aria-pressed', texId === id);
    const c = document.createElement('canvas'); c.width = 96; c.height = 48; const x = c.getContext('2d'); draw(x);
    b.appendChild(c); const s = document.createElement('span'); s.textContent = name; b.appendChild(s);
    b.onclick = () => { if (id === 'foto' && !texPhoto) { choosePhoto(); return; } texId = id; store.set('tex', id); buildTex(); };
    row.appendChild(b); return b;
  };
  head('Materials');
  for (const [id, nm] of TEXTURES.slice(0, 6)) btn(id, nm, x => { x.fillStyle = x.createPattern(texTile(id, color, Math.min(k, .5)), 'repeat'); x.fillRect(0, 0, 96, 48); });
  head('Patterns (in the chosen color)');
  for (const [id, nm] of TEXTURES.slice(6)) btn(id, nm, x => { x.fillStyle = x.createPattern(texTile(id, color, Math.min(k, .4)), 'repeat'); x.fillRect(0, 0, 96, 48); });
  head('Your photo');
  btn('foto', texPhoto ? 'Your photo' : 'Choose photo', x => {
    if (texPhoto) { const r = Math.max(96 / texPhoto.width, 48 / texPhoto.height); x.drawImage(texPhoto, (96 - texPhoto.width * r) / 2, (48 - texPhoto.height * r) / 2, texPhoto.width * r, texPhoto.height * r); }
    else { x.fillStyle = '#EEF1F4'; x.fillRect(0, 0, 96, 48); x.strokeStyle = '#3F4A57'; x.lineWidth = 2; x.strokeRect(30, 12, 36, 26); x.beginPath(); x.arc(48, 25, 7, 0, 7); x.stroke(); x.fillStyle = '#3F4A57'; x.fillRect(42, 8, 12, 5); }
  });
  if (texPhoto) {
    const ch = document.createElement('button'); ch.className = 'texopt'; ch.textContent = 'Change photo'; ch.onclick = choosePhoto; row.appendChild(ch);
    for (const [v, nm] of [['completa', 'Full'], ['mosaico', 'Pattern']]) {
      const b = document.createElement('button'); b.className = 'texopt'; b.textContent = nm; b.setAttribute('aria-pressed', texFit === v);
      b.onclick = () => { texFit = v; store.set('texFit', v); texId = 'foto'; store.set('tex', 'foto'); buildTex(); }; row.appendChild(b);
    }
  } else loadTexPhoto().then(p => { if (p) buildTex(); });
}
async function texFill(x, y) {
  const L = labelAt(x, y); if (!L) return;
  const z = zoneMask(L); const [x0, y0, x1, y1] = z.box; const w = x1 - x0, h = y1 - y0;
  const k = Math.max(.15, S().size / 40);
  const t = document.createElement('canvas'); t.width = w; t.height = h; const tx = t.getContext('2d');
  if (texId === 'foto') {
    const ph = await loadTexPhoto(); if (!ph) { choosePhoto(); return; }
    if (texFit === 'completa') { const r = Math.max(w / ph.width, h / ph.height); tx.drawImage(ph, (w - ph.width * r) / 2, (h - ph.height * r) / 2, ph.width * r, ph.height * r); }
    else { const tw = Math.max(40, Math.round(260 * k)), th = Math.round(tw * ph.height / ph.width); const tc = document.createElement('canvas'); tc.width = tw; tc.height = th; tc.getContext('2d').drawImage(ph, 0, 0, tw, th);
      const pat = tx.createPattern(tc, 'repeat'); tx.translate(-x0, -y0); tx.fillStyle = pat; tx.fillRect(x0, y0, w, h); tx.setTransform(1, 0, 0, 1, 0, 0); }
  } else {
    const pat = tx.createPattern(texTile(TEXTURES.some(t => t[0] === texId) ? texId : 'lino', color, k), 'repeat');
    tx.translate(-x0, -y0); tx.fillStyle = pat; tx.fillRect(x0, y0, w, h); tx.setTransform(1, 0, 0, 1, 0, 0);
  }
  pushUndo('color', x0, y0, w, h);
  tx.globalCompositeOperation = 'destination-in'; tx.drawImage(z.c, x0, y0, w, h, 0, 0, w, h);
  tx.globalCompositeOperation = 'destination-out'; tx.drawImage(lockCanvas, x0, y0, w, h, 0, 0, w, h);
  xColor.save(); xColor.globalAlpha = S().opa / 100; xColor.drawImage(t, x0, y0); xColor.restore();
  SFX.blip('fill'); buzz(18); queueSave();
}

function pickColor(x, y) {
  const d = xColor.getImageData(x | 0, y | 0, 1, 1).data;
  if (d[3] < 10) { toast('There is no color there yet'); return; }
  const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  brush = (prevBrush && prevBrush !== 'gotero' && prevBrush !== 'borrador') ? prevBrush : 'marcador'; prevBrush = null; store.set('brush', brush); setColor(hex); buildBrushes(); syncSliders(); updateDock(); toast('Color picked');
}

/* deshacer y rehacer por recuadro */
const ctxOf = l => l === 'ink' ? xInk : l === 'wipe' ? xMask : xColor;
function pushUndo(layer, x, y, w, h) {
  const ctx = ctxOf(layer);
  undo.push({ layer, x, y, data: ctx.getImageData(x, y, w, h) }); if (undo.length > 30) undo.shift(); redo.length = 0;
}
function swap(from, to) {
  const u = from.pop(); if (!u) return;
  const list = u.group || [u], back = [];
  for (const e of list) {
    const ctx = ctxOf(e.layer);
    back.push({ layer: e.layer, x: e.x, y: e.y, data: ctx.getImageData(e.x, e.y, e.data.width, e.data.height) });
    ctx.putImageData(e.data, e.x, e.y);
    if (e.layer === 'wipe') renderWipe();
  }
  to.push(back.length === 1 ? back[0] : { group: back }); SFX.blip('undo'); buzz(10); queueSave();
}
$('#btnUndo').onclick = () => { if (isLocked()) { toast('Plate locked'); return; } swap(undo, redo); };
$('#btnClear').onclick = () => { if (isLocked()) { toast('Plate locked'); return; } $('#confirmClear').hidden = false; };
// borrar todo el libro: tres confirmaciones
let wipeStep = 0;
const WIPE = ['This will erase <b>the whole book</b>: everything painted and written on <b>every plate</b>. Do you want to continue?',
  'Are you sure? <b>This cannot be undone.</b> All your plates will be blank.',
  'Final confirmation: tap <b>Erase all</b> to leave the whole book blank.'];
function wipeRender() { $('#wipeText').innerHTML = WIPE[wipeStep]; $('#wipeSteps').innerHTML = WIPE.map((_, i) => `<i class="${i <= wipeStep ? 'on' : ''}"></i>`).join(''); $('#wipeYes').textContent = wipeStep < 2 ? `Confirm (${wipeStep + 1} of 3)` : 'Erase all'; }
$('#btnWipeAll').onclick = () => { wipeStep = 0; wipeRender(); $('#wipeBox').hidden = false; };
$('#wipeNo').onclick = () => { $('#wipeBox').hidden = true; };
$('#wipeYes').onclick = async () => {
  if (wipeStep < 2) { wipeStep++; wipeRender(); return; }
  try { const d = await db(); await new Promise(ok => { const t = d.transaction('p', 'readwrite'); t.objectStore('p').clear(); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {}
  locks = {}; store.set('locks', locks); clearTimeout(saveT); dirty = false;
  xColor.clearRect(0, 0, W, H); xInk.clearRect(0, 0, W, H); xMask.clearRect(0, 0, W, H); xWipe.clearRect(0, 0, W, H); wipeUsed = false; texts = {}; renderTexts(); undo.length = 0; redo.length = 0;
  if (typeof renderWipe === 'function') renderWipe(); syncLock(); $('#wipeBox').hidden = true; closeHome(); toast('Book cleared: every plate is blank again');
};
$('#clearNo').onclick = () => { $('#confirmClear').hidden = true; };
$('#clearYes').onclick = () => {
  pushUndo('color', 0, 0, W, H); xColor.clearRect(0, 0, W, H);
  pushUndo('ink', 0, 0, W, H); xInk.clearRect(0, 0, W, H);
  if (wipeUsed) { pushUndo('wipe', 0, 0, W, H); xMask.clearRect(0, 0, W, H); renderWipe(); }
  texts = {}; renderTexts(); $('#confirmClear').hidden = true; closeSheet(); queueSave(); toast('Plate cleared');
};
$('#btnRedo').onclick = () => swap(redo, undo);

/* ---------------- escribir con teclado ---------------- */
let kbdZone = null;
function openKeyboard(x, y) {
  const wz = writeZoneAt(x, y); if (!wz) { toast('Tap a box or a circle to write'); return; }
  kbdZone = wz.kind + wz.i; $('#kbdText').value = texts[kbdZone] || ''; $('#kbd').hidden = false; $('#kbdText').focus();
}
function closeKeyboard() {
  if (!kbdZone) return; const v = $('#kbdText').value.trim();
  if (v) texts[kbdZone] = v; else delete texts[kbdZone];
  kbdZone = null; $('#kbd').hidden = true; renderTexts(); queueSave();
}
$('#kbdOk').onclick = closeKeyboard;
$('#kbdText').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeKeyboard(); } });
function zoneRect(key) {
  const k = key[0], i = +key.slice(1); const r = (k === 'w' ? page.write : page.circles || [])[i]; return r;
}
function renderTexts() {
  const box = $('#texts'); box.innerHTML = '';
  if (!page || !page.plate) return;
  for (const [key, v] of Object.entries(texts)) {
    const r = zoneRect(key); if (!r) continue;
    const d = document.createElement('div'); d.className = 'tx'; d.textContent = v;
    const hpt = r[3] - r[1];
    d.style.left = r[0] / 612 * 100 + '%'; d.style.top = r[1] / 792 * 100 + '%';
    d.style.width = (r[2] - r[0]) / 612 * 100 + '%'; d.style.height = hpt / 792 * 100 + '%';
    const fs = key[0] === 'c' ? hpt * 0.75 : Math.min(hpt * 0.62, 20);
    d.style.fontSize = `calc(${fs / 792} * var(--ph))`;
    if (key[0] === 'c') d.classList.add('circ');   // número centrado en la bolita
    box.appendChild(d);
  }
  box.style.setProperty('--ph', stage.style.height || '100px');
}

/* ---------------- biblioteca de láminas ---------------- */
const PN = ['Cover', '2026 Digital Edition', 'Welcome', 'Table of contents', 'Build order', 'Build order (2)',
  'Unit 1 story', 'Unit 1 muscles', 'Group plate', 'Obturator externus', 'Obturator internus', 'Superior gemellus',
  'Inferior gemellus', 'Quadratus femoris', 'Piriformis', 'Free canvas: draw Unit 1',
  'Unit 2 story', 'Unit 2 muscles', 'Group plate', 'Iliacus', 'Psoas major', 'Psoas minor', 'Free canvas: draw Unit 2',
  'Unit 3 story', 'Unit 3 muscles', 'Group plate', 'Vastus intermedius', 'Vastus medialis', 'Vastus lateralis', 'Rectus femoris', 'Sartorius', 'Free canvas: draw Unit 3'];
const SECTIONS = [['Start', '', 1, 6], ['Unit 1', 'Deep posterior hip muscles', 7, 16], ['Unit 2', 'Deep anterior hip muscles', 17, 23], ['Unit 3', 'Anterior hip and thigh muscles', 24, 32]];
const thumbCache = {};
async function drawThumb(cv, n) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height;
  try {
    const img = thumbCache[n] || (thumbCache[n] = await loadImg(pageFile(n, '.jpg')));
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
    const sv = n === cur && page ? null : await idbGet('p' + n);
    if (n === cur && page && wipeUsed) x.drawImage(cWipe, 0, 0, w, h);
    x.globalCompositeOperation = 'multiply';
    if (n === cur && page) x.drawImage(cColor, 0, 0, w, h); else if (sv && sv.color) x.drawImage(await blobImg(sv.color), 0, 0, w, h);
    x.globalCompositeOperation = 'source-over';
    if (n === cur && page) { if (page.top) x.drawImage(cTop, 0, 0, w, h); }
    else if (META[n - 1] && META[n - 1].top) { const t = await loadImg(pageFile(n, '_top.png')).catch(() => null); if (t) x.drawImage(t, 0, 0, w, h); }
    if (n === cur && page) x.drawImage(cInk, 0, 0, w, h); else if (sv && sv.ink) x.drawImage(await blobImg(sv.ink), 0, 0, w, h);
    return !!(sv || (n === cur && dirtyAny));
  } catch (e) { return false; }
}
let dirtyAny = false;
async function buildHome() {
  try { checkDone(false); } catch (e) {}
  await saveNow();
  const g = $('#homeGrid'); g.innerHTML = '';
  $('#contName').textContent = `${cur}. ${PN[cur - 1] || ''}`;
  drawThumb($('#contThumb'), cur);
  const keys = await idbKeys();
  const [bd, bk] = plateCount(1, N), pct = bk ? Math.round(bd / bk * 100) : 0;
  const pr = document.createElement('div'); pr.className = 'hprog';
  pr.innerHTML = `<div class="hp1"><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg><b>Your progress</b><span>${bd} of ${bk} plates completed</span><em>${pct}%</em></div><div class="hbar"><i style="width:${pct}%"></i></div>`;
  g.appendChild(pr);
  for (const [t, sub, a, b] of SECTIONS) {
    const sec = document.createElement('div'); sec.className = 'hsec';
    const [sd, sk] = plateCount(a, b);
    const badge = sk ? (sd === sk ? `<span class="ribbon"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="m8.5 13.5-2 7.5 5.5-3 5.5 3-2-7.5"/></svg>Ribbon earned</span>` : `<span class="stars">${sd}/${sk} <svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></span>`) : '';
    sec.innerHTML = `<h2>${t}${badge}${sub ? `<small>${sub}</small>` : ''}</h2>`;
    const cards = document.createElement('div'); cards.className = 'cards';
    for (let n = a; n <= Math.min(b, N); n++) {
      const c = document.createElement('button'); c.className = 'card' + (n === cur ? ' cur' : '');
      c.innerHTML = `<span class="th"><canvas width="153" height="198"></canvas><span class="n">${n}</span>${DONE[n] ? '<span class="star"><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></span>' : ''}${keys.has('p' + n) ? '<span class="dot"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>' : ''}</span><span class="t">${PN[n - 1]}</span>`;
      c.onclick = () => { closeHome(); openPage(n); };
      cards.appendChild(c); drawThumb(c.querySelector('canvas'), n);
    }
    sec.appendChild(cards); g.appendChild(sec);
  }
}
function openHome() { closeSheet(); $('#home').hidden = false; buildHome(); }
function closeHome() { $('#home').hidden = true; }
$('#btnHome').onclick = openHome;
$('#pgBtn').onclick = openHome;
$('#btnCloseHome').onclick = closeHome;
$('#btnContinue').onclick = closeHome;
async function idbKeys() { try { const d = await db(); return await new Promise(ok => { const q = d.transaction('p').objectStore('p').getAllKeys(); q.onsuccess = () => ok(new Set(q.result)); q.onerror = () => ok(new Set()); }); } catch (e) { return new Set(); } }

/* ---------------- guía de primer uso ---------------- */
const GUIDE = [
  ['<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>', 'Choose and paint', 'At the bottom, tap <b>the tool</b> and <b>the color</b>. With <b>Stay inside</b> on, the color stays inside the part you started painting: a muscle, a tendon, a bone or a segment.'],
  ['<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 'Zoom and move the plate', 'Spread two fingers to zoom in and drag them to move the plate: while you use two fingers <b>nothing gets painted</b>. At the top right you also have <b>the magnifier</b> to zoom in or out and <b>the hand</b> to move the plate with one finger, up, down and sideways. Tap the hand again to go back to painting.'],
  ['<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', 'All your plates', 'Swipe sideways or use <b>Previous</b> and <b>Next</b>, above the plate. Tap <b>the page number</b> to see all the plates and what you have painted.'],
  ['<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>', 'Music for painting', 'Tap <b>the music note</b> and choose the music that keeps you company while you color. It plays inside the app, even offline.'],
  ['<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>', 'Your work stays', 'What you paint <b>stays on your plate</b>: you can close the app, change pages or come back another day and everything is still there, just as you left it.'],
  ['<path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/>', 'Learn by painting', 'Before coloring, find <b>where the muscle starts</b> (its origin) and <b>where it ends</b> (its insertion). Paint it end to end, follow the direction of its fibers and fill in the table: <b>muscle, origin, insertion and action</b>. Your hand and your eye learn together.'],
  ['<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.2 5.2 0 0 0 22 9.2C22 5.8 17.5 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>', 'Free your inner artist', 'When your muscles are done, <b>the whole plate is your canvas</b>. Decorate, add backgrounds, drawings and details, mix watercolor with pencil, invent your own palette. Feel free and expand your mind: what you paint with creativity <b>is remembered better</b> and taught with more passion.'],
  ['<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', 'Sign and share your work', 'As the artist you are, <b>sign and date your work</b> with the pen, wherever you like. Then tap <b>the up arrow</b> at the top right and choose how it will look: on the painter\'s easel, in oil, watercolor, chalk, graphite, comic and more. Share it on WhatsApp or social media and inspire others to learn by painting.']
];
let gi = 0;
function showGuide() {
  gi = 0; $('#guide').hidden = false; renderGuide();
}
function renderGuide() {
  const [ic, t, p] = GUIDE[gi];
  $('#gSlides').innerHTML = `<div class="gslide"><div class="gi"><svg viewBox="0 0 24 24">${ic}</svg></div><b>${t}</b><p>${p}</p></div>`;
  $('#gDots').innerHTML = GUIDE.map((_, i) => `<i class="${i === gi ? 'on' : ''}"></i>`).join('');
  $('#gNext').textContent = gi === GUIDE.length - 1 ? 'Let\'s paint!' : 'Next';
}
$('#gNext').onclick = () => { if (gi < GUIDE.length - 1) { gi++; renderGuide(); } else { $('#guide').hidden = true; store.set('guided', true); } };
$('#gSkip').onclick = () => { $('#guide').hidden = true; store.set('guided', true); };
$('#btnGuide').onclick = () => { closeSheet(); showGuide(); };
/* zonas tocables en la página del índice (página 4) */
function buildHotspots() {
  const hot = $('#hot'); hot.innerHTML = '';
  if (cur !== 4) return;
  const spots = [[50, 104, 440, 138, 5], [50, 139, 440, 186, 7], [50, 187, 440, 220, 17]];
  for (let u = 3; u <= 17; u++) { const y = 221 + (u - 3) * 34.4; spots.push([50, y, 440, y + 33, 0]); }
  for (const [x0, y0, x1, y1, n] of spots) {
    const a = document.createElement('a'); a.style.left = x0 / 612 * 100 + '%'; a.style.top = y0 / 792 * 100 + '%';
    a.style.width = (x1 - x0) / 612 * 100 + '%'; a.style.height = (y1 - y0) / 792 * 100 + '%';
    a.dataset.n = n;
    hot.appendChild(a);
  }
}

/* cursor de pintar: aro fino del ancho real del pincel + cruz al centro (como en Paint); balde, textura, cuentagotas y teclado con su símbolo */
const dot = document.createElement('div'); dot.id = 'brushDot'; dot.hidden = true; document.body.appendChild(dot);
const CUR_ICON = {   // [svg, punta x, punta y]: la punta del dibujo cae justo donde actúa la herramienta
  balde: ['<svg viewBox="0 0 32 32"><g transform="rotate(200 16 11)"><path d="M8 5h16l-2.2 13H10.2z" fill="#fff"/><path d="M8 5h16l-2.2 13H10.2zM9.5 5c0-5 13-5 13 0"/></g><path d="M16 21.5c-2.6 3.4-3.6 5.4-3.6 6.6a3.6 3.6 0 0 0 7.2 0c0-1.2-1-3.2-3.6-6.6z" fill="var(--c)" stroke-width="1.3"/></svg>', 16, 31.7],
  textura: ['<svg viewBox="0 0 32 32"><rect x="14" y="14" width="16" height="16" rx="2.5" fill="#fff"/><path d="M14 19.3h16M14 24.7h16M19.3 14v16M24.7 14v16" stroke="var(--c)" stroke-width="1.6"/><rect x="14" y="14" width="16" height="16" rx="2.5"/><path d="M1.5 1.5v17l4.6-4.3 3.3 7.2 3-1.4-3.3-7h6.4z" fill="#fff"/></svg>', 1.5, 1.5],
  gotero: ['<svg viewBox="0 0 32 32"><path d="M19 5l8 8M16.5 7.5l8 8L12 28H4v-8z" fill="#fff"/><path d="M4 28l-1.6 1.6" /><circle cx="2.6" cy="29.4" r="2.2" fill="var(--c)" stroke-width="1"/></svg>', 2.6, 29.4],
  teclado: ['<svg viewBox="0 0 32 32"><path d="M11 5h10M16 5v22M11 27h10" stroke="#fff" stroke-width="4"/><path d="M11 5h10M16 5v22M11 27h10"/></svg>', 16, 16]
};
const ERASE_ICON = '<svg viewBox="0 0 32 32"><path d="M4 22 18 8a2.5 2.5 0 0 1 3.5 0l5 5a2.5 2.5 0 0 1 0 3.5L13 30H8z" fill="#fff"/><path d="M4 22 18 8a2.5 2.5 0 0 1 3.5 0l5 5a2.5 2.5 0 0 1 0 3.5L13 30H8z"/><path d="M4 22l8 8" /><path d="M10.5 15.5l9 9" stroke="#E5578E" stroke-width="2.4"/></svg>';
let dotT = null, dotKey = '';
function showDot(e) {
  if (!page || hand || spaceDown || pointers.size > 1 || document.body.classList.contains('sheet')) { dot.hidden = true; return; }
  const ic = CUR_ICON[brush], er = ERASERS.includes(brush);
  const sc = stage.getBoundingClientRect().width / W;
  const d = ic ? 0 : Math.max(2, S().size * sc);
  const c = brush === 'resaltador' ? hlColor : brush === 'boligrafo' ? penColor : color;
  const key = brush + '|' + Math.round(d) + '|' + c;
  if (key !== dotKey) {
    dotKey = key;
    dot.className = ic ? 'icon' : er ? 'er' : '';
    let h = '';
    if (ic) h = `<b style="left:${-ic[1]}px;top:${-ic[2]}px">${ic[0]}</b>`;
    else if (er) { const r = Math.max(5, d / 2), o = r * .707; h = `<i class="ring" style="width:${2 * r}px;height:${2 * r}px;margin:${-r}px 0 0 ${-r}px"></i><b style="left:${o - 6}px;top:${-o - 26}px">${ERASE_ICON}</b>`; }
    else h = (d >= 7 ? `<i class="ring" style="width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px"></i>` : '') + '<i class="cross"></i>';
    dot.innerHTML = h; dot.style.setProperty('--c', c);
  }
  dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  dot.hidden = false; clearTimeout(dotT);
}
viewport.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || pointers.has(e.pointerId)) showDot(e); }, { passive: true });
viewport.addEventListener('pointerdown', e => showDot(e), { passive: true });
viewport.addEventListener('pointerup', e => { clearTimeout(dotT); dotT = setTimeout(() => { if (e.pointerType !== 'mouse') dot.hidden = true; }, e.pointerType === 'mouse' ? 0 : 450); }, { passive: true });
viewport.addEventListener('pointerleave', () => { dot.hidden = true; }, { passive: true });
viewport.addEventListener('pointercancel', () => { dot.hidden = true; }, { passive: true });

/* ---------------- gestos ---------------- */
const pointers = new Map(); let gesture = null, panOnly = false, swipe = null, undoPending = null, pend = null, hand = false;
const TAP_BRUSH = ['balde', 'textura', 'gotero', 'teclado'];
const snapEv = e => ({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, pressure: e.pressure, pointerType: e.pointerType });
/* con el dedo, el trazo espera un instante: si llega un segundo dedo (ampliar), no se pinta nada.
   el balde, el cuentagotas y el teclado actúan al levantar el dedo, nunca al apoyarlo */
function firePend(fromUp) {
  const p = pend; if (!p) return;
  if (pointers.size > 1 && !fromUp) { clearTimeout(p.t); pend = null; return; }
  if (TAP_BRUSH.includes(brush)) {
    if (!fromUp) return;
    clearTimeout(p.t); pend = null;
    if (!p.far && !p.multi) startStroke(p.ev);
    return;
  }
  clearTimeout(p.t); pend = null; if (p.multi) return;
  startStroke(p.ev);
  if (stroke) for (const m of p.moves) moveStroke(m);
}
function dropPend() { if (pend) { clearTimeout(pend.t); pend = null; } }
viewport.addEventListener('pointerdown', e => {
  if (document.body.classList.contains('sheet')) { closeSheet(); return; }
  if (e.target.closest('#toast')) return;
  const hs = e.target.closest('#hot a');
  if (hs) { const n = +hs.dataset.n; if (n) openPage(n); else toast('Available in the next version'); return; }
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    cancelStroke(); dropPend(); const [a, b] = [...pointers.values()];
    gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, s: view.s, x: view.x, y: view.y, t: Date.now(), moved: false };
    if (undoPending) { undoPending.cancel(); undoPending = null; }
    return;
  }
  if (pointers.size > 2) return;
  const onHot = e.target.closest('#hot a');
  const drawing = page && !onHot;
  if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.altKey || spaceDown)) { e.preventDefault(); swipe = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, t: Date.now(), pan: true }; return; }
  if (location.hash === '#mapa' && labels && page.plate) { const [mx2, my2] = toPage(e), Lz = labelAt(mx2, my2); const nm = ((MAP[cur] || {}).zones || {})[Lz];
    toast(Lz ? (nm ? `Zone ${Lz}: ${nm}` : `Zone ${Lz}: no name yet`) : 'Black line'); if (Lz && Lz !== page.bg) flashZones([Lz]); return; }
  if (hand) { swipe = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, t: Date.now(), pan: true }; return; }
  if (drawing) {
    if (e.pointerType === 'touch') { pend = { ev: snapEv(e), moves: [], far: false, multi: false }; pend.t = setTimeout(() => firePend(false), 120); }
    else startStroke(e);
  }
  else swipe = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, t: Date.now() };
});
viewport.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture && pointers.size >= 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; const r = viewport.getBoundingClientRect();
    if (Math.abs(d - gesture.d) > 12 || Math.hypot(cx - gesture.cx, cy - gesture.cy) > 12) gesture.moved = true;
    const ns = Math.max(1, Math.min(6, gesture.s * d / gesture.d));
    const px = gesture.cx - r.left, py = gesture.cy - r.top;
    view.x = (px - gesture.x) * (1 - ns / gesture.s) + gesture.x + (cx - gesture.cx);
    view.y = (py - gesture.y) * (1 - ns / gesture.s) + gesture.y + (cy - gesture.cy);
    view.s = ns; clampView(); apply(); return;
  }
  if (pend && e.pointerId === pend.ev.pointerId) {
    pend.moves.push(snapEv(e));
    if (Math.hypot(e.clientX - pend.ev.clientX, e.clientY - pend.ev.clientY) > 12) { pend.far = true; if (!TAP_BRUSH.includes(brush)) firePend(false); }
    return;
  }
  if (stroke && e.pointerId === stroke.id) { moveStroke(e); return; }
  if (swipe) { view.x = swipe.vx + (e.clientX - swipe.x); view.y = swipe.vy + (e.clientY - swipe.y); if (view.s > 1 || swipe.pan) { clampView(); apply(); } }
});
function up(e) {
  pointers.delete(e.pointerId);
  if (pend && e.pointerId === pend.ev.pointerId) { firePend(true); if (stroke && e.pointerId === stroke.id) endStroke(); return; }
  if (gesture) { if (pointers.size < 2) { if (!gesture.moved && Date.now() - gesture.t < 300) { swap(undo, redo); toast('Undone'); } gesture = null; } return; }
  if (stroke && e.pointerId === stroke.id) endStroke();
  if (swipe) {
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.pan && view.s === 1 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) openPage(cur + (dx < 0 ? 1 : -1));
    else if (view.s === 1) { clampView(); apply(); }
    swipe = null;
  }
}
viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', e => { dropPend(); cancelStroke(); up(e); });
viewport.addEventListener('wheel', e => {
  e.preventDefault();
  if (view.s > 1 && !e.ctrlKey && !e.metaKey) { view.x -= e.deltaX; view.y -= e.deltaY; clampView(); apply(); return; }
  const r = viewport.getBoundingClientRect(); const px = e.clientX - r.left, py = e.clientY - r.top;
  const ns = Math.max(1, Math.min(6, view.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  view.x = px - (px - view.x) * ns / view.s; view.y = py - (py - view.y) * ns / view.s; view.s = ns; clampView(); apply();
}, { passive: false });

let spaceDown = false;
function zoomAt(f) {
  const vw = viewport.clientWidth, vh = viewport.clientHeight, px = vw / 2, py = vh / 2;
  const ns = Math.max(1, Math.min(6, view.s * f));
  view.x = px - (px - view.x) * ns / view.s; view.y = py - (py - view.y) * ns / view.s; view.s = ns; clampView(); apply();
}
$('#zIn').onclick = () => zoomAt(1.4);
$('#zOut').onclick = () => zoomAt(1 / 1.4);
$('#zFit').onclick = () => { view.s = 1; clampView(); apply(); };
$('#zHand').onclick = () => { hand = !hand; $('#zHand').classList.toggle('on', hand); document.body.classList.toggle('hand', hand); toast(hand ? 'Move: drag with one finger to move the plate. Tap the hand again to go back to painting' : 'Ready to paint'); };
['zIn','zOut','zFit','zHand'].forEach(id => document.getElementById(id).addEventListener('pointerdown', e => e.stopPropagation()));
viewport.addEventListener('contextmenu', e => e.preventDefault());
viewport.addEventListener('auxclick', e => e.preventDefault());
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { openPage(cur + 1); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { openPage(cur - 1); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') zoomAt(1.4);
  else if (e.key === '-') zoomAt(1 / 1.4);
  else if (e.key === ' ') { spaceDown = true; viewport.style.cursor = 'grab'; e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { (e.shiftKey ? swap(redo, undo) : swap(undo, redo)); e.preventDefault(); }
});
window.addEventListener('keyup', e => { if (e.key === ' ') { spaceDown = false; viewport.style.cursor = ''; } });
$('#btnPrev').onclick = () => openPage(cur - 1);
$('#btnNext').onclick = () => openPage(cur + 1);


/* ---------------- guardado (IndexedDB) ---------------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, ko) => { const r = indexedDB.open('atlas-muscular-en', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  return dbp;
}
async function idbGet(k) { try { const d = await db(); return await new Promise(ok => { const q = d.transaction('p').objectStore('p').get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const d = await db(); await new Promise(ok => { const t = d.transaction('p', 'readwrite'); t.objectStore('p').put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {} }
let saveT = null, dirty = false;
function queueSave() { dirty = true; clearTimeout(saveT); saveT = setTimeout(saveNow, 900); }
const toBlob = c => new Promise(ok => c.toBlob(ok, 'image/png'));
async function saveNow() {
  clearTimeout(saveT); if (!dirty || !page) { dirty = false; return; } dirty = false;
  const n = cur; const [color, ink, wipe] = await Promise.all([toBlob(cColor), toBlob(cInk), wipeUsed ? toBlob(mWipe) : null]);
  await idbSet('p' + n, { color, ink, wipe, texts: Object.assign({}, texts) }); dirtyAny = true;
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* ---------------- compartir con la marca del curso ---------------- */
function coloredShare() {
  if (!labels) return 1;
  const d = xColor.getImageData(0, 0, W, H).data; let tot = 0, col = 0;
  for (let i = 0; i < labels.length; i += 3) { const L = labels[i]; if (!L || L === page.bg) continue; tot++; if (d[i * 4 + 3] > 40) col++; }
  return tot ? col / tot : 1;
}
const SHARE_MIN = 0.5;

/* ---------------- logros: estrellas, listones y medalla ---------------- */
let DONE = store.get('done', {});
function plateCount(a, b) { let k = 0, d = 0; for (let n = a; n <= Math.min(b, N); n++) if (META[n - 1] && META[n - 1].plate) { k++; if (DONE[n]) d++; } return [d, k]; }
function isComplete() {
  if (!page || !page.plate) return false;
  if (page.nobucket) {   // lienzo libre: basta con un dibujo de verdad
    const c = xColor.getImageData(0, 0, W, H).data, k = xInk.getImageData(0, 0, W, H).data; let p = 0;
    for (let i = 3; i < c.length; i += 16) if (c[i] > 24 || k[i] > 24) p++;
    return p / (c.length / 16) > 0.06;
  }
  const rv = reviewArt(); return !rv.block.length && !rv.tips.length;
}
function checkDone(celebrate) {
  if (!page || !page.plate || !labels && !page.nobucket) return;
  const ok = isComplete(), n = cur;
  if (ok && !DONE[n]) { DONE[n] = true; store.set('done', DONE); if (celebrate) showMedal(n); }
  else if (!ok && DONE[n]) { delete DONE[n]; store.set('done', DONE); }
}
function showMedal(n) {
  const sec = SECTIONS.find(([, , a, b]) => n >= a && n <= b), [d, k] = sec ? plateCount(sec[2], sec[3]) : [0, 1];
  const unit = sec && d === k && k > 0, [bd, bk] = plateCount(1, N);
  $('#mdTitle').textContent = unit ? `${sec[0]} complete!` : 'Plate complete!';
  $('#mdText').innerHTML = unit ? `You earned the <b>${sec[0]} ribbon</b>: you carefully painted all its plates. You are an artist of the body!` : `<b>${PN[n - 1]}</b> has earned its star. You have ${d} of ${k} plates in ${sec ? sec[0] : 'the book'}.`;
  $('#mdBar').style.width = Math.round(bd / bk * 100) + '%'; $('#mdPct').textContent = `Book: ${Math.round(bd / bk * 100)}% complete`;
  $('#medal').classList.toggle('unit', !!unit); $('#medal').hidden = false; buzz(30);
  const cf = $('#mdConf'); cf.innerHTML = '';
  for (let i = 0; i < 40; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.background = ['#E0457B', '#F2C230', '#2EC4B6', '#3A86FF', '#8AC926'][i % 5]; e.style.animationDelay = Math.random() * 0.6 + 's'; e.style.transform = `rotate(${Math.random() * 360}deg)`; cf.appendChild(e); }
}
$('#mdOk').onclick = () => { $('#medal').hidden = true; };
/* ---------------- revisión de la obra antes de compartir ---------------- */
function reviewArt() {
  const rv = { block: [], tips: [], zones: [] };
  if (!labels) return rv;
  const d = xColor.getImageData(0, 0, W, H).data;
  let mx = 0; for (let i = 0; i < labels.length; i += 7) if (labels[i] > mx) mx = labels[i];
  for (let i = 0; i < labels.length; i++) if (labels[i] > mx) mx = labels[i];
  const n = mx + 1, area = new Uint32Array(n), first = new Int32Array(n).fill(-1), pnt = new Uint32Array(n), sr = new Float64Array(n), sg = new Float64Array(n), sb = new Float64Array(n), cy = new Float64Array(n), cx = new Float64Array(n);
  for (let i = 0; i < labels.length; i++) {
    const L = labels[i]; if (!L || L === page.bg) continue;
    area[L]++; cy[L] += (i / W) | 0; cx[L] += i % W; if (first[L] < 0) first[L] = i;
    if (d[i * 4 + 3] > 24) { pnt[L]++; sr[L] += d[i * 4]; sg[L] += d[i * 4 + 1]; sb[L] += d[i * 4 + 2]; }
  }
  const yb = (page.yb || 792) * PT, skip = new Uint8Array(n);
  for (let L = 1; L < n; L++) {
    if (!area[L]) { skip[L] = 1; continue; }
    const c = cy[L] / area[L];
    if (c > yb - 4 || area[L] < 400) skip[L] = 1;
    { const px = cx[L] / area[L] / PT, py = c / PT;   // bolitas, cuadros para escribir y casillas de número: no se pintan
      for (const r of [...(page.circles || []), ...(page.write || []), ...(page.lock || [])]) if (px >= r[0] - 4 && px <= r[2] + 4 && py >= r[1] - 4 && py <= r[3] + 4) skip[L] = 1; }
    if (pnt[L]) { sr[L] /= pnt[L]; sg[L] /= pnt[L]; sb[L] /= pnt[L]; }
  }
  // color de una parte que invade la de al lado
  const spill = new Uint32Array(n), D = 10;
  for (let y = D; y < H - D; y += 2) for (let x = D; x < W - D; x += 2) {
    const i = y * W + x, L = labels[i]; if (!L || skip[L] || d[i * 4 + 3] <= 24 || pnt[L] < 50) continue;
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    if (Math.abs(r - sr[L]) + Math.abs(g - sg[L]) + Math.abs(b - sb[L]) < 110) continue;
    for (const N of [labels[i - D], labels[i + D], labels[i - D * W], labels[i + D * W]]) {
      if (!N || N === L || N === page.bg || !pnt[N]) continue;
      if (Math.abs(r - sr[N]) + Math.abs(g - sg[N]) + Math.abs(b - sb[N]) < 60) { spill[L] += 4; break; }
    }
  }
  const miss = [], part = [], sp = [];
  for (let L = 1; L < n; L++) {
    if (skip[L]) continue; const cov = pnt[L] / area[L];
    if (cov < 0.15) miss.push(L); else if (cov < 0.88) part.push(L);
    else if (spill[L] / area[L] > 0.05) sp.push(L);
  }
  const pl = (k, a, b) => k === 1 ? a : b.replace('#', k);
  const zn = (MAP[cur] || {}).zones || {}, mus = new Set((MAP[cur] || {}).muscles || []);
  // con el Mapa de músculos se nombra cada parte: primero los músculos, luego los huesos
  const named = list => { const nm = [], seen = new Set(); let rest = 0;
    for (const L of list) { const t = zn[L]; if (!t) { rest++; continue; } if (!seen.has(t)) { seen.add(t); nm.push(t); } }
    nm.sort((a, b) => (mus.has(b) ? 1 : 0) - (mus.has(a) ? 1 : 0));
    if (!nm.length) return null;
    const extra = nm.length > 4 ? nm.length - 3 : 0, lst = (extra ? nm.slice(0, 3) : nm).map(t => `<b>${t}</b>`).concat(extra ? [`${extra} more parts`] : []), txt = lst.length > 1 ? lst.slice(0, -1).join(', ') + ' and ' + lst.at(-1) : lst[0];
    return rest ? `${txt} (and ${pl(rest, '1 small part', '# small parts')})` : txt; };
  const nMiss = named(miss), nPart = named(part), nSp = named(sp);
  if (nMiss) rv.block.push(`Still to paint: ${nMiss}.`);
  else if (miss.length) rv.block.push(pl(miss.length, '<b>1 part</b> of the plate still needs painting.', '<b>#</b> parts of the plate still need painting.'));
  if (nPart) rv.block.push(`Half painted: ${nPart}. Take the color all the way to the black lines.`);
  else if (part.length) rv.block.push(pl(part.length, '<b>1 part</b> is only half painted: take the color all the way to the black lines.', '<b>#</b> parts are only half painted: take the color all the way to the black lines.'));
  if (nSp) rv.block.push(`In ${nSp} the color went into the neighboring part. Clean it with the eraser or turn on <b>Stay inside</b>.`);
  else if (sp.length) rv.block.push(pl(sp.length, 'In <b>1 part</b> the color went into the neighboring part. Clean it with the eraser or turn on <b>Stay inside</b>.', 'In <b>#</b> parts the color went into the neighboring part. Clean them with the eraser or turn on <b>Stay inside</b>.'));
  rv.zones = miss.concat(part, sp);
  // lo escrito: cuadro y bolitas
  const ink = xInk.getImageData(0, 0, W, H).data;
  const hasInk = (r, key) => { if (texts[key] && String(texts[key]).trim()) return true; let c = 0;
    for (let y = r[1] * PT | 0; y < r[3] * PT; y += 2) for (let x = r[0] * PT | 0; x < r[2] * PT; x += 2) if (ink[(y * W + x) * 4 + 3] > 40 && ++c > 12) return true; return false; };
  const wr = page.write || [];
  if (wr.length === 5) {
    const nm = ['the muscle', 'the origin', 'the insertion', 'the action'], falta = nm.filter((_, i) => !hasInk(wr[i], 'w' + i));
    if (falta.length) rv.tips.push(`The table still needs ${falta.length > 1 ? falta.slice(0, -1).join(', ') + ' and ' + falta[falta.length - 1] : falta[0]}.`);
  } else if (wr.length) {
    const k = wr.filter((r, i) => !hasInk(r, 'w' + i)).length;
    if (k) rv.tips.push(pl(k, '<b>1 answer line</b> is still blank.', '<b>#</b> answer lines are still blank.'));
  }
  const ck = (page.circles || []).filter((r, i) => !hasInk(r, 'c' + i)).length;
  if (ck) rv.tips.push(pl(ck, 'The number is still missing in <b>1 circle</b>.', 'The number is still missing in <b>#</b> circles.'));
  return rv;
}
function flashZones(list) {
  if (!list.length) return;
  view.s = 1; clampView(); apply();
  const set = new Uint8Array(65536); list.forEach(L => set[L] = 1);
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.className = 'hint';
  const x = c.getContext('2d'), id = x.createImageData(W, H), D = id.data;
  for (let i = 0; i < labels.length; i++) if (set[labels[i]]) { D[i * 4] = 236; D[i * 4 + 1] = 0; D[i * 4 + 2] = 140; D[i * 4 + 3] = 150; }
  x.putImageData(id, 0, 0); stage.appendChild(c);
  setTimeout(() => c.remove(), 4600);
}
function showReview(rv) {
  const ok = !rv.block.length;
  $('#rvTitle').textContent = ok ? 'Your work is looking great!' : 'Let\'s review your work';
  $('#rvIntro').innerHTML = ok ? 'Before you share it, one last artist\'s look:' : 'To share it, your plate has to be painted with care, like a real work of art. This is what is missing:';
  $('#rvList').innerHTML = rv.block.map(t => `<li class="b">${t}</li>`).join('') + rv.tips.map(t => `<li class="t">${t}</li>`).join('');
  $('#rvNote').innerHTML = 'Compare the origin, insertion and action with the unit\'s card: that way you make sure they are right.';
  $('#rvShow').hidden = !rv.zones.length; $('#rvGo').hidden = !ok;
  $('#rvShow').onclick = () => { $('#reviewBox').hidden = true; flashZones(rv.zones); };
  $('#reviewBox').hidden = false;
}
$('#rvBack').onclick = () => { $('#reviewBox').hidden = true; };
$('#rvGo').onclick = () => { $('#reviewBox').hidden = true; SH.passed = true; $('#btnShare').onclick(); };
$('#reviewBox').addEventListener('pointerdown', e => { if (e.target.id === 'reviewBox') $('#reviewBox').hidden = true; });

/* ---------------- compartir: su obra firmada, en el estilo que elija ---------------- */
const SHARE_STYLES = [
  ['atril', 'Easel', 'Wood and linen'],
  ['oleo', 'Oil paint', 'Canvas and gold frame'],
  ['acuarela', 'Watercolor', 'Cotton paper'],
  ['marcador', 'Markers', 'Bold strokes'],
  ['tiza', 'Chalk', 'On the chalkboard'],
  ['grafito', 'Graphite', 'Pencil on paper'],
  ['comic', 'Comic', 'Comic book page'],
  ['digital', 'Digital', 'Screen colors'],
  ['limpio', 'Clean', 'The plate as is']
];
const SH = { cache: {}, logo: null, style: store.get('shareStyle', 'atril'), busy: false };
const mkC = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
const cl01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
/* ruido suave (0..1) con celdas de tamaño cx × cy */
function noiseF(w, h, cx, cy, seed) {
  const gw = Math.max(2, Math.ceil(w / Math.max(1, cx)) + 1), gh = Math.max(2, Math.ceil(h / Math.max(1, cy)) + 1);
  const g = mkC(gw, gh), gx = g.getContext('2d'), id = gx.createImageData(gw, gh), R = rng(seed);
  for (let i = 0; i < id.data.length; i += 4) { const v = R() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  gx.putImageData(id, 0, 0);
  const c = mkC(w, h), x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(g, 0, 0, gw * Math.max(1, cx), gh * Math.max(1, cy));
  const d = x.getImageData(0, 0, w, h).data, o = new Float32Array(w * h);
  for (let i = 0, j = 0; j < o.length; i += 4, j++) o[j] = d[i] / 255;
  return o;
}
function blur1(a, w, h, r) {
  r = Math.round(r); if (r < 1) return a;
  const t = new Float32Array(a.length), o = new Float32Array(a.length), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) { const off = y * w; let s = 0; for (let i = -r; i <= r; i++) s += a[off + Math.min(w - 1, Math.max(0, i))]; for (let x = 0; x < w; x++) { t[off + x] = s * k; s += a[off + Math.min(w - 1, x + r + 1)] - a[off + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += t[Math.min(h - 1, Math.max(0, i)) * w + x]; for (let y = 0; y < h; y++) { o[y * w + x] = s * k; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}
const blur2 = (a, w, h, r) => blur1(blur1(a, w, h, r), w, h, r);
function chan(D, n, c) { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = D[i * 4 + c] / 255; return o; }
function minRGB(D, w, h) {   // engrosa las líneas un píxel
  const o = new Uint8ClampedArray(D.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; let r = 255, g = 255, b = 255;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const j = (yy * w + xx) * 4; if (D[j] < r) r = D[j]; if (D[j + 1] < g) g = D[j + 1]; if (D[j + 2] < b) b = D[j + 2]; } }
    o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255;
  }
  return o;
}
/* capas de la lámina a escala s: color, líneas (con escritura y marca) y figuras de arriba */
async function shareLayers(s) {
  if (SH.cache[s]) return SH.cache[s];
  const w = Math.round(W * s), h = Math.round(H * s);
  const col = mkC(w, h), cx = col.getContext('2d'); cx.drawImage(cColor, 0, 0, w, h);
  const lin = mkC(w, h), x = lin.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.setTransform(s, 0, 0, s, 0, 0);
  x.drawImage(pageImg, 0, 0, W, H); if (wipeUsed) x.drawImage(cWipe, 0, 0);
  x.save(); x.globalAlpha = 0.06; x.fillStyle = '#3F4A57'; x.font = '600 34px Montserrat, sans-serif'; x.textAlign = 'center';
  x.translate(W / 2, H / 2); x.rotate(-Math.PI / 6);
  for (let yy = -H, r = 0; yy <= H; yy += 200, r++) for (let xx = -W * 1.2; xx <= W * 1.2; xx += 820) x.fillText('MUSCLE ATLAS · BALANCED BODY', xx + (r % 2 ? 410 : 0), yy);
  x.restore();
  x.drawImage(cInk, 0, 0);
  x.save(); x.globalAlpha = 0.55; x.fillStyle = '#3F4A57'; x.font = '500 20px Montserrat, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'bottom';
  x.fillText('Muscle Atlas · Digital Coloring Book · © Balanced Body', W / 2, H - 14); x.restore();
  for (const [key, v] of Object.entries(texts)) {
    const r = zoneRect(key); if (!r) continue; const hpt = (r[3] - r[1]) * PT;
    x.fillStyle = '#1F3B73'; x.font = `600 ${key[0] === 'c' ? hpt * .75 : Math.min(hpt * .62, 40)}px Caveat, cursive`;
    x.textBaseline = 'middle'; x.textAlign = key[0] === 'c' ? 'center' : 'left';
    x.fillText(v, key[0] === 'c' ? (r[0] + r[2]) * PT / 2 : r[0] * PT + 8, (r[1] + r[3]) * PT / 2, (r[2] - r[0]) * PT - 12);
  }
  let top = null; if (page.top) { top = mkC(w, h); top.getContext('2d').drawImage(cTop, 0, 0, w, h); }
  const L = { w, h, s, C: cx.getImageData(0, 0, w, h).data, L: x.getImageData(0, 0, w, h).data, top };
  SH.cache[s] = L; return L;
}
function sat(r, g, b, f) { const l = 0.299 * r + 0.587 * g + 0.114 * b; return [l + (r - l) * f, l + (g - l) * f, l + (b - l) * f]; }
/* filtro de óleo (Kuwahara) con imágenes integrales */
function kuwahara(D, w, h, r) {
  const W1 = w + 1, n = W1 * (h + 1), SR = new Float64Array(n), SG = new Float64Array(n), SB = new Float64Array(n), SL = new Float64Array(n), SQ = new Float64Array(n);
  for (let y = 0; y < h; y++) { let ar = 0, ag = 0, ab = 0, al = 0, aq = 0; for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, R = D[i], G = D[i + 1], B = D[i + 2], l = 0.299 * R + 0.587 * G + 0.114 * B;
    ar += R; ag += G; ab += B; al += l; aq += l * l; const k = (y + 1) * W1 + x + 1, u = y * W1 + x + 1;
    SR[k] = SR[u] + ar; SG[k] = SG[u] + ag; SB[k] = SB[u] + ab; SL[k] = SL[u] + al; SQ[k] = SQ[u] + aq; } }
  const o = new Uint8ClampedArray(D.length);
  const box = (A, x0, y0, x1, y1) => A[(y1 + 1) * W1 + x1 + 1] - A[y0 * W1 + x1 + 1] - A[(y1 + 1) * W1 + x0] + A[y0 * W1 + x0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 1e18, br = 0, bg = 0, bb = 0;
    for (let q = 0; q < 4; q++) {
      const x0 = Math.max(0, q & 1 ? x : x - r), x1 = Math.min(w - 1, q & 1 ? x + r : x), y0 = Math.max(0, q & 2 ? y : y - r), y1 = Math.min(h - 1, q & 2 ? y + r : y);
      const cnt = (x1 - x0 + 1) * (y1 - y0 + 1), m = box(SL, x0, y0, x1, y1) / cnt, v = box(SQ, x0, y0, x1, y1) / cnt - m * m;
      if (v < best) { best = v; br = box(SR, x0, y0, x1, y1) / cnt; bg = box(SG, x0, y0, x1, y1) / cnt; bb = box(SB, x0, y0, x1, y1) / cnt; }
    }
    const i = (y * w + x) * 4; o[i] = br; o[i + 1] = bg; o[i + 2] = bb; o[i + 3] = 255;
  }
  return o;
}
/* pinta la lámina en el estilo elegido */
function styleArt(st, Ly) {
  const { w, h, s, C, L } = Ly, n = w * h, out = mkC(w, h), ox = out.getContext('2d'), id = ox.createImageData(w, h), O = id.data;
  const R = rng(cur * 7919 + 13);
  const A = new Float32Array(n); for (let i = 0; i < n; i++) A[i] = C[i * 4 + 3] / 255;
  const put = (i, r, g, b) => { O[i] = r; O[i + 1] = g; O[i + 2] = b; O[i + 3] = 255; };
  if (st === 'atril' || st === 'limpio' || st === 'digital') {
    const f = st === 'digital' ? 1.3 : 1;
    for (let j = 0, i = 0; j < n; j++, i += 4) {
      const a = A[j]; let [cr, cg, cb] = f !== 1 ? sat(C[i], C[i + 1], C[i + 2], f) : [C[i], C[i + 1], C[i + 2]];
      let r = 255 * (1 - a + a * cr / 255), g = 255 * (1 - a + a * cg / 255), b = 255 * (1 - a + a * cb / 255);
      if (st === 'digital') { r = (r - 128) * 1.08 + 132; g = (g - 128) * 1.08 + 132; b = (b - 128) * 1.08 + 132; }
      put(i, r * L[i] / 255, g * L[i + 1] / 255, b * L[i + 2] / 255);
    }
  } else if (st === 'oleo') {
    const hs = s > 0.5 ? 0.5 : 1, ww = Math.round(w * hs), hh = Math.round(h * hs);
    const base = mkC(w, h), bx = base.getContext('2d'), bd = bx.createImageData(w, h), B = bd.data;
    for (let j = 0, i = 0; j < n; j++, i += 4) { const a = A[j]; const [cr, cg, cb] = sat(C[i], C[i + 1], C[i + 2], 1.18);
      B[i] = 246 * (1 - a + a * cr / 255); B[i + 1] = 239 * (1 - a + a * cg / 255); B[i + 2] = 224 * (1 - a + a * cb / 255); B[i + 3] = 255; }
    bx.putImageData(bd, 0, 0);
    const sm = mkC(ww, hh), sx = sm.getContext('2d'); sx.drawImage(base, 0, 0, ww, hh);
    const kd = sx.createImageData(ww, hh); kd.data.set(kuwahara(sx.getImageData(0, 0, ww, hh).data, ww, hh, Math.max(1, Math.round(8 * s * hs)))); sx.putImageData(kd, 0, 0);
    bx.imageSmoothingQuality = 'high'; bx.drawImage(sm, 0, 0, w, h); const K = bx.getImageData(0, 0, w, h).data;
    const hz = noiseF(w, h, 46 * s, 3 * s + 0.5, cur + 1), vt = noiseF(w, h, 3 * s + 0.5, 46 * s, cur + 2), mx = noiseF(w, h, 140 * s, 140 * s, cur + 3);
    let Hh = new Float32Array(n); for (let j = 0; j < n; j++) { const m = cl01((mx[j] - 0.3) * 2.5); Hh[j] = m * hz[j] + (1 - m) * vt[j]; }
    Hh = blur1(Hh, w, h, Math.max(1, 1.5 * s));
    const Ab = blur1(A, w, h, 2 * s), Lb = s > 0.5 ? [blur1(chan(L, n, 0), w, h, 1), blur1(chan(L, n, 1), w, h, 1), blur1(chan(L, n, 2), w, h, 1)] : [chan(L, n, 0), chan(L, n, 1), chan(L, n, 2)];
    const cv = noiseF(w, h, Math.max(1, 2.2 * s), Math.max(1, 2.2 * s), cur + 14);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, i = j * 4, a = Ab[j];
      const nb = Hh[Math.max(0, j - w - 1)] - Hh[Math.min(n - 1, j + w + 1)];
      const sh = 1 + nb * 0.9 * a;
      const weave = 0.955 + 0.045 * cv[j];
      const lf = k => 1 - (1 - Lb[k][j]) * 0.86;
      put(i, K[i] * sh * weave * lf(0) * 1.02, K[i + 1] * sh * weave * lf(1), K[i + 2] * sh * weave * lf(2) * 0.95);
    }
  } else if (st === 'acuarela') {
    const r1 = Math.max(1, 2 * s), A2 = blur2(A, w, h, r1), Ab = blur2(A, w, h, Math.max(1, 6 * s));
    const PR = new Float32Array(n), PG = new Float32Array(n), PB = new Float32Array(n);
    for (let j = 0, i = 0; j < n; j++, i += 4) { PR[j] = A[j] * C[i]; PG[j] = A[j] * C[i + 1]; PB[j] = A[j] * C[i + 2]; }
    const BR = blur2(PR, w, h, r1), BG = blur2(PG, w, h, r1), BB = blur2(PB, w, h, r1);
    const g1 = noiseF(w, h, Math.max(1, 3 * s), Math.max(1, 3 * s), cur + 4), g2 = noiseF(w, h, 26 * s + 1, 26 * s + 1, cur + 5), g3 = noiseF(w, h, 90 * s + 1, 90 * s + 1, cur + 6);
    const Lr = s > 0.5 ? blur1(chan(L, n, 0), w, h, 1) : chan(L, n, 0), Lg = s > 0.5 ? blur1(chan(L, n, 1), w, h, 1) : chan(L, n, 1), Lbb = s > 0.5 ? blur1(chan(L, n, 2), w, h, 1) : chan(L, n, 2);
    for (let j = 0, i = 0; j < n; j++, i += 4) {
      const a = A2[j], edge = cl01((A[j] - Ab[j]) * 3.2), d = a > 0.003 ? 1 / Math.max(a, 0.003) : 0;
      const cr = a > 0.003 ? BR[j] * d : 255, cg = a > 0.003 ? BG[j] * d : 255, cb = a > 0.003 ? BB[j] * d : 255;
      const stg = cl01(a * (0.62 + 0.22 * g2[j] + 0.16 * g3[j]) * (0.9 + 0.1 * g1[j]) + edge * 0.38 * A[j]);
      const paper = 0.95 + 0.05 * g1[j];
      const lf = v => 1 - (1 - v) * 0.7;
      put(i, 251 * paper * (1 - stg * (1 - cr / 255)) * lf(Lr[j]), 248 * paper * (1 - stg * (1 - cg / 255)) * lf(Lg[j]), 240 * paper * (1 - stg * (1 - cb / 255)) * lf(Lbb[j]));
    }
  } else if (st === 'marcador') {
    const Ab = blur2(A, w, h, Math.max(1, 2 * s)), nl = noiseF(w, h, 30 * s + 1, 30 * s + 1, cur + 7), sp = Math.max(4, 16 * s);
    const LL = s > 0.9 ? minRGB(L, w, h) : L;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, i = j * 4, a = A[j];
      const [cr, cg, cb] = sat(C[i], C[i + 1], C[i + 2], 1.28);
      const stripe = 0.84 + 0.16 * (0.5 + 0.5 * Math.sin((x + y) * 6.283 / sp + nl[j] * 5));
      const edge = cl01((a - Ab[j]) * 4) * 0.28, st2 = cl01(a * stripe + edge);
      const dk = 1 - edge * 0.6;
      put(i, 255 * (1 - st2 * (1 - cr * dk / 255)) * LL[i] / 255, 255 * (1 - st2 * (1 - cg * dk / 255)) * LL[i + 1] / 255, 255 * (1 - st2 * (1 - cb * dk / 255)) * LL[i + 2] / 255);
    }
  } else if (st === 'tiza') {
    const n1 = noiseF(w, h, 90 * s + 1, 90 * s + 1, cur + 8), n2 = noiseF(w, h, 18 * s + 1, 18 * s + 1, cur + 9), sm = noiseF(w, h, 220 * s + 1, 60 * s + 1, cur + 10);
    for (let j = 0, i = 0; j < n; j++, i += 4) {
      const bv = 0.86 + 0.14 * n1[j] + 0.12 * cl01((sm[j] - 0.55) * 3);
      let r = 40 * bv, g = 55 * bv, b = 49 * bv;
      const a = A[j];
      if (a > 0.01) { const k = a * (0.55 + 0.45 * R()) * (0.75 + 0.25 * n2[j]) * 0.9;
        const pr = C[i] * 0.68 + 255 * 0.32, pg = C[i + 1] * 0.68 + 255 * 0.32, pb = C[i + 2] * 0.68 + 255 * 0.32;
        r = r * (1 - k) + pr * k; g = g * (1 - k) + pg * k; b = b * (1 - k) + pb * k; }
      const dl = 1 - (0.299 * L[i] + 0.587 * L[i + 1] + 0.114 * L[i + 2]) / 255;
      if (dl > 0.02) { const k = cl01(dl * 1.25) * (0.62 + 0.38 * R()); r = r * (1 - k) + 242 * k; g = g * (1 - k) + 241 * k; b = b * (1 - k) + 232 * k; }
      put(i, r, g, b);
    }
  } else if (st === 'grafito') {
    const gr = noiseF(w, h, Math.max(1, 2 * s), Math.max(1, 2 * s), cur + 11), sp = Math.max(2.2, 6 * s);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, i = j * 4, a = A[j];
      const lumC = (0.299 * C[i] + 0.587 * C[i + 1] + 0.114 * C[i + 2]) / 255;
      const k = cl01(a * (1 - lumC) * 1.35 + a * 0.1);
      const h1 = 0.5 + 0.5 * Math.cos((x + y) * 6.283 / sp), h2 = 0.5 + 0.5 * Math.cos((x - y) * 6.283 / sp);
      let dark = k * (0.5 + 0.5 * h1); if (k > 0.42) dark += (k - 0.42) / 0.58 * h2 * 0.6;
      dark = cl01(dark) * (0.72 + 0.28 * gr[j]);
      const dl = 1 - (0.299 * L[i] + 0.587 * L[i + 1] + 0.114 * L[i + 2]) / 255, lf = 1 - cl01(dl * 1.1) * 0.86 * (0.85 + 0.15 * gr[j]);
      const p = (0.965 + 0.035 * gr[j]) * (1 - dark * 0.78) * lf;
      put(i, 247 * p * 0.985, 245 * p * 0.985, 240 * p);
    }
  } else if (st === 'comic') {
    const sp = Math.max(3.2, 9 * s), ang = [15, 75, 0].map(d => [Math.cos(d * Math.PI / 180), Math.sin(d * Math.PI / 180)]);
    const LL = L, yl = noiseF(w, h, 160 * s + 1, 160 * s + 1, cur + 12);
    const dot = (x, y, k, v) => { if (v <= 0.01) return 0; const [c, sn] = ang[k], u = (x * c + y * sn) / sp, t = (-x * sn + y * c) / sp;
      const fu = u - Math.round(u), ft = t - Math.round(t), d = Math.sqrt(fu * fu + ft * ft), rr = Math.sqrt(v / Math.PI) * 1.05; return cl01((rr - d) * sp * 0.9 + 0.5); };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const j = y * w + x, i = j * 4, a = A[j];
      let [cr, cg, cb] = sat(C[i], C[i + 1], C[i + 2], 1.55);
      const c = a * cl01(1 - cr / 255), m = a * cl01(1 - cg / 255), yv = a * cl01(1 - cb / 255);
      const C1 = dot(x, y, 0, c), M1 = dot(x, y, 1, m), Y1 = dot(x, y, 2, yv);
      const py = 0.97 + 0.03 * yl[j];
      const l = (0.299 * LL[i] + 0.587 * LL[i + 1] + 0.114 * LL[i + 2]) / 255, lk = l < 0.5 ? 0.05 + l * 0.3 : cl01(0.2 + (l - 0.5) * 1.6);
      put(i, 253 * py * (1 - 0.88 * C1) * lk, 246 * py * (1 - 0.86 * M1) * lk, 226 * py * (1 - 0.9 * Y1) * lk);
    }
  }
  ox.putImageData(id, 0, 0);
  if (Ly.top) {   // las figuras blancas de arriba toman el tono del papel de cada estilo
    const tone = { comic: '#FBF0D2', oleo: '#F3EBD8', acuarela: '#FAF6EC', grafito: '#F4F2EC', atril: '#FBF8F1' }[st];
    let tp = Ly.top;
    if (tone) { tp = mkC(w, h); const tx = tp.getContext('2d'); tx.drawImage(Ly.top, 0, 0); tx.globalCompositeOperation = 'multiply'; tx.fillStyle = tone; tx.fillRect(0, 0, w, h); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(Ly.top, 0, 0);
      if (st === 'comic' || st === 'grafito' || st === 'acuarela') { const g = noiseF(w, h, Math.max(1, 2 * s), Math.max(1, 2 * s), cur + 21), gd = tx.getImageData(0, 0, w, h), D = gd.data;
        for (let j = 0, i = 0; j < n; j++, i += 4) { const k = 0.955 + 0.045 * g[j]; D[i] *= k; D[i + 1] *= k; D[i + 2] *= k; } tx.putImageData(gd, 0, 0); } }
    ox.globalAlpha = st === 'tiza' ? 0.85 : 1; ox.drawImage(tp, 0, 0); ox.globalAlpha = 1;
  }
  return out;
}
/* ---- texturas y piezas del marco ---- */
function woodTex(len, th, s, seed, base, grainK = 1) {
  const c = mkC(len, th), x = c.getContext('2d'), R = rng(seed);
  const g = x.createLinearGradient(0, 0, 0, th), [r0, g0, b0] = base, cs = f => `rgb(${r0 * f | 0},${g0 * f | 0},${b0 * f | 0})`;
  g.addColorStop(0, cs(0.78)); g.addColorStop(0.18, cs(1.0)); g.addColorStop(0.5, cs(1.06)); g.addColorStop(0.82, cs(0.96)); g.addColorStop(1, cs(0.74));
  x.fillStyle = g; x.fillRect(0, 0, len, th);
  const lines = Math.max(6, th / Math.max(1.5, 3 * s)) * grainK | 0;
  for (let k = 0; k < lines; k++) {
    const y0 = R() * th, amp = (1 + R() * 4) * s, f1 = (0.002 + R() * 0.006) / Math.max(s, 0.2), ph = R() * 6.3;
    x.beginPath(); for (let px = 0; px <= len; px += Math.max(2, 8 * s)) x.lineTo(px, y0 + Math.sin(px * f1 + ph) * amp + Math.sin(px * f1 * 3.1 + ph * 2) * amp * 0.3);
    const dk = R() < 0.72; x.strokeStyle = dk ? `rgba(60,30,10,${0.08 + R() * 0.2})` : `rgba(255,225,180,${0.05 + R() * 0.12})`; x.lineWidth = (0.5 + R() * 2) * Math.max(s, 0.4); x.stroke();
  }
  return c;
}
function woodBar(x, x1, y1, x2, y2, th, s, seed, base) {
  const len = Math.hypot(x2 - x1, y2 - y1), t = woodTex(len, th, s, seed, base);
  x.save(); x.translate(x1, y1); x.rotate(Math.atan2(y2 - y1, x2 - x1));
  x.shadowColor = 'rgba(40,25,10,.35)'; x.shadowBlur = 18 * s; x.shadowOffsetY = 6 * s;
  x.drawImage(t, 0, -th / 2); x.restore();
}
let LINEN = null;
function linenPat(x, s, light) {
  if (!LINEN) LINEN = {};
  const key = light ? 'l' : 'm';
  if (!LINEN[key]) {
    const sz = 240, c = mkC(sz, sz), t = c.getContext('2d'), R = rng(light ? 91 : 77);
    t.fillStyle = light ? '#F7F2E7' : '#E3D8C3'; t.fillRect(0, 0, sz, sz);
    for (let y = 0; y < sz; y++) { t.fillStyle = R() < 0.5 ? `rgba(120,100,70,${R() * (light ? 0.07 : 0.14)})` : `rgba(255,255,250,${R() * (light ? 0.1 : 0.16)})`; t.fillRect(0, y, sz, 1); }
    for (let xx = 0; xx < sz; xx++) { t.fillStyle = R() < 0.5 ? `rgba(120,100,70,${R() * (light ? 0.06 : 0.12)})` : `rgba(255,255,250,${R() * (light ? 0.08 : 0.14)})`; t.fillRect(xx, 0, 1, sz); }
    for (let k = 0; k < 70; k++) { t.fillStyle = `rgba(110,90,60,${R() * (light ? 0.08 : 0.16)})`; if (R() < 0.5) t.fillRect(R() * sz, R() * sz, 8 + R() * 30, 1.4); else t.fillRect(R() * sz, R() * sz, 1.4, 8 + R() * 30); }
    LINEN[key] = c;
  }
  const p = x.createPattern(LINEN[key], 'repeat'); const k = Math.max(0.35, s * 1.3);
  if (p.setTransform) p.setTransform(new DOMMatrix().scaleSelf(k, k)); return p;
}
function tinted(img, color) { const c = mkC(img.width, img.height), t = c.getContext('2d'); t.drawImage(img, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = color; t.fillRect(0, 0, c.width, c.height); return c; }
/* pie: logo y nombre del libro, centrados; engraved = tallado en madera */
function caption(x, cx, cy, maxW, s, col, mode) {
  const L1 = 'MUSCLE ATLAS · DIGITAL COLORING BOOK', L2 = 'Anatomy + Movement™ · 2026 Digital Edition';
  let f1 = 30 * s, f2 = 21 * s; const lh = 46 * s, logo = SH.logo, lw = logo ? lh * logo.width / logo.height : 0, gap = 26 * s;
  const meas = () => { x.font = `700 ${f1}px Montserrat, sans-serif`; const a = x.measureText(L1).width; x.font = `500 ${f2}px Montserrat, sans-serif`; return Math.max(a, x.measureText(L2).width); };
  let tw = meas(); while (lw + gap + tw > maxW && f1 > 6) { f1 *= 0.94; f2 *= 0.94; tw = meas(); }
  const x0 = cx - (lw + gap + tw) / 2, tx = x0 + lw + gap;
  const draw = (dx, dy, c, a) => {
    x.save(); x.globalAlpha = a; x.translate(dx, dy);
    if (logo) x.drawImage(tinted(logo, c), x0, cy - lh / 2, lw, lh);
    x.fillStyle = c; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    x.font = `700 ${f1}px Montserrat, sans-serif`; x.fillText(L1, tx, cy - 2 * s);
    x.font = `500 ${f2}px Montserrat, sans-serif`; x.fillText(L2, tx, cy + f2 + 4 * s); x.restore();
  };
  if (mode === 'engraved') { draw(0, 1.6 * s, 'rgba(255,232,190,1)', 0.35); draw(0, 0, col, 0.82); }
  else draw(0, 0, col, 1);
}
function frameSides(x, x0, y0, bw, bh, fw) {
  return [
    [[x0, y0], [x0 + bw, y0], [x0 + bw - fw, y0 + fw], [x0 + fw, y0 + fw]],
    [[x0, y0 + bh], [x0 + bw, y0 + bh], [x0 + bw - fw, y0 + bh - fw], [x0 + fw, y0 + bh - fw]],
    [[x0, y0], [x0 + fw, y0 + fw], [x0 + fw, y0 + bh - fw], [x0, y0 + bh]],
    [[x0 + bw, y0], [x0 + bw - fw, y0 + fw], [x0 + bw - fw, y0 + bh - fw], [x0 + bw, y0 + bh]]
  ];
}
function drawFrame(x, x0, y0, bw, bh, fw, s, kind, seed) {
  const sides = frameSides(x, x0, y0, bw, bh, fw), poly = p => { x.beginPath(); p.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); };
  x.save(); x.shadowColor = 'rgba(30,20,10,.45)'; x.shadowBlur = 40 * s; x.shadowOffsetY = 16 * s; x.fillStyle = '#5a3d22';
  x.fillRect(x0, y0, bw, bh); x.restore();
  const base = { walnut: [128, 82, 48], oak: [196, 158, 112], dark: [92, 62, 38] }[kind];
  sides.forEach((p, k) => {
    x.save(); poly(p); x.clip();
    if (kind === 'gold') {
      const hor = k < 2, g = hor ? x.createLinearGradient(0, k ? y0 + bh : y0, 0, k ? y0 + bh - fw : y0 + fw) : x.createLinearGradient(k === 2 ? x0 : x0 + bw, 0, k === 2 ? x0 + fw : x0 + bw - fw, 0);
      [['#5E4110', 0], ['#C99A3B', .12], ['#F6DE8E', .22], ['#9A6E22', .36], ['#E3BE62', .5], ['#7A561A', .62], ['#F2D27C', .76], ['#A77A2A', .88], ['#4F370D', 1]].forEach(([c, o]) => g.addColorStop(o, c));
      x.fillStyle = g; x.fillRect(x0, y0, bw, bh);
      x.fillStyle = 'rgba(80,55,10,.12)'; const R = rng(seed + k); for (let i = 0; i < 900 * Math.max(s, .2); i++) x.fillRect(x0 + R() * bw, y0 + R() * bh, 2 * s + .5, 2 * s + .5);
    } else {
      const len = k < 2 ? bw : bh, t = woodTex(len, fw, s, seed + k * 17, base);
      if (k < 2) x.drawImage(t, x0, k ? y0 + bh - fw : y0);
      else { x.translate(k === 2 ? x0 + fw : x0 + bw, y0); x.rotate(Math.PI / 2); x.drawImage(t, 0, 0); }
    }
    x.restore();
    poly(p); x.fillStyle = ['rgba(255,240,210,.14)', 'rgba(0,0,0,.2)', 'rgba(255,240,210,.06)', 'rgba(0,0,0,.12)'][k]; x.fill();
  });
  // molduras: líneas de luz y sombra
  const ins = (d, c, lw) => { x.strokeStyle = c; x.lineWidth = lw; x.strokeRect(x0 + d, y0 + d, bw - 2 * d, bh - 2 * d); };
  ins(1 * s, 'rgba(25,15,5,.55)', 2 * s); ins(fw * 0.22, 'rgba(255,240,200,.28)', 2.2 * s); ins(fw * 0.6, 'rgba(30,18,6,.35)', 2.4 * s); ins(fw * 0.64, 'rgba(255,240,200,.18)', 1.2 * s); ins(fw - 1.5 * s, 'rgba(20,12,4,.6)', 3 * s);
  if (kind === 'gold') {   // perlas de la moldura dorada
    const step = 22 * s, rr = 5.5 * s, d = fw * 0.42;
    const bead = (px, py) => { const g = x.createRadialGradient(px - rr * .35, py - rr * .35, rr * .1, px, py, rr); g.addColorStop(0, '#FFF2C0'); g.addColorStop(.5, '#D9AE52'); g.addColorStop(1, '#6B4A12'); x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 6.283); x.fill(); };
    for (let px = x0 + d; px <= x0 + bw - d; px += step) { bead(px, y0 + d); bead(px, y0 + bh - d); }
    for (let py = y0 + d + step; py < y0 + bh - d; py += step) { bead(x0 + d, py); bead(x0 + bw - d, py); }
  }
}
function innerShadow(x, ix, iy, iw, ih, s, k = 1) {
  const e = 26 * s, mk = (a, b, c, d, x1, y1, x2, y2, al) => { const g = x.createLinearGradient(x1, y1, x2, y2); g.addColorStop(0, `rgba(0,0,0,${al})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(a, b, c, d); };
  mk(ix, iy, iw, e, 0, iy, 0, iy + e, 0.32 * k); mk(ix, iy, e, ih, ix, 0, ix + e, 0, 0.22 * k); mk(ix + iw - e, iy, e, ih, ix + iw, 0, ix + iw - e, 0, 0.12 * k); mk(ix, iy + ih - e, iw, e, 0, iy + ih, 0, iy + ih - e, 0.08 * k);
}
/* escenas */
function sceneEasel(art, s, gold) {
  const w = art.width, h = art.height, fw = (gold ? 96 : 62) * s, mat = gold ? 0 : 72 * s;
  const bw = w + 2 * (mat + fw), bh = h + 2 * (mat + fw), M = 260 * s, T = 200 * s, LG = 176 * s, B = 330 * s;
  const CW = bw + 2 * M, CH = T + bh + LG + B, c = mkC(CW, CH), x = c.getContext('2d'), cx = CW / 2, floorY = CH - 210 * s;
  let g = x.createLinearGradient(0, 0, 0, floorY); g.addColorStop(0, '#EEE7DA'); g.addColorStop(1, '#D6C9B3'); x.fillStyle = g; x.fillRect(0, 0, CW, floorY);
  g = x.createLinearGradient(0, floorY, 0, CH); g.addColorStop(0, '#A98D6B'); g.addColorStop(1, '#8A6E4F'); x.fillStyle = g; x.fillRect(0, floorY, CW, CH - floorY);
  x.fillStyle = 'rgba(60,40,20,.25)'; x.fillRect(0, floorY, CW, 3 * s);
  g = x.createRadialGradient(cx, CH * 0.42, CW * 0.15, cx, CH * 0.45, CW * 0.85); g.addColorStop(0, 'rgba(255,250,235,.35)'); g.addColorStop(1, 'rgba(60,40,20,.28)'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  const wood = [178, 132, 86], footY = CH - 120 * s, lx = cx - bw / 2 - 150 * s, rx = cx + bw / 2 + 150 * s;
  for (const fx of [lx, rx, cx]) { x.fillStyle = 'rgba(40,25,10,.28)'; x.beginPath(); x.ellipse(fx, footY + 8 * s, 70 * s, 14 * s, 0, 0, 6.283); x.fill(); }
  woodBar(x, cx, 34 * s, cx, footY + 4 * s, 78 * s, s, 301, wood.map(v => v * 0.86));
  woodBar(x, cx - 60 * s, 80 * s, lx, footY, 68 * s, s, 302, wood);
  woodBar(x, cx + 60 * s, 80 * s, rx, footY, 68 * s, s, 303, wood);
  const cy2 = footY - 250 * s, t2 = (cy2 - 80 * s) / (footY - 80 * s), xl = cx - 60 * s + (lx - cx + 60 * s) * t2, xr = cx + 60 * s + (rx - cx - 60 * s) * t2;
  woodBar(x, xl, cy2, xr, cy2, 44 * s, s, 304, wood);
  const x0 = cx - bw / 2, y0 = T;
  drawFrame(x, x0, y0, bw, bh, fw, s, gold ? 'gold' : 'walnut', 400 + cur);
  const ix = x0 + fw, iy = y0 + fw, iw = bw - 2 * fw, ih = bh - 2 * fw;
  if (!gold) {
    x.fillStyle = linenPat(x, s, false); x.fillRect(ix, iy, iw, ih); innerShadow(x, ix, iy, iw, ih, s);
    x.fillStyle = '#F6F0E3'; x.fillRect(ix + mat - 7 * s, iy + mat - 7 * s, w + 14 * s, h + 14 * s);
    x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(ix + mat - 7 * s, iy + mat + h, w + 14 * s, 7 * s); x.fillRect(ix + mat + w, iy + mat - 7 * s, 7 * s, h + 14 * s);
  }
  x.drawImage(art, ix + mat, iy + mat);
  if (!gold) { x.save(); x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.6; x.fillStyle = linenPat(x, s, true); x.fillRect(ix + mat, iy + mat, w, h); x.restore(); }
  innerShadow(x, ix + mat, iy + mat, w, h, s, gold ? 1 : 0.55);
  // repisa del atril
  const yL = y0 + bh - 6 * s, lw2 = bw + 170 * s, lx0 = cx - lw2 / 2, top = 34 * s;
  x.save(); x.shadowColor = 'rgba(30,20,10,.4)'; x.shadowBlur = 26 * s; x.shadowOffsetY = 12 * s; x.fillStyle = '#6b4a2c'; x.fillRect(lx0, yL, lw2, LG); x.restore();
  x.drawImage(woodTex(lw2, top, s, 501, wood.map(v => v * 1.08)), lx0, yL);
  x.drawImage(woodTex(lw2, LG - top, s, 502, wood), lx0, yL + top);
  x.fillStyle = 'rgba(255,240,210,.35)'; x.fillRect(lx0, yL + top - 1.5 * s, lw2, 2 * s); x.fillStyle = 'rgba(30,15,5,.35)'; x.fillRect(lx0, yL + top + 1 * s, lw2, 2 * s); x.fillRect(lx0, yL + LG - 3 * s, lw2, 3 * s);
  caption(x, cx, yL + top + (LG - top) / 2 - 6 * s, lw2 - 160 * s, s, 'rgb(52,30,12)', 'engraved');
  // mordaza superior del atril
  x.save(); x.shadowColor = 'rgba(30,20,10,.4)'; x.shadowBlur = 14 * s; x.shadowOffsetY = 5 * s;
  x.drawImage(woodTex(130 * s, 86 * s, s, 503, wood.map(v => v * 0.95)), cx - 65 * s, y0 - 48 * s); x.restore();
  return c;
}
function sceneWall(art, s) {
  const w = art.width, h = art.height, fw = 34 * s, mat = 150 * s, bw = w + 2 * (mat + fw), bh = h + 2 * (mat + fw), M = 200 * s, T = 170 * s, B = 330 * s;
  const CW = bw + 2 * M, CH = T + bh + B, c = mkC(CW, CH), x = c.getContext('2d'), cx = CW / 2;
  let g = x.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#F1EEE8'); g.addColorStop(1, '#DCD6CB'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  g = x.createRadialGradient(cx, T * 0.4, 30 * s, cx, T + bh * 0.4, CW * 0.8); g.addColorStop(0, 'rgba(255,252,240,.6)'); g.addColorStop(1, 'rgba(0,0,0,.12)'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  const x0 = cx - bw / 2, y0 = T; drawFrame(x, x0, y0, bw, bh, fw, s, 'oak', 600 + cur);
  const ix = x0 + fw, iy = y0 + fw, iw = bw - 2 * fw, ih = bh - 2 * fw;
  x.fillStyle = '#FBF9F4'; x.fillRect(ix, iy, iw, ih); x.save(); x.globalAlpha = .5; x.fillStyle = linenPat(x, s, true); x.fillRect(ix, iy, iw, ih); x.restore();
  innerShadow(x, ix, iy, iw, ih, s, 0.8);
  const bev = 9 * s; x.fillStyle = '#FFFFFF'; x.fillRect(ix + mat - bev, iy + mat - bev, w + 2 * bev, h + 2 * bev);
  x.fillStyle = 'rgba(0,0,0,.07)'; x.fillRect(ix + mat - bev, iy + mat - bev, w + 2 * bev, bev * .5); x.fillRect(ix + mat - bev, iy + mat - bev, bev * .5, h + 2 * bev);
  x.drawImage(art, ix + mat, iy + mat); innerShadow(x, ix + mat, iy + mat, w, h, s, 0.35);
  const cw2 = Math.min(bw * 0.8, 1100 * s), ch2 = 120 * s, cy0 = y0 + bh + 90 * s;
  x.save(); x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 16 * s; x.shadowOffsetY = 5 * s; x.fillStyle = '#FFFFFF'; x.fillRect(cx - cw2 / 2, cy0, cw2, ch2); x.restore();
  caption(x, cx, cy0 + ch2 / 2 - 6 * s, cw2 - 60 * s, s, '#3F4A57');
  return c;
}
function sceneDesk(art, s) {
  const w = art.width, h = art.height, mg = 70 * s, pw = w + 2 * mg, ph = h + 2 * mg + 90 * s, M = 190 * s, CW = pw + 2 * M, CH = ph + 2 * M, c = mkC(CW, CH), x = c.getContext('2d'), cx = CW / 2;
  const plank = 170 * s; for (let y = 0, k = 0; y < CH; y += plank, k++) { x.drawImage(woodTex(CW, plank, s, 700 + k, [150, 104, 64], 1.4), 0, y); x.fillStyle = 'rgba(30,15,5,.35)'; x.fillRect(0, y, CW, 2.5 * s); }
  x.save(); x.translate(cx, CH / 2); x.rotate(-0.018);
  x.shadowColor = 'rgba(20,10,0,.45)'; x.shadowBlur = 34 * s; x.shadowOffsetY = 14 * s; x.fillStyle = '#FFFFFF'; x.fillRect(-pw / 2, -ph / 2, pw, ph); x.shadowColor = 'transparent';
  x.drawImage(art, -w / 2, -ph / 2 + mg);
  caption(x, 0, ph / 2 - mg / 2 - 40 * s, pw - 2 * mg, s, '#55606E');
  const tape = (tx, ty, ang) => { x.save(); x.translate(tx, ty); x.rotate(ang); x.fillStyle = 'rgba(236,224,190,.78)'; x.fillRect(-90 * s, -26 * s, 180 * s, 52 * s); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(-90 * s, -26 * s, 180 * s, 10 * s); x.restore(); };
  tape(-pw / 2 + 40 * s, -ph / 2 + 10 * s, -0.7); tape(pw / 2 - 40 * s, -ph / 2 + 10 * s, 0.7); tape(-pw / 2 + 40 * s, ph / 2 - 10 * s, 0.7); tape(pw / 2 - 40 * s, ph / 2 - 10 * s, -0.7);
  x.restore();
  return c;
}
function sceneBoard(art, s) {
  const w = art.width, h = art.height, fw = 58 * s, bw = w + 2 * fw, bh = h + 2 * fw, M = 170 * s, T = 150 * s, TR = 120 * s, CW = bw + 2 * M, CH = T + bh + TR + 170 * s, c = mkC(CW, CH), x = c.getContext('2d'), cx = CW / 2;
  let g = x.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#D9D0BF'); g.addColorStop(1, '#C3B8A3'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  const x0 = cx - bw / 2; drawFrame(x, x0, T, bw, bh, fw, s, 'oak', 800 + cur);
  x.drawImage(art, x0 + fw, T + fw); innerShadow(x, x0 + fw, T + fw, w, h, s, 0.9);
  const ty = T + bh - 8 * s, tw = bw + 60 * s, tx0 = cx - tw / 2;
  x.save(); x.shadowColor = 'rgba(30,20,10,.4)'; x.shadowBlur = 20 * s; x.shadowOffsetY = 10 * s; x.fillStyle = '#7a5a3a'; x.fillRect(tx0, ty, tw, TR); x.restore();
  x.drawImage(woodTex(tw, 30 * s, s, 811, [206, 170, 124]), tx0, ty); x.drawImage(woodTex(tw, TR - 30 * s, s, 812, [190, 152, 106]), tx0, ty + 30 * s);
  x.fillStyle = 'rgba(30,15,5,.3)'; x.fillRect(tx0, ty + 30 * s, tw, 2 * s);
  const chalk = (px, len, col, ang) => { x.save(); x.translate(px, ty + 16 * s); x.rotate(ang); x.fillStyle = col; x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 6 * s; x.fillRect(-len / 2, -9 * s, len, 18 * s); x.restore(); };
  chalk(cx + bw * 0.28, 120 * s, '#F7F5EE', 0.04); chalk(cx + bw * 0.36, 80 * s, '#F4B6C2', -0.05); chalk(cx - bw * 0.33, 95 * s, '#BFE3F2', 0.03);
  caption(x, cx, ty + 30 * s + (TR - 30 * s) / 2 - 4 * s, tw - 160 * s, s, 'rgb(60,36,16)', 'engraved');
  return c;
}
function sceneClip(art, s) {
  const w = art.width, h = art.height, mg = 60 * s, pw = w + 2 * mg, ph = h + 2 * mg + 100 * s, bd = 90 * s, bw = pw + 2 * bd, bh = ph + 2 * bd + 40 * s, M = 150 * s;
  const CW = bw + 2 * M, CH = bh + 2 * M, c = mkC(CW, CH), x = c.getContext('2d'), cx = CW / 2;
  let g = x.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#E9E4DA'); g.addColorStop(1, '#D3CCBE'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  const bx0 = cx - bw / 2, by0 = M;
  x.save(); x.shadowColor = 'rgba(30,20,10,.4)'; x.shadowBlur = 36 * s; x.shadowOffsetY = 14 * s; x.fillStyle = '#9B7650'; x.beginPath(); x.roundRect ? x.roundRect(bx0, by0, bw, bh, 24 * s) : x.rect(bx0, by0, bw, bh); x.fill(); x.restore();
  x.save(); x.beginPath(); x.roundRect ? x.roundRect(bx0, by0, bw, bh, 24 * s) : x.rect(bx0, by0, bw, bh); x.clip(); x.drawImage(woodTex(bw, bh, s, 901, [176, 140, 98], 3), bx0, by0); x.restore();
  const px0 = cx - pw / 2, py0 = by0 + bd + 40 * s;
  x.save(); x.shadowColor = 'rgba(30,20,10,.3)'; x.shadowBlur = 14 * s; x.shadowOffsetY = 5 * s; x.fillStyle = '#F8F6F1'; x.fillRect(px0, py0, pw, ph); x.restore();
  x.drawImage(art, px0 + mg, py0 + mg);
  caption(x, cx, py0 + ph - mg / 2 - 46 * s, pw - 2 * mg, s, '#4A4A4A');
  // pinza metálica
  const cw = 300 * s, chh = 110 * s, cy0 = py0 - 50 * s;
  g = x.createLinearGradient(0, cy0, 0, cy0 + chh); g.addColorStop(0, '#E9ECEF'); g.addColorStop(.45, '#9AA1A8'); g.addColorStop(.55, '#C9CED3'); g.addColorStop(1, '#6D747B');
  x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 14 * s; x.shadowOffsetY = 6 * s; x.fillStyle = g; x.beginPath(); x.roundRect ? x.roundRect(cx - cw / 2, cy0, cw, chh, 14 * s) : x.rect(cx - cw / 2, cy0, cw, chh); x.fill(); x.restore();
  x.strokeStyle = '#5E656C'; x.lineWidth = 9 * s; x.beginPath(); x.ellipse(cx, cy0 - 6 * s, cw * 0.32, 44 * s, 0, Math.PI, 2 * Math.PI); x.stroke();
  // lápiz
  x.save(); x.translate(px0 + pw + bd * 0.5, py0 + ph * 0.55); x.rotate(Math.PI / 2 - 0.12); const pl = 520 * s, pt = 26 * s;
  x.shadowColor = 'rgba(0,0,0,.3)'; x.shadowBlur = 10 * s; x.shadowOffsetY = 5 * s;
  g = x.createLinearGradient(0, -pt / 2, 0, pt / 2); g.addColorStop(0, '#F2C230'); g.addColorStop(.5, '#FFDE5C'); g.addColorStop(1, '#C99A12'); x.fillStyle = g; x.fillRect(-pl / 2, -pt / 2, pl, pt);
  x.shadowColor = 'transparent'; x.fillStyle = '#E8C9A0'; x.beginPath(); x.moveTo(pl / 2, -pt / 2); x.lineTo(pl / 2 + 60 * s, 0); x.lineTo(pl / 2, pt / 2); x.fill();
  x.fillStyle = '#2E2E2E'; x.beginPath(); x.moveTo(pl / 2 + 40 * s, -pt * 0.17); x.lineTo(pl / 2 + 60 * s, 0); x.lineTo(pl / 2 + 40 * s, pt * 0.17); x.fill();
  x.fillStyle = '#B9B9B9'; x.fillRect(-pl / 2 - 26 * s, -pt / 2, 26 * s, pt); x.fillStyle = '#E58C9A'; x.fillRect(-pl / 2 - 56 * s, -pt / 2, 30 * s, pt); x.restore();
  return c;
}
function sceneComic(art, s) {
  const w = art.width, h = art.height, mg = 80 * s, bt = 12 * s, head = 150 * s, CW = w + 2 * mg, CH = h + 2 * mg + head + 110 * s, c = mkC(CW, CH), x = c.getContext('2d');
  x.fillStyle = '#FBF2D9'; x.fillRect(0, 0, CW, CH);
  const ay = mg + head; x.drawImage(art, mg, ay);
  x.lineWidth = bt; x.strokeStyle = '#111'; x.strokeRect(mg - bt / 2, ay - bt / 2, w + bt, h + bt);
  // título de portada
  x.save(); x.translate(mg, mg - 10 * s); x.rotate(-0.025);
  x.fillStyle = '#FFD83A'; x.strokeStyle = '#111'; x.lineWidth = 7 * s; x.fillRect(0, 0, w * 0.72, head - 30 * s); x.strokeRect(0, 0, w * 0.72, head - 30 * s);
  x.fillStyle = '#E3262E'; x.font = `italic 900 ${66 * s}px Montserrat, sans-serif`; x.textBaseline = 'middle';
  x.lineWidth = 8 * s; x.strokeStyle = '#111'; x.strokeText('MUSCLE ATLAS!', 26 * s, (head - 30 * s) / 2, w * 0.72 - 50 * s); x.fillText('MUSCLE ATLAS!', 26 * s, (head - 30 * s) / 2, w * 0.72 - 50 * s); x.restore();
  x.save(); x.translate(mg + w - 150 * s, mg + 40 * s); x.rotate(0.12); x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 6 * s;
  x.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, r = (k % 2 ? 70 : 108) * s; x.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * .8); } x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#111'; x.font = `italic 900 ${40 * s}px Montserrat, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`No. ${cur}`, 0, 0); x.restore();
  caption(x, CW / 2, ay + h + 70 * s, w, s, '#111');
  return c;
}
function sceneDigital(art, s) {
  const w = art.width, h = art.height, M = 150 * s, CW = w + 2 * M, CH = h + 2 * M + 150 * s, c = mkC(CW, CH), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#0E1A2B'); g.addColorStop(1, '#22385A'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  g = x.createRadialGradient(CW / 2, M + h / 2, 50 * s, CW / 2, M + h / 2, CW * 0.7); g.addColorStop(0, 'rgba(120,170,255,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, CW, CH);
  const r = 34 * s; x.save(); x.shadowColor = 'rgba(80,140,255,.45)'; x.shadowBlur = 60 * s; x.fillStyle = '#fff'; x.beginPath(); x.roundRect ? x.roundRect(M, M, w, h, r) : x.rect(M, M, w, h); x.fill(); x.restore();
  x.save(); x.beginPath(); x.roundRect ? x.roundRect(M, M, w, h, r) : x.rect(M, M, w, h); x.clip(); x.drawImage(art, M, M); x.restore();
  caption(x, CW / 2, M + h + 85 * s, w, s, '#FFFFFF');
  return c;
}
function sceneClean(art, s) {
  const w = art.width, h = art.height, M = 50 * s, CW = w + 2 * M, CH = h + 2 * M + 110 * s, c = mkC(CW, CH), x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, CW, CH); x.drawImage(art, M, M);
  x.fillStyle = '#E4E6EA'; x.fillRect(M, M + h + 18 * s, w, 2 * s);
  caption(x, CW / 2, M + h + 72 * s, w, s, '#3F4A57');
  return c;
}
async function shareRender(st, s) {
  if (!SH.logo) SH.logo = await loadImg('bb_logo.png').catch(() => null);
  const Ly = await shareLayers(s), art = styleArt(st, Ly);
  return ({ atril: a => sceneEasel(a, s, false), oleo: a => sceneEasel(a, s, true), acuarela: a => sceneWall(a, s), marcador: a => sceneDesk(a, s), tiza: a => sceneBoard(a, s), grafito: a => sceneClip(a, s), comic: a => sceneComic(a, s), digital: a => sceneDigital(a, s), limpio: a => sceneClean(a, s) })[st](art);
}
$('#btnShare').onclick = async () => {
  if (!page) return;
  if (!page.plate) { toast('Only the plates you color can be shared'); return; }
  if (!SH.passed) { const rv = reviewArt(); if (rv.block.length || rv.tips.length) { showReview(rv); return; } toast('It looks beautiful! Choose how to share it'); checkDone(true); }
  SH.passed = false;
  await saveNow(); SH.cache = {}; SH.ready = null; $('#sgYes').textContent = 'Share my work';
  try { await Promise.all([document.fonts.load('700 40px Caveat'), document.fonts.load('700 30px Montserrat'), document.fonts.load('italic 900 40px Montserrat')]); } catch (e) {}
  const grid = $('#sgGrid'); grid.innerHTML = '';
  for (const [k, t, d] of SHARE_STYLES) {
    const b = document.createElement('button'); b.className = 'sgc' + (k === SH.style ? ' on' : ''); b.dataset.k = k;
    b.innerHTML = `<div class="sgt"></div><b>${t}</b><small>${d}</small>`;
    b.onclick = () => { SH.style = k; store.set('shareStyle', k); grid.querySelectorAll('.sgc').forEach(e => e.classList.toggle('on', e === b)); };
    grid.appendChild(b);
  }
  $('#shareBox').hidden = false;
  for (const b of grid.querySelectorAll('.sgc')) {
    await new Promise(r => requestAnimationFrame(r)); if ($('#shareBox').hidden) return;
    const cv = await shareRender(b.dataset.k, 0.16); b.querySelector('.sgt').appendChild(cv);
  }
};
$('#sgNo').onclick = () => { $('#shareBox').hidden = true; SH.ready = null; $('#sgYes').textContent = 'Share my work'; };
$('#shareBox').addEventListener('pointerdown', e => { if (e.target.id === 'shareBox') $('#shareBox').hidden = true; });
async function shareFile(file, blob) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Muscle Atlas · Digital Coloring Book' }); return true; }
  } catch (e) {
    if (e && e.name === 'AbortError') return true;
    if (e && e.name === 'NotAllowedError') return false;   // el teléfono pide otro toque
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Plate saved to Downloads'); return true;
}
$('#sgYes').onclick = async () => {
  if (SH.ready) { const { file, blob } = SH.ready; SH.ready = null; $('#sgYes').textContent = 'Share my work'; $('#shareBox').hidden = true; await shareFile(file, blob); return; }
  if (SH.busy) return; SH.busy = true; $('#sgYes').classList.add('wait');
  try {
    const c = await shareRender(SH.style, 1);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
    const file = new File([blob], `muscle-atlas-page-${cur}.jpg`, { type: 'image/jpeg' });
    $('#shareBox').hidden = true;
    if (!(await shareFile(file, blob))) { SH.ready = { file, blob }; $('#shareBox').hidden = false; $('#sgYes').textContent = 'Your work is ready: tap to share'; }
  } finally { SH.busy = false; $('#sgYes').classList.remove('wait'); }
};


/* ---------------- música para colorear (generada en la app, sin internet) ---------------- */
const MUSIC = (() => {
  let ac = null, master = null, verb = null, cur = null, timers = [], nodes = [];
  const TR = [
    ['piano', 'Soft piano', 'Piano with soft strings', '🎹'],
    ['ambiente', 'Ambient', 'Flute, chimes, birds and frogs', '🌙'],
    ['lluvia', 'Rain', 'Gentle drops and distant frogs', '🌧'],
    ['mar', 'Sea', 'Slow, distant waves', '🌊'],
    ['cuencos', 'Crystal bowls', 'Relaxing vibration', '🔔'],
    ['indie', 'Indie relax', 'Guitar, handpan, hand drum and chimes', '🌿'],
    ['mantra', 'Om mantra', 'Om, tanpura and soft sitar', '🧘'],
    ['cuerdas', 'Harp and violins', 'Soft, relaxing strings', '🎻'],
  ];
  function ctx() {
    if (!ac) {
      const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ac = new A();
      master = ac.createGain(); master.gain.value = (store.get('mvol', 60) / 100) * 0.5; master.connect(ac.destination);
      verb = ac.createConvolver(); const len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir; const vg = ac.createGain(); vg.gain.value = 0.55; verb.connect(vg).connect(master);
    }
    if (ac.state === 'suspended') ac.resume(); return ac;
  }
  function noise(kind) {
    const n = ac.sampleRate * 4, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0); let br = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (kind === 'brown') { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.5; } else d[i] = w; }
    const s = ac.createBufferSource(); s.buffer = b; s.loop = true; return s;
  }
  const every = (fn, ms) => { const t = setInterval(fn, ms); timers.push(t); };
  const keep = (...n) => nodes.push(...n);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function note(m, t, dur, vol, type = 'sine', dest = master) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = hz(m); o2.type = 'sine'; o2.frequency.value = hz(m) * 2.001;
    const g2 = ac.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2).connect(g); g.connect(dest); g.connect(verb);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  const PENTA = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81];
  const CHORDS = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]];
  const play = {
    piano() {
      let ci = 0;
      const bar = () => { const t = ac.currentTime + 0.05, ch = CHORDS[ci++ % 4]; note(ch[0] - 12 + 12, t, 5.5, 0.06, 'triangle'); note(ch[1], t + 0.02, 5, 0.035, 'triangle');
        const k = 3 + (Math.random() * 3 | 0); for (let i = 0; i < k; i++) { const m = PENTA[Math.random() * PENTA.length | 0]; note(m, t + 0.3 + i * (0.9 + Math.random() * 0.7), 3.2, 0.05 + Math.random() * 0.03); } };
      pad(0.012); bar(); every(bar, 6000);
    },
    ambiente() {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 350; lfo.connect(lg).connect(lp.frequency); lfo.start();
      const bus = ac.createGain(); bus.gain.value = 0.9; lp.connect(bus); bus.connect(master); bus.connect(verb); keep(lfo, lp, bus);
      let ci = 0;
      const chord = () => { const t = ac.currentTime + 0.05; for (const m of CHORDS[ci++ % 4]) for (const det of [-6, 6]) {
        const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.022, t + 2.5); g.gain.setValueAtTime(0.022, t + 6.5); g.gain.linearRampToValueAtTime(0, t + 9.5);
        o.connect(g).connect(lp); o.start(t); o.stop(t + 9.6); } };
      chord(); every(chord, 8000);
      every(() => { if (Math.random() < 0.7) flute(PENTA[Math.random() * 6 | 0] + 12, ac.currentTime + 0.1, 2.5 + Math.random() * 2, 0.025); }, 3500);
      every(() => { const t = ac.currentTime + 0.05; for (let i = 0; i < 3; i++) note(PENTA[5 + (Math.random() * 5 | 0)] + 12, t + i * 0.18, 2.5, 0.012); }, 9000);
      // naturaleza por fases: a ratos pajaritos, a ratos sapitos, a ratos ambos
      let phase = 0; every(() => { phase = Math.random() * 3 | 0; }, 45000);
      scene([{ p: 0.55, n: 2, spread: 3.5, f: t => { if (phase !== 2) bird(t, 0.02 + Math.random() * 0.015); } },
             { p: 0.35, n: 2, spread: 3, f: t => { if (phase !== 0) frog(t, 0.03); } }]);
    },
    lluvia() {
      // lluvia serena: soplo muy suave y gotas sueltas, nada de tormenta
      const s = noise('white'), bp = ac.createBiquadFilter(), g = ac.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.6; g.gain.value = 0.028;
      s.connect(bp).connect(g).connect(master); s.start(); keep(s, g);
      const drop = () => { const t = ac.currentTime + Math.random() * 0.4, o = ac.createOscillator(), gg = ac.createGain(), f = 900 + Math.random() * 1700;
        o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.06);
        gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.018 + Math.random() * 0.02, t + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(gg); gg.connect(master); gg.connect(verb); o.start(t); o.stop(t + 0.14); };
      every(() => { const k = 1 + (Math.random() * 2 | 0); for (let i = 0; i < k; i++) drop(); }, 420);
      scene([{ p: 0.3, n: 2, spread: 3, f: t => frog(t, 0.022) }]);
    },
    mar() {
      const s = noise('brown'), lp = ac.createBiquadFilter(), g = ac.createGain(); lp.type = 'lowpass'; lp.frequency.value = 520; g.gain.value = 0.24;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.045; lg.gain.value = 0.2; lfo.connect(lg).connect(g.gain); lfo.start();
      const lf2 = ac.createGain(); lf2.gain.value = 300; lfo.connect(lf2).connect(lp.frequency);
      s.connect(lp).connect(g).connect(master); s.connect(verb); s.start(); keep(s, lfo, g);
      const w = noise('white'), hp = ac.createBiquadFilter(), wg = ac.createGain(); hp.type = 'bandpass'; hp.frequency.value = 2500; hp.Q.value = 0.5; wg.gain.value = 0.0;
      const lg2 = ac.createGain(); lg2.gain.value = 0.03; lfo.connect(lg2).connect(wg.gain); w.connect(hp).connect(wg).connect(master); w.start(); keep(w, wg);
    }
  };
  function pluck(m, t, vol = 0.18) {
    const f = hz(m), N = Math.round(ac.sampleRate / f), len = ac.sampleRate * 2.5, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
    for (let i = N; i < len; i++) d[i] = (d[i - N] + d[i - N + 1]) * 0.497;
    const s = ac.createBufferSource(), g = ac.createGain(), lp = ac.createBiquadFilter(); s.buffer = b; lp.type = 'lowpass'; lp.frequency.value = 2600; g.gain.value = vol;
    s.connect(lp).connect(g); g.connect(master); g.connect(verb); s.start(t);
  }
  function pad(vol) {   // colchón de cuerdas (violines) muy suave
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; const bus = ac.createGain(); bus.gain.value = 1; lp.connect(bus); bus.connect(master); bus.connect(verb); keep(lp, bus);
    let ci = 0;
    const ch = () => { const t = ac.currentTime + 0.05; for (const m of CHORDS[ci++ % 4].slice(1)) for (const det of [-8, 0, 8]) {
      const o = ac.createOscillator(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = hz(m + 12); o.detune.value = det;
      v.frequency.value = 5 + Math.random(); vg.gain.value = 6; v.connect(vg).connect(o.detune);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 3); g.gain.setValueAtTime(vol, t + 9); g.gain.linearRampToValueAtTime(0, t + 12.5);
      o.connect(g).connect(lp); o.start(t); v.start(t); o.stop(t + 12.6); v.stop(t + 12.6); } };
    ch(); every(ch, 12000);
  }
  function bird(t, vol = 0.03) {   // trino de pajarito: barridos rápidos agudos
    const k = 2 + (Math.random() * 5 | 0), base = 2600 + Math.random() * 1800, pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const out = ac.createGain(); out.gain.value = vol; if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan); pan.connect(master); pan.connect(verb); } else { out.connect(master); }
    for (let i = 0; i < k; i++) { const tt = t + i * (0.07 + Math.random() * 0.06), o = ac.createOscillator(), g = ac.createGain(), up = Math.random() < 0.5;
      o.frequency.setValueAtTime(base * (up ? 0.8 : 1.25), tt); o.frequency.exponentialRampToValueAtTime(base * (up ? 1.3 : 0.75), tt + 0.06);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(1, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.07);
      o.connect(g).connect(out); o.start(tt); o.stop(tt + 0.09); }
  }
  function frog(t, vol = 0.05) {   // sapito lejano: croar grave doble
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null, out = ac.createGain(), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; out.gain.value = vol;
    lp.connect(out); if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; out.connect(pan); pan.connect(master); pan.connect(verb); } else out.connect(master);
    const f = 140 + Math.random() * 90, n = 2 + (Math.random() * 2 | 0);
    for (let i = 0; i < n; i++) { const tt = t + i * 0.22, o = ac.createOscillator(), am = ac.createOscillator(), ag = ac.createGain(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f, tt); o.frequency.linearRampToValueAtTime(f * 0.85, tt + 0.16);
      am.frequency.value = 38; ag.gain.value = 0.5; am.connect(ag).connect(g.gain);
      g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(0.5, tt + 0.02); g.gain.linearRampToValueAtTime(0, tt + 0.17);
      o.connect(g).connect(lp); o.start(tt); am.start(tt); o.stop(tt + 0.2); am.stop(tt + 0.2); }
  }
  // escenas que cambian solas: cada tantos segundos aparece o se va algo (nunca se repite igual)
  function scene(parts) {
    const go = () => { for (const p of parts) if (Math.random() < p.p) { const n = 1 + (Math.random() * p.n | 0); for (let i = 0; i < n; i++) p.f(ac.currentTime + 0.2 + Math.random() * p.spread); } };
    go(); every(go, 4000);
  }
  function flute(m, t, dur, vol) {
    const o = ac.createOscillator(), g = ac.createGain(), v = ac.createOscillator(), vg = ac.createGain(), n = noise('white'), bp = ac.createBiquadFilter(), ng = ac.createGain();
    o.type = 'sine'; o.frequency.value = hz(m); v.frequency.value = 5; vg.gain.value = hz(m) * 0.006; v.connect(vg).connect(o.frequency);
    bp.type = 'bandpass'; bp.frequency.value = hz(m) * 2; bp.Q.value = 8; ng.gain.value = vol * 0.25;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.35); g.gain.setValueAtTime(vol, t + dur - 0.6); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); n.connect(bp).connect(ng).connect(g); g.connect(master); g.connect(verb);
    o.start(t); v.start(t); n.start(t); o.stop(t + dur + 0.1); v.stop(t + dur + 0.1); n.stop(t + dur + 0.1);
  }
  Object.assign(play, {
    cuerdas() {
      pad(0.02);
      const HARP = [[48, 55, 60, 64, 67, 72, 76], [45, 52, 57, 60, 64, 69, 72], [41, 48, 53, 57, 60, 65, 69], [43, 50, 55, 59, 62, 67, 71]];
      let ci = 0;
      const arp = () => { const t0 = ac.currentTime + 0.05, ch = HARP[ci++ % 4], up = [...ch, ...ch.slice(1, -1).reverse()];
        up.forEach((m, i) => pluck(m, t0 + i * 0.5, 0.11 + Math.random() * 0.04)); };
      arp(); every(arp, 6000);
    },
    cuencos() {
      const BOWL = [55, 59, 62, 64, 67];   // notas de cuencos de cristal
      const strike = () => { const t = ac.currentTime + 0.05, m = BOWL[Math.random() * BOWL.length | 0];
        for (const [k, a] of [[1, 0.09], [2.01, 0.025], [3.02, 0.012]]) {
          const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain(); o.frequency.value = hz(m) * k; o2.frequency.value = hz(m) * k + 0.9;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0004, t + 14);
          o.connect(g); o2.connect(g); g.connect(master); g.connect(verb); o.start(t); o2.start(t); o.stop(t + 14.2); o2.stop(t + 14.2); } };
      strike(); every(strike, 5200);
    },
    indie() {
      // indie/folk de yoga: rasgueo suave de guitarra, handpan, tambor de mano, shaker y campanitas; cambia por secciones
      const PROG = [[52, 59, 64, 67, 71, 76], [48, 55, 64, 67, 72, 76], [43, 50, 59, 62, 67, 71], [45, 52, 60, 64, 69, 72]];
      const HP = [50, 57, 60, 62, 64, 67, 69, 72];   // escala del handpan (re menor suave)
      const handpan = (m, t, v) => { for (const [k, a, d] of [[1, v, 3.2], [2, v * 0.35, 1.8], [3, v * 0.12, 1.1]]) { const o = ac.createOscillator(), g = ac.createGain();
          o.frequency.value = hz(m) * k; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + d); o.connect(g); g.connect(master); g.connect(verb); o.start(t); o.stop(t + d + 0.1); } };
      const drum = (t, low) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(low ? 95 : 180, t); o.frequency.exponentialRampToValueAtTime(low ? 55 : 120, t + 0.18);
          g.gain.setValueAtTime(low ? 0.16 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g).connect(master); o.start(t); o.stop(t + 0.32); };
      const shaker = (t, v) => { const n = noise('white'), hp = ac.createBiquadFilter(), g = ac.createGain(); hp.type = 'highpass'; hp.frequency.value = 6000;
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12); n.connect(hp).connect(g).connect(master); n.start(t); n.stop(t + 0.14); };
      const strum = (ch, t, v, down) => { const ns = down ? ch : [...ch].reverse(); ns.forEach((m, i) => pluck(m, t + i * 0.018, v)); };
      let ci = 0, sec = 0;
      const bar = () => { const t0 = ac.currentTime + 0.05, ch = PROG[ci++ % 4], b = 0.5;   // 8 tiempos de 0,5 s
        if (ci % 8 === 1) sec = Math.random() * 3 | 0;   // cada 8 compases cambia el arreglo
        const pat = [[0, 1, 0.12], [1.5, 0, 0.07], [2, 1, 0.1], [3, 0, 0.07], [3.5, 1, 0.06], [4, 1, 0.11], [5.5, 0, 0.07], [6, 1, 0.1], [7, 0, 0.07]];
        if (sec !== 2) pat.forEach(([k, d, v]) => strum(ch, t0 + k * b, v, d));
        else [0, 2, 3, 5, 6, 7, 4, 2].forEach((k, i) => pluck(ch[k % 6], t0 + i * b, 0.1));
        if (sec !== 1) { [0, 3, 4, 6].forEach(i => drum(t0 + i * b, i % 4 === 0)); for (let i = 0; i < 16; i++) shaker(t0 + i * b / 2, i % 2 ? 0.012 : 0.02); }
        const k = sec === 1 ? 6 : 3; for (let i = 0; i < k; i++) if (Math.random() < 0.8) handpan(HP[Math.random() * HP.length | 0], t0 + (Math.random() * 8 | 0) * b, 0.05);
        if (Math.random() < 0.25) for (let i = 0; i < 4; i++) note(84 + [0, 4, 7, 12][i], t0 + 2 + i * 0.12, 2, 0.008); };
      bar(); every(bar, 4000);
    },
    mantra() {
      const bus = ac.createGain(); bus.gain.value = 0.9; bus.connect(master); bus.connect(verb); keep(bus);
      const chant = () => { const t = ac.currentTime + 0.05, base = hz([38, 38, 43, 36][Math.random() * 4 | 0]);
        const src = ac.createOscillator(), src2 = ac.createOscillator(), mix = ac.createGain(); src.type = 'sawtooth'; src2.type = 'sawtooth'; src.frequency.value = base; src2.frequency.value = base * 1.003; src.connect(mix); src2.connect(mix);
        const env = ac.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.09, t + 1.6); env.gain.setValueAtTime(0.09, t + 6.5); env.gain.linearRampToValueAtTime(0, t + 9);
        // formantes: "o" que se cierra en "m"
        for (const [f1, f2, q, a] of [[450, 380, 6, 1], [800, 300, 8, 0.5], [2830, 2500, 10, 0.12]]) {
          const bp = ac.createBiquadFilter(), g = ac.createGain(); bp.type = 'bandpass'; bp.Q.value = q; bp.frequency.setValueAtTime(f1, t); bp.frequency.linearRampToValueAtTime(f1, t + 5); bp.frequency.linearRampToValueAtTime(f2, t + 6.5); g.gain.value = a;
          mix.connect(bp).connect(g).connect(env); }
        env.connect(bus); src.start(t); src2.start(t); src.stop(t + 9.2); src2.stop(t + 9.2);
        const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = base / 2; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 2); g.gain.linearRampToValueAtTime(0, t + 9.5); o.connect(g).connect(bus); o.start(t); o.stop(t + 9.6); };
      // tanpura (bordón) y melodía tipo sitar, suavecita; el Om aparece a ratos
      const SA = 50, RAGA = [0, 2, 4, 7, 9, 12, 14, 16];
      const tanpura = () => { const t = ac.currentTime + 0.05; [SA - 12 + 7, SA, SA, SA - 12].forEach((m, i) => pluck(m, t + i * 1.2, 0.07)); };
      const sitar = () => { const t0 = ac.currentTime + 0.1; let m = RAGA[Math.random() * 4 | 0], tt = t0; const k = 4 + (Math.random() * 5 | 0);
        for (let i = 0; i < k; i++) { pluck(SA + 12 + m, tt, 0.08 + Math.random() * 0.04); tt += [0.4, 0.4, 0.8, 0.6][Math.random() * 4 | 0]; m = RAGA[Math.max(0, Math.min(RAGA.length - 1, RAGA.indexOf(m) + (Math.random() < 0.5 ? -1 : 1)))]; } };
      tanpura(); every(tanpura, 4800);
      every(() => { if (Math.random() < 0.7) sitar(); }, 6500);
      chant(); every(() => { if (Math.random() < 0.45) chant(); }, 13000);
    }
  });
  function stop() {
    timers.forEach(clearInterval); timers = [];
    if (ac) { const t = ac.currentTime; for (const n of nodes) { try { if (n.gain) n.gain.setTargetAtTime(0, t, 0.3); if (n.stop) n.stop(t + 1.2); } catch (e) {} } }
    nodes = []; cur = null; sync();
  }
  function start(id) { if (!ctx()) return; stop(); cur = id; play[id](); store.set('track', id); sync(); }
  function sync() {
    document.querySelectorAll('.trk').forEach(b => b.classList.toggle('on', b.dataset.id === cur));
    $('#btnMusic').classList.toggle('on', !!cur);
    $('#musicChip').hidden = !cur; if (cur) $('#musicChipName').textContent = TR.find(t => t[0] === cur)[1];
    $('#mStop').hidden = !cur;
  }
  function build() {
    $('#trackList').innerHTML = TR.map(([id, n, d, ic]) => `<button class="trk" data-id="${id}"><i>${ic}</i><span>${n}<small>${d}</small></span></button>`).join('');
    document.querySelectorAll('.trk').forEach(b => b.onclick = () => (cur === b.dataset.id ? stop() : start(b.dataset.id)));
    $('#mVol').value = store.get('mvol', 60);
    $('#mVol').oninput = e => { store.set('mvol', +e.target.value); if (master) master.gain.setTargetAtTime(e.target.value / 100 * 0.5, ac.currentTime, 0.05); };
    $('#mStop').onclick = stop; sync();
  }
  return { build, start, stop, get cur() { return cur; } };
})();
$('#btnMusic').onclick = () => { closeSheet(); $('#music').hidden = false; };
$('#musicChip').onclick = () => { $('#music').hidden = false; };
$('#musicChip').addEventListener('pointerdown', e => e.stopPropagation());
$('#btnCloseMusic').onclick = () => { $('#music').hidden = true; };
$('#music').addEventListener('pointerdown', e => { if (e.target.id === 'music') $('#music').hidden = true; });
MUSIC.build();

/* ---------------- audiolibro del cuento ---------------- */
const STORIES = { 7: { src: 'audio/cuento_u1_en.mp3', t: 'Listen to the story' } };
const story = new Audio(); story.preload = 'none';
function storyUI() {
  const st = STORIES[cur]; const b = $('#storyBtn');
  b.hidden = !st; if (!st) { if (!story.paused) story.pause(); return; }
  const playing = !story.paused && story.dataset.p == cur;
  b.classList.toggle('on', playing);
  $('#storyLabel').textContent = playing ? 'Pause' : (story.dataset.p == cur && story.currentTime > 1 ? 'Resume' : 'Listen');
  b.classList.toggle('act', story.dataset.p == cur && (playing || story.currentTime > 0.5));
}
const mmss = t => { t = Math.max(0, t | 0); return `${t / 60 | 0}:${String(t % 60).padStart(2, '0')}`; };
let seeking = false;
$('#spSeek').addEventListener('input', () => { seeking = true; if (story.duration) $('#spTime').textContent = `${mmss($('#spSeek').value / 1000 * story.duration)} / ${mmss(story.duration)}`; });
$('#spSeek').addEventListener('change', () => { if (story.duration) story.currentTime = $('#spSeek').value / 1000 * story.duration; seeking = false; });
$('#spBack').onclick = () => { story.currentTime = Math.max(0, story.currentTime - 15); };
$('#spFwd').onclick = () => { if (story.duration) story.currentTime = Math.min(story.duration - 0.5, story.currentTime + 15); };
$('#spPlay').onclick = () => $('#storyBtn').onclick();
$('#spClose').onclick = () => { story.pause(); story.currentTime = 0; storyUI(); };
['spSeek', 'spBack', 'spFwd', 'spPlay', 'spClose'].forEach(id => document.getElementById(id).addEventListener('pointerdown', e => e.stopPropagation()));
/* la barrita del botón se puede arrastrar con su bolita para adelantar o atrasar */
let skipClick = false;
const trackSeek = e => { const r = $('#storyTrack').getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  if (story.duration) { story.currentTime = f * story.duration; $('#storyBar').style.width = f * 100 + '%'; $('#storyKnob').style.left = f * 100 + '%'; } };
$('#storyTrack').addEventListener('pointerdown', e => { if (!$('#storyBtn').classList.contains('act')) return; e.stopPropagation(); e.preventDefault(); skipClick = true; $('#storyTrack').setPointerCapture(e.pointerId); $('#storyTrack').classList.add('drag'); trackSeek(e); });
$('#storyTrack').addEventListener('pointermove', e => { if ($('#storyTrack').classList.contains('drag')) trackSeek(e); });
const trackEnd = () => { $('#storyTrack').classList.remove('drag'); setTimeout(() => skipClick = false, 50); };
$('#storyTrack').addEventListener('pointerup', trackEnd); $('#storyTrack').addEventListener('pointercancel', trackEnd);
$('#storyBtn').onclick = () => {
  if (skipClick) return;
  const st = STORIES[cur]; if (!st) return;
  if (story.dataset.p != cur) { story.src = st.src; story.dataset.p = cur; }
  if (story.paused) { if (MUSIC.cur) MUSIC.stop(); story.play().catch(() => toast('The audio could not be played')); } else story.pause();
};
story.addEventListener('play', storyUI); story.addEventListener('pause', storyUI); story.addEventListener('ended', () => { story.currentTime = 0; storyUI(); });
story.addEventListener('timeupdate', () => { const p = story.duration ? story.currentTime / story.duration : 0; $('#storyBar').style.width = (p * 100) + '%'; if (!$('#storyTrack').classList.contains('drag')) $('#storyKnob').style.left = (p * 100) + '%';
  if (!seeking) { $('#spSeek').value = Math.round(p * 1000); if (story.duration) $('#spTime').textContent = `${mmss(story.currentTime)} / ${mmss(story.duration)}`; }
  $('#spPlay').classList.toggle('on', !story.paused); });
/* ---------------- arranque ---------------- */
async function start() {
  await loadMeta();
  buildBrushes(); buildColors(); syncSliders(); syncTape(); updateDock();
  await openPage(store.get('page', 1));
  if (!store.get('guided', false)) showGuide();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  setupInstall();
}
new ResizeObserver(() => { const ph = stage.style.height; $('#texts').style.setProperty('--ph', ph); }).observe(stage);
start();
})();
