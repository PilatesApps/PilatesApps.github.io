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
  { id: 'balde', name: 'Bucket', size: 0, opa: 90, hard: 100 },
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
const TEXT_OFF = ['balde', 'teclado', 'pluma'];   // en cuentos y textos se pinta libre: todo menos el balde y lo de escribir en cuadritos
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
  else if (id === 'aero') { const g = x.createRadialGradient(44, 22, 2, 44, 22, 18); g.addColorStop(0, 'rgba(63,74,87,.55)'); g.addColorStop(1, 'rgba(63,74,87,0)'); x.fillStyle = g; x.fillRect(0, 0, 88, 44); for (let i = 0; i < 70; i++) { const a = Math.random() * 7, d = Math.abs((Math.random() + Math.random() - 1)) * 20; x.globalAlpha = .6; x.fillRect(44 + Math.cos(a) * d, 22 + Math.sin(a) * d, 1, 1); } }
  else if (id === 'balde') { x.font = '28px sans-serif'; x.textAlign = 'center'; x.fillText('🪣', 44, 33); }
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
  const GROUPS = [['Paint', ['marcador', 'lapiz', 'creyon', 'tiza', 'carboncillo', 'acuarela', 'oleo', 'aero', 'balde']],
                  ['Write and mark', ['pluma', 'teclado', 'boligrafo', 'resaltador']],
                  ['Erase', ['borrador', 'magia']]];
  for (const [gname, ids] of GROUPS) {
    const list = ids.map(B).filter(b => !(isText() && TEXT_OFF.includes(b.id)) && !(page && page.nobucket && b.id === 'balde'));
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
function toggleLock() { locks[cur] = !isLocked(); if (!locks[cur]) delete locks[cur]; store.set('locks', locks); syncLock(); buzz(12); toast(isLocked() ? 'Plate locked: your drawing is protected' : 'Plate unlocked: you can keep painting'); }
$('#btnLock').onclick = toggleLock; $('#dkLock').onclick = () => { closeSheet(); toggleLock(); };
$('#dkTape').onclick = () => { closeSheet(); tapeBtn.click(); };
$('#btnCloseTools').onclick = closeSheet;
function setColor(c) {
  if (FREE.includes(brush)) { brush = 'marcador'; store.set('brush', brush); buildBrushes(); syncSliders(); }
  color = c; store.set("color", c); setTimeout(updateDock, 0);
  recent = [c, ...recent.filter(r => r.toLowerCase() !== c.toLowerCase())].slice(0, 6); store.set('recent', recent);
  if (['borrador', 'magia', 'gotero', 'pluma', 'teclado'].includes(brush)) { brush = (lastPaint && !(isText() && TEXT_OFF.includes(lastPaint))) ? lastPaint : 'marcador'; store.set(isText() ? 'tbrush' : 'brush', brush); buildBrushes(); syncSliders(); }
  buildColors();
}
function syncSliders() {
  const s = S();
  $('#sSize').value = s.size; $('#oSize').textContent = s.size;
  $('#sOpa').value = s.opa; $('#oOpa').textContent = s.opa + '%';
  $('#sHard').value = s.hard; $('#oHard').textContent = s.hard + '%';
}
for (const [id, key, out, suf] of [['#sSize', 'size', '#oSize', ''], ['#sOpa', 'opa', '#oOpa', '%'], ['#sHard', 'hard', '#oHard', '%']]) {
  $(id).addEventListener('input', e => {
    settings[brush] = Object.assign({}, settings[brush], { [key]: +e.target.value }); store.set('settings', settings);
    $(out).textContent = e.target.value + suf;
  });
}
const sndBtn = $('#btnSound');
function syncSound() { sndBtn.classList.toggle('on', sound); sndBtn.setAttribute('aria-checked', sound); }
sndBtn.onclick = () => { sound = !sound; store.set('sound', sound); syncSound(); if (sound) { SFX.blip('tick'); buzz(10); } };
syncSound();
const tapeBtn = $('#btnTape');
function syncTape() { tapeBtn.classList.toggle('on', tape); tapeBtn.setAttribute('aria-checked', tape); $('#dkTape').classList.toggle('active', tape); $('#dkTape').setAttribute('aria-pressed', tape); }
tapeBtn.onclick = () => { tape = !tape; store.set('tape', tape); syncTape(); toast(tape ? 'Stay inside: the color stays inside the muscle' : 'Free: you can paint outside the muscle'); };

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
async function loadMeta() {
  META = await (await fetch('pages.json')).json(); N = META.length;
}
function pageFile(n, suf) { return `pages/p${String(n).padStart(2, '0')}${suf}`; }
function loadImg(src) { return new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; }); }

async function openPage(n) {
  n = Math.max(1, Math.min(N, n));
  await saveNow();
  if (n !== cur && META.length) { SFX.blip('page'); buzz(8); }
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
  if (page.nobucket && brush === 'balde') { brush = 'marcador'; }   // solo en esta página, no se guarda
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
  cLive.style.opacity = (stroke.brush === 'borrador' ? 0 : s.opa / 100);
  cLive.style.mixBlendMode = stroke.layer === 'ink' ? 'normal' : 'multiply'; cLive.style.zIndex = stroke.layer === 'ink' ? '4' : '';
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
  xWipe.save(); xWipe.clearRect(x0, y0, w, h); xWipe.drawImage(mWipe, x0, y0, w, h, x0, y0, w, h);
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
    const sp = Math.max(0.5, r * (stroke.brush === 'aero' ? 0.15 : stroke.brush === 'oleo' ? 0.12 : stroke.brush === 'acuarela' ? 0.22 : stroke.brush === 'tiza' ? 0.3 : stroke.brush === 'carboncillo' ? 0.2 : (stroke.brush === 'marcador' || stroke.brush === 'pluma' || stroke.brush === 'borrador' || stroke.brush === 'magia' || stroke.brush === 'resaltador' || stroke.brush === 'boligrafo') ? 0.08 : 0.18));
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
function cancelStroke() { SFX.stop(); if (stroke) { stroke = null; xLive.clearRect(0, 0, W, H); } }

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
  await saveNow();
  const g = $('#homeGrid'); g.innerHTML = '';
  $('#contName').textContent = `${cur}. ${PN[cur - 1] || ''}`;
  drawThumb($('#contThumb'), cur);
  const keys = await idbKeys();
  for (const [t, sub, a, b] of SECTIONS) {
    const sec = document.createElement('div'); sec.className = 'hsec';
    sec.innerHTML = `<h2>${t}${sub ? `<small>${sub}</small>` : ''}</h2>`;
    const cards = document.createElement('div'); cards.className = 'cards';
    for (let n = a; n <= Math.min(b, N); n++) {
      const c = document.createElement('button'); c.className = 'card' + (n === cur ? ' cur' : '');
      c.innerHTML = `<span class="th"><canvas width="153" height="198"></canvas><span class="n">${n}</span>${keys.has('p' + n) ? '<span class="dot"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>' : ''}</span><span class="t">${PN[n - 1]}</span>`;
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
  ['<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>', 'Choose and paint', 'Tap <b>the tool</b> and <b>the color</b> below. With <b>Stay inside</b> on, the color stays inside the muscle you started painting.'],
  ['<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 'Pinch with two fingers to zoom', 'Pinch to zoom and move with two fingers. <b>Tap with two fingers</b> to undo the last stroke.'],
  ['<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', 'All your plates', 'Swipe sideways or use <b>Previous</b> and <b>Next</b>, above the plate. Tap <b>the page number</b> to see all the plates and what you have painted.'],
  ['<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>', 'Music, and it saves itself', 'Tap <b>the music note</b> for relaxing music. Everything you paint <b>saves itself</b> on this device.'],
  ['<path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/>', 'Learn by painting', 'Before coloring, find <b>where the muscle starts</b> (its origin) and <b>where it ends</b> (its insertion). Paint it end to end, follow the direction of its fibers and fill in the table: <b>muscle, origin, insertion and action</b>. Your hand and your eye learn together.'],
  ['<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.2 5.2 0 0 0 22 9.2C22 5.8 17.5 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>', 'Free your inner artist', 'There is no right way to paint a muscle. Mix watercolor with pencil, invent your own palette, draw on the <b>free canvas</b>. When you paint the body creatively, <b>you remember it better</b> and teach it with more passion.'],
  ['<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', 'Share your work', 'When your plate is ready, tap <b>the up arrow</b> at the top right and share it on WhatsApp or social media with your classmates. Your plate carries the Muscle Atlas mark. Inspire others to learn by painting!']
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

/* ---------------- gestos ---------------- */
const pointers = new Map(); let gesture = null, panOnly = false, swipe = null, undoPending = null;
viewport.addEventListener('pointerdown', e => {
  if (document.body.classList.contains('sheet')) { closeSheet(); return; }
  if (e.target.closest('#toast')) return;
  const hs = e.target.closest('#hot a');
  if (hs) { const n = +hs.dataset.n; if (n) openPage(n); else toast('Available in the next version'); return; }
  viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    cancelStroke(); const [a, b] = [...pointers.values()];
    gesture = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, s: view.s, x: view.x, y: view.y, t: Date.now(), moved: false };
    if (undoPending) { undoPending.cancel(); undoPending = null; }
    return;
  }
  if (pointers.size > 2) return;
  const onHot = e.target.closest('#hot a');
  const drawing = page && !onHot;
  if (e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.altKey || spaceDown)) { e.preventDefault(); swipe = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, t: Date.now(), pan: true }; return; }
  if (drawing) { startStroke(e); if (!stroke) { /* toques de balde/teclado */ } }
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
  if (stroke && e.pointerId === stroke.id) { moveStroke(e); return; }
  if (swipe) { view.x = swipe.vx + (e.clientX - swipe.x); view.y = swipe.vy + (e.clientY - swipe.y); if (view.s > 1 || swipe.pan) { clampView(); apply(); } }
});
function up(e) {
  pointers.delete(e.pointerId);
  if (gesture) { if (pointers.size < 2) { if (!gesture.moved && Date.now() - gesture.t < 300) { swap(undo, redo); toast('Undone'); } gesture = null; } return; }
  if (stroke && e.pointerId === stroke.id) endStroke();
  if (swipe) {
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    if (!swipe.pan && view.s === 1 && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) openPage(cur + (dx < 0 ? 1 : -1));
    else if (view.s === 1) { clampView(); apply(); }
    swipe = null;
  }
}
viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', e => { cancelStroke(); up(e); });
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
['zIn','zOut','zFit'].forEach(id => document.getElementById(id).addEventListener('pointerdown', e => e.stopPropagation()));
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
$('#btnShare').onclick = async () => {
  if (!page) return;
  if (!page.plate) { toast('Only the plates you color can be shared'); return; }
  const pc = coloredShare();
  if (pc < SHARE_MIN) { toast(`You have colored ${Math.round(pc * 100)}%. You can share this plate once you reach ${SHARE_MIN * 100}%`); return; }
  await saveNow();
  const FOOT = 150, c = document.createElement('canvas'); c.width = W; c.height = H + FOOT; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(pageImg, 0, 0, W, H); if (wipeUsed) x.drawImage(cWipe, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.drawImage(cColor, 0, 0);
  // marca de agua: logo grande y suave detrás del color
  const logo = await loadImg('bb_logo.png').catch(() => null);
  if (logo) { const lw = W * 0.7, lh = lw * logo.height / logo.width; x.globalAlpha = 0.1; x.drawImage(logo, (W - lw) / 2, (H - lh) / 2, lw, lh); x.globalAlpha = 1; }
  x.globalCompositeOperation = 'source-over';
  if (page.top) x.drawImage(cTop, 0, 0, W, H);
  // marca de agua diagonal repetida, suave
  x.save(); x.globalAlpha = 0.07; x.fillStyle = '#3F4A57'; x.font = '600 34px Montserrat, sans-serif'; x.textAlign = 'center';
  x.translate(W / 2, H / 2); x.rotate(-Math.PI / 6);
  for (let yy = -H, r = 0; yy <= H; yy += 200, r++) for (let xx = -W * 1.2; xx <= W * 1.2; xx += 820) x.fillText('MUSCLE ATLAS · BALANCED BODY', xx + (r % 2 ? 410 : 0), yy);
  x.restore();
  x.drawImage(cInk, 0, 0);
  // crédito pequeño dentro de la lámina
  x.save(); x.globalAlpha = 0.55; x.fillStyle = '#3F4A57'; x.font = '500 20px Montserrat, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'bottom';
  x.fillText('Muscle Atlas · Digital Coloring Book · © Balanced Body', W / 2, H - 14); x.restore();
  for (const [key, v] of Object.entries(texts)) {
    const r = zoneRect(key); if (!r) continue; const hpt = (r[3] - r[1]) * PT;
    x.fillStyle = '#1F3B73'; x.font = `600 ${key[0] === 'c' ? hpt * .75 : Math.min(hpt * .62, 40)}px Caveat, cursive`;
    x.textBaseline = 'middle'; x.textAlign = key[0] === 'c' ? 'center' : 'left';
    x.fillText(v, key[0] === 'c' ? (r[0] + r[2]) * PT / 2 : r[0] * PT + 8, (r[1] + r[3]) * PT / 2, (r[2] - r[0]) * PT - 12);
  }
  // pie con la información del curso
  x.fillStyle = '#3F4A57'; x.fillRect(0, H, W, FOOT);
  let lwUsed = 0;
  if (logo) { const lh = 48, lw = lh * logo.width / logo.height; x.drawImage(logo, 50, H + (FOOT - lh) / 2, lw, lh); lwUsed = lw; }
  const avail = W - 50 - (50 + lwUsed + 60);
  const fitFont = (txt, wt, size) => { let s = size; do { x.font = `${wt} ${s}px Montserrat, sans-serif`; s -= 1; } while (x.measureText(txt).width > avail && s > 12); };
  x.fillStyle = '#fff'; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
  const L1 = 'MUSCLE ATLAS · DIGITAL COLORING BOOK', L2 = 'Anatomy + Movement™ · 2026 Digital Edition';
  fitFont(L1, 600, 30); x.fillText(L1, W - 50, H + 68);
  fitFont(L2, 400, 22); x.globalAlpha = .85; x.fillText(L2, W - 50, H + 104); x.globalAlpha = 1;
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
  const file = new File([blob], `muscle-atlas-page-${cur}.jpg`, { type: 'image/jpeg' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Muscle Atlas · Digital Coloring Book' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Plate saved to Downloads');
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
    ['indie', 'Yoga guitar', 'Soft, flowing arpeggios', '🌿'],
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
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800; const bus = ac.createGain(); bus.gain.value = 0.6; lp.connect(bus); bus.connect(master); bus.connect(verb); keep(lp, bus);
      const PROG = [[52, 59, 64, 67, 71, 76], [48, 55, 64, 67, 72, 76], [43, 50, 59, 62, 67, 71], [45, 52, 60, 64, 69, 72]];
      let ci = 0;
      const bar = () => { const t0 = ac.currentTime + 0.05, ch = PROG[ci++ % 4], step = 0.375;
        for (const m of ch.slice(0, 2)) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = hz(m);
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.025, t0 + 1.2); g.gain.linearRampToValueAtTime(0, t0 + 6.4); o.connect(g).connect(lp); o.start(t0); o.stop(t0 + 6.5); }
        const pat = Math.random() < 0.5 ? [0, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3, 2] : [0, 3, 2, 4, 3, 5, 4, 3, 1, 3, 2, 4, 3, 5, 4, 2];
        pat.forEach((k, i) => pluck(ch[k], t0 + i * step + (Math.random() - 0.5) * 0.02, 0.09 + Math.random() * 0.04)); };
      bar(); every(bar, 6000);
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
const STORIES = {};   // English narration: coming soon
const story = new Audio(); story.preload = 'none';
function storyUI() {
  const st = STORIES[cur]; const b = $('#storyBtn');
  b.hidden = !st; if (!st) { if (!story.paused) story.pause(); return; }
  const playing = !story.paused && story.dataset.p == cur;
  b.classList.toggle('on', playing);
  $('#storyLabel').textContent = playing ? 'Pause' : (story.dataset.p == cur && story.currentTime > 1 ? 'Resume' : 'Listen');
}
$('#storyBtn').onclick = () => {
  const st = STORIES[cur]; if (!st) return;
  if (story.dataset.p != cur) { story.src = st.src; story.dataset.p = cur; }
  if (story.paused) { if (MUSIC.cur) MUSIC.stop(); story.play().catch(() => toast('The audio could not be played')); } else story.pause();
};
story.addEventListener('play', storyUI); story.addEventListener('pause', storyUI); story.addEventListener('ended', () => { story.currentTime = 0; storyUI(); });
story.addEventListener('timeupdate', () => { const p = story.duration ? story.currentTime / story.duration : 0; $('#storyBar').style.width = (p * 100) + '%'; });
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
