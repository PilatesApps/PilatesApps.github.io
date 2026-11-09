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
  ['Azul', '#2F62D6'], ['Celeste', '#16B3A8'], ['Verde', '#1E9E4A'], ['Amarillo', '#F2C230'],
  ['Naranja', '#E8732A'], ['Terracota', '#BE4136'], ['Rojo', '#F01D24'], ['Rosado', '#E5578E'], ['Morado', '#8E3FD1'],
  ['Piel', '#E8B596'], ['Blanco rosado', '#F4E4DE'], ['Hueso', '#EADFC4'], ['Gris', '#9AA3AD'],
  ['Blanco', '#FFFFFF'], ['Negro', '#1C1C1C']
];
const BRUSHES = [
  { id: 'marcador', name: 'Marcador', size: 18, opa: 70, hard: 85 },
  { id: 'lapiz', name: 'Lápiz', size: 6, opa: 90, hard: 60 },
  { id: 'creyon', name: 'Creyón', size: 16, opa: 90, hard: 50 },
  { id: 'tiza', name: 'Tiza', size: 22, opa: 70, hard: 40 },
  { id: 'carboncillo', name: 'Carboncillo', size: 18, opa: 85, hard: 30 },
  { id: 'acuarela', name: 'Acuarela', size: 34, opa: 80, hard: 10 },
  { id: 'oleo', name: 'Óleo', size: 30, opa: 100, hard: 90 },
  { id: 'aero', name: 'Aerógrafo', size: 50, opa: 25, hard: 0 },
  { id: 'chispeado', name: 'Chispeado', size: 44, opa: 100, hard: 60 },
  { id: 'fibras', name: 'Fibras', size: 34, opa: 90, hard: 60 },
  { id: 'sombreado', name: 'Sombreado', size: 40, opa: 85, hard: 70 },
  { id: 'degradado', name: 'Degradado', size: 0, opa: 100, hard: 100 },
  { id: 'balde', name: 'Balde', size: 0, opa: 90, hard: 100 },
  { id: 'textura', name: 'Textura', size: 40, opa: 100, hard: 100 },
  { id: 'borrador', name: 'Borrador', size: 26, opa: 100, hard: 80 },
  { id: 'magia', name: 'Borrador mágico', size: 26, opa: 100, hard: 80 },
  { id: 'pluma', name: 'Escribir', size: 3, opa: 100, hard: 100 },
  { id: 'resaltador', name: 'Resaltador', size: 24, opa: 45, hard: 100 },
  { id: 'boligrafo', name: 'Bolígrafo', size: 2.4, opa: 100, hard: 100 },
  { id: 'teclado', name: 'Teclado', size: 0, opa: 100, hard: 100 },
  { id: 'gotero', name: 'Cuentagotas', size: 0, opa: 100, hard: 100 },
];
const store = {
  get(k, d) { try { const v = localStorage.getItem('am:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('am:' + k, JSON.stringify(v)); } catch (e) {} }
};
let brush = store.get('brush', 'marcador'); if (brush === 'gotero') brush = 'marcador';
let prevBrush = null;
let lastPaint = store.get('lastPaint', 'marcador');   // para volver a pintar después de borrar   // para volver del cuentagotas
let color = store.get('color', COLORS[0][1]);
let recent = store.get('recent', []);
let settings = store.get('settings', {});   // por lápiz: {size,opa,hard}
let tape = store.get('tape', true);
const B = id => BRUSHES.find(b => b.id === id);
const HL = [['Amarillo', '#FFF200'], ['Celeste', '#3FE6FF'], ['Rosado', '#FF58C8'], ['Verde', '#6BFF4A']];
const PEN = [['Azul', '#1F3B9E'], ['Negro', '#1C1C1C'], ['Rojo', '#C62828']];
const FREE = ['resaltador', 'boligrafo'];
const TEXT_BRUSHES = ['resaltador', 'boligrafo', 'borrador'];
const TEXT_OFF = ['balde', 'textura', 'degradado', 'teclado', 'pluma', 'magia'];   // en cuentos y textos se pinta libre: todo menos el balde y lo de escribir en cuadritos
const ERASERS = ['borrador', 'magia'];
let hlColor = store.get('hl', HL[0][1]), penColor = store.get('pen', PEN[0][1]);
const isText = () => page && !page.plate;
const S = () => Object.assign({ size: B(brush).size, opa: B(brush).opa, hard: B(brush).hard }, settings[brush] || {});



/* ---------------- instalar como app ---------------- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; showInstall(); });
window.addEventListener('appinstalled', () => { $('#btnInstall').hidden = true; $('#instBox').hidden = true; toast('App instalada: ya puede usarla sin internet'); });
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
      inapp: '<p>Este enlace se abrió dentro de otra app (WhatsApp, Instagram...) y ahí no se puede instalar.</p><ol><li>Toque los <b>tres puntitos</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> de arriba.</li><li>Elija <b>Abrir en Chrome</b> (o <b>Abrir en Safari</b> en iPhone).</li><li>Allí toque el botón amarillo <b>Instalar</b>.</li></ol>',
      ios: ipad
        ? '<p>En el iPad, con <b>Safari</b>:</p><ol><li>Arriba a la derecha, junto a la dirección, toque <b>Compartir</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span> (el cuadrito con la flecha hacia arriba).</li><li>Deslice la lista hacia abajo y toque <b>Agregar a pantalla de inicio</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>.</li><li>Arriba a la derecha toque <b>Agregar</b>.</li></ol>'
        : '<p>En el iPhone, con <b>Safari</b>:</p><ol><li>Vaya <b>abajo de la pantalla</b>, a la barra de Safari, y toque los <b>tres puntitos</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> de la derecha.<br><small>Si su iPhone muestra el botón <b>Compartir</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span> abajo en el centro, tóquelo directamente y pase al paso 3.</small></li><li>Toque <b>Compartir</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span>.</li><li>Deslice la lista hacia abajo y toque <b>Agregar a pantalla de inicio</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>.</li><li>Arriba a la derecha toque <b>Agregar</b>. El ícono del Atlas aparece en su pantalla.</li></ol>',
      'ios-other': '<p>En iPhone o iPad lo más fácil es <b>Safari</b>:</p><ol><li>Copie el enlace y ábralo en <b>Safari</b>.</li><li>Abajo, toque los <b>tres puntitos</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> y luego <b>Compartir</b> <span class="ico"><svg viewBox="0 0 24 24"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg></span>.</li><li>Toque <b>Agregar a pantalla de inicio</b> <span class="ico"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span> y luego <b>Agregar</b>.</li></ol>',
      samsung: '<ol><li>Toque el menú (las <b>tres rayitas</b> abajo a la derecha).</li><li>Toque <b>Añadir página a</b> y luego <b>Pantalla de inicio</b>.</li></ol><p>O abra el enlace en Chrome y use el botón amarillo <b>Instalar</b>.</p>',
      android: '<ol><li>En Chrome, toque los <b>tres puntitos</b> <span class="ico"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></span> de arriba a la derecha.</li><li>Elija <b>Instalar aplicación</b> o <b>Agregar a la pantalla principal</b>.</li><li>Confirme con <b>Instalar</b>.</li></ol>',
      desktop: '<ol><li>En Chrome o Edge, toque el ícono de instalar en la barra de direcciones.</li><li>O abra el menú y elija <b>Instalar Atlas Muscular</b>.</li></ol>'
    };
    $('#instText').innerHTML = T[e] + '<p>Una vez instalada, funciona <b>sin internet</b>.</p>';
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
  else if (id === 'fibras') { x.lineCap = 'round'; for (let i = 0; i < 9; i++) { const o = (i - 4) * 2.1; x.globalAlpha = .45 + (i % 3) * .2; x.lineWidth = 1.1; x.beginPath(); x.moveTo(10, 30 + o); x.bezierCurveTo(30, 6 + o, 55, 40 + o, 78, 14 + o); x.stroke(); } }
  else if (id === 'sombreado') { x.save(); x.beginPath(); x.ellipse(44, 22, 30, 15, 0, 0, 7); x.clip(); x.lineWidth = 1; for (let i = -60; i < 120; i += 5) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 44, 44); x.stroke(); } x.globalAlpha = .7; for (let i = -60; i < 120; i += 5) { x.beginPath(); x.moveTo(i + 44, 0); x.lineTo(i, 44); x.stroke(); } x.restore(); }
  else if (id === 'degradado') { const g = x.createLinearGradient(16, 0, 72, 0); g.addColorStop(0, '#3F4A57'); g.addColorStop(1, 'rgba(63,74,87,.08)'); x.fillStyle = g; x.beginPath(); x.ellipse(44, 22, 30, 15, 0, 0, 7); x.fill(); x.fillStyle = '#3F4A57'; x.beginPath(); x.arc(18, 22, 3, 0, 7); x.fill(); x.strokeStyle = '#3F4A57'; x.beginPath(); x.arc(70, 22, 3, 0, 7); x.stroke(); }
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
  const lb = document.getElementById('dkColorName'); if (lb) lb.textContent = er ? 'Borrando' : 'Color';
  const szBadge = document.getElementById('dkSz'); if (szBadge) { const sz = S().size; szBadge.textContent = sz > 0 ? sz : ''; szBadge.hidden = sz === 0; }
}
function openSheet(sec) {
  const b = document.body;
  if (b.classList.contains('sheet') && b.dataset.sheet === sec) { closeSheet(); return; }
  b.dataset.sheet = sec; b.classList.add('sheet');
  document.querySelectorAll('.dk').forEach(d => d.classList.toggle('on', d.id === 'dk' + sec[0].toUpperCase() + sec.slice(1)));
  $('#tools').scrollTop = 0;
  // Primera vez que abre herramientas: flash rápido al sliderRow para que se note
  if (sec === 'tool' && !store.get('shownSliders')) {
    store.set('shownSliders', true);
    setTimeout(() => {
      const sr = $('#sliderRow'); if (!sr) return;
      sr.classList.add('slider-pulse');
      sr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      setTimeout(() => { $('#tools').scrollTop = 0; sr.classList.remove('slider-pulse'); }, 1200);
    }, 400);
  }
}
function closeSheet() { document.body.classList.remove('sheet'); document.querySelectorAll('.dk').forEach(d => d.classList.remove('on')); }
function buildBrushes() {
  const row = $('#brushRow'); row.innerHTML = '';
  const GROUPS = [['Dibujar', ['lapiz', 'marcador', 'creyon', 'carboncillo', 'tiza']],
                  ['Pintar', ['acuarela', 'oleo', 'aero', 'chispeado']],
                  ['Anatomía: fibras y volumen', ['fibras', 'sombreado', 'degradado']],
                  ['Rellenar y borrar', ['balde', 'textura', 'borrador', 'magia']],
                  ['Escribir y marcar', ['pluma', 'teclado', 'boligrafo', 'resaltador']]];
  for (const [gname, ids] of GROUPS) {
    const list = ids.map(B).filter(b => !(isText() && TEXT_OFF.includes(b.id)) && !(page && page.nobucket && (b.id === 'balde' || b.id === 'textura' || b.id === 'degradado')));
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
    const lab = document.createElement('span'); lab.className = 'plabel'; lab.textContent = hl ? 'Resaltador fosforescente' : 'Bolígrafo'; row.appendChild(lab);
    return;
  }
  if (ERASERS.includes(brush)) { const nt = document.createElement('div'); nt.className = 'glabel erasing'; nt.textContent = 'Está borrando: toque un color para volver a pintar'; row.appendChild(nt); }
  for (const [n, c] of COLORS) {
    const b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.title = n;
    b.setAttribute('aria-label', n); b.setAttribute('aria-pressed', c.toLowerCase() === color.toLowerCase()); b.innerHTML = `<span>${n}</span>`;
    b.onclick = () => setColor(c); row.appendChild(b);
  }
  const extra = recent.filter(c => !COLORS.some(k => k[1].toLowerCase() === c.toLowerCase()));
  const gl = document.createElement('div'); gl.className = 'glabel'; gl.textContent = extra.length ? 'Otros colores y usados hace poco' : 'Otro color'; row.appendChild(gl);
  const wh = document.createElement('button'); wh.className = 'tool wheel'; wh.title = 'Otro color'; wh.setAttribute('aria-label', 'Elegir otro color');
  wh.onclick = () => { const p = $('#colorPick'); p.value = color; setTimeout(closeSheet, 80); p.click(); }; row.appendChild(wh);
  const gt = document.createElement('button'); gt.className = 'tool drop'; gt.title = 'Cuentagotas: tomar un color de la lámina'; gt.setAttribute('aria-label', 'Cuentagotas');
  gt.setAttribute('aria-pressed', brush === 'gotero');
  gt.innerHTML = '<svg viewBox="0 0 24 24"><path d="m14 4 6 6M12 6l6 6-9 9H3v-6z"/></svg><span>Cuentagotas</span>';
  gt.onclick = () => { if (brush !== 'gotero') prevBrush = brush; brush = 'gotero'; updateDock(); closeSheet(); toast('Toque un color ya pintado en la lámina'); };
  row.appendChild(gt);
  for (const c of extra) {
    const b = document.createElement('button'); b.className = 'sw recent'; b.style.background = c; b.title = 'Usado hace poco';
    b.setAttribute('aria-pressed', c.toLowerCase() === color.toLowerCase()); b.onclick = () => setColor(c); row.appendChild(b);
  }
}
$('#colorPick').addEventListener('input', e => setColor(e.target.value));
$('#colorPick').addEventListener('change', () => setTimeout(closeSheet, 150));
document.addEventListener('click', e => { if (e.target.closest('#colorRow .sw')) { updateDock(); setTimeout(closeSheet, 150); } });
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
function toggleLock() { locks[cur] = !isLocked(); if (!locks[cur]) delete locks[cur]; store.set('locks', locks); syncLock(); buzz(12); toast(isLocked() ? 'Lámina bloqueada: su dibujo está protegido' : 'Lámina desbloqueada: puede seguir pintando'); if (isLocked()) { const had = DONE[cur]; checkDone(true); if (!DONE[cur] && !had && page.plate) setTimeout(() => toast('Cuando la lámina quede completa, con su cuadro escrito, ganará su estrella'), 2200); } }
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
  $('#sSize').previousElementSibling.textContent = tx ? 'Tamaño' : 'Grosor'; $('#sHard').parentElement.hidden = tx;
  const tr = $('#texRow'); if (tr) { tr.hidden = !tx; if (tx) buildTex(); }
  $('#sSize').value = s.size; $('#oSize').textContent = s.size;
  $('#sOpa').value = s.opa; $('#oOpa').textContent = s.opa + '%';
  $('#sHard').value = s.hard; $('#oHard').textContent = s.hard + '%';
}
for (const [id, key, out, suf] of [['#sSize', 'size', '#oSize', ''], ['#sOpa', 'opa', '#oOpa', '%'], ['#sHard', 'hard', '#oHard', '%']]) {
  $(id).addEventListener('input', e => {
    settings[brush] = Object.assign({}, settings[brush], { [key]: +e.target.value }); store.set('settings', settings);
    $(out).textContent = e.target.value + suf;
    if (key === 'size') updateDock();
  });
  if (key === 'size') $(id).addEventListener('change', () => { if (brush === 'textura') buildTex(); });
}
const sndBtn = $('#btnSound');
function syncSound() { sndBtn.classList.toggle('on', sound); sndBtn.setAttribute('aria-checked', sound); }
sndBtn.onclick = () => { sound = !sound; store.set('sound', sound); syncSound(); if (sound) { SFX.blip('tick'); buzz(10); } };
syncSound();
const tapeBtn = $('#btnTape');
function syncTape() { tapeBtn.classList.toggle('on', tape); tapeBtn.setAttribute('aria-checked', tape); $('#dkTape').classList.toggle('active', tape); $('#dkTape').setAttribute('aria-pressed', tape); }
tapeBtn.onclick = () => { tape = !tape; store.set('tape', tape); syncTape(); toast(tape ? 'No salirme: el color se queda dentro de la parte que empezó a pintar' : 'Libre: el color puede salirse de la línea'); };

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

/* pasar la hoja: la página vieja se levanta, se curva como papel y gira, con su sombra */
function pageFlip(fwd) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const vr = viewport.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    if (sr.width < 20) return;
    const k = Math.min(1, 900 / sr.width) * Math.min(2, devicePixelRatio || 1), cw = Math.round(sr.width * k), ch = Math.round(sr.height * k);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, cw, ch);
    for (const el of [pageImg, cWipe, cColor, $('#topImg'), cTop, cInk]) { try { if (el && !el.hidden && (el.tagName !== 'IMG' || el.complete && el.naturalWidth)) x.drawImage(el, 0, 0, cw, ch); } catch (e) {} }
    document.querySelectorAll('.flip').forEach(f => f.remove());
    const f = document.createElement('div'); f.className = 'flip';
    Object.assign(f.style, { position: 'fixed', left: sr.left + 'px', top: sr.top + 'px', width: sr.width + 'px', height: sr.height + 'px' });
    const under = document.createElement('div'); under.className = 'under'; f.appendChild(under);
    const N = 16, sw = sr.width / N, csw = cw / N, strips = [];
    let parent = f;
    for (let n = 0; n < N; n++) {
      const i = fwd ? n : N - 1 - n;                    // la tira 0 es la que está pegada al lomo
      const d = document.createElement('div'); d.className = 'strip';
      Object.assign(d.style, { width: (sw + 1.5) + 'px', height: sr.height + 'px', top: '0px', transformOrigin: fwd ? 'left center' : 'right center' });
      if (n === 0) d.style[fwd ? 'left' : 'right'] = '0px'; else d.style[fwd ? 'left' : 'right'] = sw + 'px';
      const fr = document.createElement('canvas'); fr.className = 'face front'; fr.width = Math.ceil(csw) + 1; fr.height = ch; fr.getContext('2d').drawImage(c, Math.floor(i * csw), 0, Math.ceil(csw) + 1, ch, 0, 0, Math.ceil(csw) + 1, ch);
      const bk = document.createElement('div'); bk.className = 'face back';
      const sh = document.createElement('div'); sh.className = 'shade';
      d.append(bk, fr, sh); parent.appendChild(d); strips.push({ d, sh, fr }); parent = d;
    }
    document.body.appendChild(f);   // por encima de todo: la hoja puede salir del marco al girar
    const D = window.__flipD || 950, t0 = performance.now(), sg = fwd ? -1 : 1;
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / D), e = ease(t), lift = Math.sin(Math.PI * t);
      const total = 180 * e, bend = 75 * lift;           // a mitad de camino la hoja se curva más (el borde libre va por detrás)
      let acc = 0;
      for (let n = 0; n < N; n++) {
        const w = n === 0 ? total : bend * (n / (N - 1)) * (2 / (N - 1)) * (1 - e * .25);
        acc += w; const st = strips[n];
        st.d.style.transform = n === 0 ? `translateZ(${lift * 30}px) rotateZ(${sg * -lift * 2.5}deg) rotateY(${sg * w}deg)` : `rotateY(${sg * w}deg)`;
        st.sh.style.opacity = (Math.abs(Math.sin(acc * Math.PI / 180)) * .32 + (n / N) * lift * .12).toFixed(3);
        st.fr.style.visibility = acc > 90 ? 'hidden' : 'visible';   // pasada la mitad se ve el dorso del papel
      }
      under.style.opacity = (lift * .8).toFixed(3);
      if (t < 1) requestAnimationFrame(step); else f.remove();
    };
    requestAnimationFrame(step);
    setTimeout(() => f.remove(), D + 400);
  } catch (e) {}
}
async function openPage(n) {
  n = Math.max(1, Math.min(N, n));
  if (typeof RETO !== 'undefined' && META.length && !RETO.unidadAbierta(n)) {
    // En modo progresivo: abrir el reto de la unidad que lo bloquea, en vez de solo mostrar toast
    const si = SECTIONS.findIndex(([, , a, b]) => n >= a && n <= b);
    let retoAbierto = false;
    for (let k = 1; k < si; k++) {
      const [, , a, b] = SECTIONS[k]; const [d, t] = plateCount(a, b);
      if (!RETO.aprobado(k) && RETO.U[k]) { setTimeout(() => RETO.abrir(k), 100); retoAbierto = true; break; }
    }
    if (!retoAbierto) toast('Modo progresivo: complete la unidad anterior y apruebe su reto para abrir esta');
    if (page) return; n = 1;
  }
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
  if (page.nobucket) setTimeout(() => toast('Lienzo libre: dibuje el grupo muscular completo, de origen a inserción, como usted quiera'), 600);
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
  if (page.nobucket && (brush === 'balde' || brush === 'textura' || brush === 'degradado')) { brush = 'marcador'; }   // solo en esta página, no se guarda
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
    case 'fibras': {
      // fibras musculares: hebras finas y paralelas que siguen la dirección del trazo, con tonos claros y oscuros y un fondo suave
      const st = stroke; if (!st.fb) {
        st.fb = []; const n = Math.max(6, Math.min(30, r * 0.75 | 0));
        for (let i = 0; i < n; i++) st.fb.push({ o: ((i + .5) / n * 2 - 1) * .95, w: .35 + Math.random() * .5, c: Math.random() < .4 ? mix(color, '#ffffff', .3 + Math.random() * .3) : mix(color, '#000000', .25 + Math.random() * .35), ph: Math.random() * 7, last: null, gap: 0 });
        st.fbase = mix(color, '#ffffff', .12);
      }
      const nx = -Math.sin(dir), ny = Math.cos(dir); X.save(); X.lineCap = 'round';
      if (st.fL) { X.globalAlpha = .55 + hard * .4; X.fillStyle = st.fbase; const L = [x + nx * r, y + ny * r], R = [x - nx * r, y - ny * r]; X.beginPath(); X.moveTo(st.fL[0], st.fL[1]); X.lineTo(L[0], L[1]); X.lineTo(R[0], R[1]); X.lineTo(st.fR[0], st.fR[1]); X.closePath(); X.fill(); }
      st.fL = [x + nx * r, y + ny * r]; st.fR = [x - nx * r, y - ny * r];
      X.globalAlpha = 1;
      for (const b of st.fb) {
        b.ph += .25; const wob = Math.sin(b.ph) * r * .025, px = x + nx * (b.o * r + wob), py = y + ny * (b.o * r + wob);
        if (b.gap > 0) b.gap--; else if (Math.random() < .006) b.gap = 3 + (Math.random() * 6 | 0);   // la hebra se corta un instante: se ve fibrosa
        if (b.last && !b.gap) { X.strokeStyle = b.c; X.lineWidth = Math.max(.6, r / st.fb.length * 1.3 * b.w); X.beginPath(); X.moveTo(b.last[0], b.last[1]); X.lineTo(px, py); X.stroke(); }
        b.last = [px, py];
      }
      X.restore(); break;
    }
    case 'sombreado': {
      // rayado de grabado: líneas paralelas en diagonal sobre una rejilla fija (así las pasadas coinciden); con más dureza se cruzan
      const sp2 = Math.max(4, r * .22), X2 = X; X2.save(); X2.beginPath(); X2.arc(x, y, r, 0, 7); X2.clip();
      X2.strokeStyle = color; X2.lineWidth = Math.max(.8, sp2 * .22); X2.lineCap = 'butt';
      const fam = (ang) => { const ca = Math.cos(ang), sa = Math.sin(ang), c0 = x * -sa + y * ca; const k0 = Math.floor((c0 - r * 1.5) / sp2), k1 = Math.ceil((c0 + r * 1.5) / sp2);
        for (let kk = k0; kk <= k1; kk++) { const c = kk * sp2, bx = -sa * c, by = ca * c; X2.beginPath(); X2.moveTo(bx + ca * (x * ca + y * sa - r * 2), by + sa * (x * ca + y * sa - r * 2)); X2.lineTo(bx + ca * (x * ca + y * sa + r * 2), by + sa * (x * ca + y * sa + r * 2)); X2.stroke(); } };
      fam(Math.PI / 4); if (hard > .5) { X2.globalAlpha = Math.min(1, (hard - .5) * 2.2); fam(-Math.PI / 4); }
      X2.restore(); break;
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
/* degradado: del color elegido (oscuro) a casi blanco, dentro de la parte tocada. Dos toques o arrastrar */
let gradA = null;
function gradMark(x, y) { xLive.clearRect(0, 0, W, H); xLive.save(); xLive.fillStyle = color; xLive.strokeStyle = '#fff'; xLive.lineWidth = 3; xLive.beginPath(); xLive.arc(x, y, 9, 0, 7); xLive.fill(); xLive.stroke(); xLive.restore(); cLive.style.opacity = 1; }
function gradCanvas(z, a, b) {
  const [x0, y0, x1, y1] = z.box, w = x1 - x0, h = y1 - y0; const t = document.createElement('canvas'); t.width = w; t.height = h; const tx = t.getContext('2d');
  const g = tx.createLinearGradient(a[0] - x0, a[1] - y0, b[0] - x0, b[1] - y0); g.addColorStop(0, color); g.addColorStop(1, mix(color, '#ffffff', .88));
  tx.fillStyle = g; tx.fillRect(0, 0, w, h);
  tx.globalCompositeOperation = 'destination-in'; tx.drawImage(z.c, x0, y0, w, h, 0, 0, w, h);
  if (lockCanvas) { tx.globalCompositeOperation = 'destination-out'; tx.drawImage(lockCanvas, x0, y0, w, h, 0, 0, w, h); }
  return t;
}
function gradPreview(a, b) { const z = stroke ? stroke.z : null; if (!z) return; xLive.clearRect(0, 0, W, H); xLive.drawImage(gradCanvas(z, a, b), z.box[0], z.box[1]); }
function gradCommit(z, a, b) {
  const [x0, y0, x1, y1] = z.box; pushUndo('color', x0, y0, x1 - x0, y1 - y0);
  xColor.save(); xColor.globalAlpha = S().opa / 100; xColor.drawImage(gradCanvas(z, a, b), x0, y0); xColor.restore();
  cLive.style.opacity = 1; SFX.blip('fill'); buzz(18); queueSave();
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
  if (isLocked()) { toast('Lámina bloqueada: toque el candado para seguir pintando'); return; }
  const [x, y] = toPage(e), s = S();
  if (brush === 'gotero') { pickColor(x, y); return; }
  if (brush === 'balde') { if (page.nobucket) { toast('En esta página se pinta a mano: elija un lápiz'); return; } bucket(x, y); return; }
  if (brush === 'textura') { if (page.nobucket) { toast('En esta página se pinta a mano: elija un lápiz'); return; } texFill(x, y); return; }
  if (brush === 'degradado') {
    if (page.nobucket || !labels) { toast('En esta página se pinta a mano: elija un lápiz'); return; }
    const L = labelAt(x, y); if (!L) return; const z = zoneMask(L);
    stroke = { brush, s, grad: true, L, z, p0: [x, y], last: [x, y], box: z.box.slice(), id: e.pointerId, layer: 'color' };
    cLive.style.opacity = s.opa / 100; cLive.style.mixBlendMode = 'normal'; cLive.style.zIndex = '';
    if (gradA && gradA.L === L && cur === gradA.n) gradPreview(gradA.p, [x, y]); else gradMark(x, y);
    return;
  }
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
    if (layer === 'ink' && !wz) { toast('Escribe dentro de los cuadritos o las bolitas'); return; }
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
  cLive.style.mixBlendMode = 'normal'; cLive.style.zIndex = stroke.layer === 'ink' ? '4' : '';   // source-over: siempre encima, incluido sobre texturas oscuras
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
  if (stroke.grad) { const [x, y] = toPage(e); stroke.last = [x, y]; if (Math.hypot(x - stroke.p0[0], y - stroke.p0[1]) > 10) { stroke.dragged = true; gradPreview(stroke.p0, [x, y]); } return; }
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  const b0 = stroke.box.slice();
  for (const ev of evs) {
    let [x, y] = toPage(ev); const r = radius(ev);
    const k = (stroke.brush === 'pluma' || stroke.brush === 'boligrafo') ? 0.55 : 0.4;   // suavizado
    if (stroke.sm) { x = stroke.sm[0] + (x - stroke.sm[0]) * k; y = stroke.sm[1] + (y - stroke.sm[1]) * k; }
    stroke.sm = [x, y];
    const [lx, ly] = stroke.last, dx = x - lx, dy = y - ly, d = Math.hypot(dx, dy);
    const sp = Math.max(0.5, r * (stroke.brush === 'aero' ? 0.15 : stroke.brush === 'chispeado' ? 0.3 : stroke.brush === 'fibras' ? 0.1 : stroke.brush === 'sombreado' ? 0.3 : stroke.brush === 'oleo' ? 0.12 : stroke.brush === 'acuarela' ? 0.22 : stroke.brush === 'tiza' ? 0.3 : stroke.brush === 'carboncillo' ? 0.2 : (stroke.brush === 'marcador' || stroke.brush === 'pluma' || stroke.brush === 'borrador' || stroke.brush === 'magia' || stroke.brush === 'resaltador' || stroke.brush === 'boligrafo') ? 0.08 : 0.18));
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
  if (stroke.grad) {
    const st = stroke; stroke = null; xLive.clearRect(0, 0, W, H);
    if (st.dragged) { gradA = null; gradCommit(st.z, st.p0, st.last); return; }
    if (gradA && gradA.L === st.L && gradA.n === cur) { const a = gradA.p; gradA = null; gradCommit(st.z, a, st.p0); return; }
    gradA = { L: st.L, p: st.p0, n: cur }; gradMark(st.p0[0], st.p0[1]); toast('Ahora toque donde el color se aclara (o arrastre de oscuro a claro)'); return;
  }
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
    redo.length = 0; xLive.clearRect(0, 0, W, H); cLive.style.opacity = 1; cLive.style.filter = '';
    if (st.magic && Object.keys(texts).length) {
      let changed = false;
      for (const key of Object.keys(texts)) {
        const r = zoneRect(key); if (!r) continue;
        const rx0 = r[0] * PT, ry0 = r[1] * PT, rx1 = r[2] * PT, ry1 = r[3] * PT;
        if (rx1 >= x0 && rx0 <= x1 && ry1 >= y0 && ry0 <= y1) { delete texts[key]; changed = true; }
      }
      if (changed) { renderTexts(); store.set('texts', texts); }
    }
    queueSave(); return;
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
    ctx.globalAlpha = st.brush === 'borrador' ? st.s.opa / 100 : st.s.opa / 100;
    ctx.drawImage(cLive, x0, y0, w, h, x0, y0, w, h);
    ctx.restore();
  }
  xLive.clearRect(0, 0, W, H); cLive.style.opacity = 1; cLive.style.filter = '';
  try { checkDone(true); } catch(e) {}
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
const TEXTURES = [['lino', 'Lino'], ['acuarela', 'Papel acuarela'], ['madera', 'Madera'], ['marmol', 'Mármol'], ['jean', 'Jean'], ['kraft', 'Papel kraft'],
  ['puntos', 'Puntos'], ['rayas', 'Rayas'], ['cuadros', 'Cuadritos'], ['ondas', 'Ondas'], ['estrellas', 'Estrellas'], ['flores', 'Flores'], ['corazones', 'Corazones']];
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
      texId = 'foto'; store.set('tex', texId); buildTex(); toast('Foto lista: toque la parte que quiere llenar');
    } catch (e) { toast('No se pudo abrir esa foto'); }
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
  head('Materiales');
  for (const [id, nm] of TEXTURES.slice(0, 6)) btn(id, nm, x => { x.fillStyle = x.createPattern(texTile(id, color, Math.min(k, .5)), 'repeat'); x.fillRect(0, 0, 96, 48); });
  head('Estampados (en el color elegido)');
  for (const [id, nm] of TEXTURES.slice(6)) btn(id, nm, x => { x.fillStyle = x.createPattern(texTile(id, color, Math.min(k, .4)), 'repeat'); x.fillRect(0, 0, 96, 48); });
  head('Su foto');
  btn('foto', texPhoto ? 'Su foto' : 'Elegir foto', x => {
    if (texPhoto) { const r = Math.max(96 / texPhoto.width, 48 / texPhoto.height); x.drawImage(texPhoto, (96 - texPhoto.width * r) / 2, (48 - texPhoto.height * r) / 2, texPhoto.width * r, texPhoto.height * r); }
    else { x.fillStyle = '#EEF1F4'; x.fillRect(0, 0, 96, 48); x.strokeStyle = '#3F4A57'; x.lineWidth = 2; x.strokeRect(30, 12, 36, 26); x.beginPath(); x.arc(48, 25, 7, 0, 7); x.stroke(); x.fillStyle = '#3F4A57'; x.fillRect(42, 8, 12, 5); }
  });
  if (texPhoto) {
    const ch = document.createElement('button'); ch.className = 'texopt'; ch.textContent = 'Cambiar foto'; ch.onclick = choosePhoto; row.appendChild(ch);
    for (const [v, nm] of [['completa', 'Completa'], ['mosaico', 'Estampado']]) {
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
  if (d[3] < 10) { toast('Ahí no hay color todavía'); return; }
  const hex = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  brush = (prevBrush && prevBrush !== 'gotero' && prevBrush !== 'borrador') ? prevBrush : 'marcador'; prevBrush = null; store.set('brush', brush); setColor(hex); buildBrushes(); syncSliders(); updateDock(); toast('Color tomado');
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
$('#btnUndo').onclick = () => { if (isLocked()) { toast('Lámina bloqueada'); return; } swap(undo, redo); };
$('#btnClear').onclick = () => { if (isLocked()) { toast('Lámina bloqueada'); return; } $('#confirmClear').hidden = false; };
// borrar todo el libro: tres confirmaciones
let wipeStep = 0;
const WIPE = ['Se borrará <b>todo el libro</b>: lo pintado y lo escrito en <b>todas las láminas</b>. ¿Desea continuar?',
  '¿Está seguro? <b>No se puede deshacer.</b> Todas sus láminas quedarán en blanco.',
  'Última confirmación: toque <b>Borrar todo</b> para dejar el libro completo en blanco.'];
function wipeRender() { $('#wipeText').innerHTML = WIPE[wipeStep]; $('#wipeSteps').innerHTML = WIPE.map((_, i) => `<i class="${i <= wipeStep ? 'on' : ''}"></i>`).join(''); $('#wipeYes').textContent = wipeStep < 2 ? `Confirmar (${wipeStep + 1} de 3)` : 'Borrar todo'; }
$('#btnWipeAll').onclick = () => { wipeStep = 0; wipeRender(); $('#wipeBox').hidden = false; };
$('#wipeNo').onclick = () => { $('#wipeBox').hidden = true; };
$('#wipeYes').onclick = async () => {
  if (wipeStep < 2) { wipeStep++; wipeRender(); return; }
  try { const d = await db(); await new Promise(ok => { const t = d.transaction('p', 'readwrite'); t.objectStore('p').clear(); t.oncomplete = ok; t.onerror = ok; }); } catch (e) {}
  locks = {}; store.set('locks', locks); clearTimeout(saveT); dirty = false;
  xColor.clearRect(0, 0, W, H); xInk.clearRect(0, 0, W, H); xMask.clearRect(0, 0, W, H); xWipe.clearRect(0, 0, W, H); wipeUsed = false; texts = {}; renderTexts(); undo.length = 0; redo.length = 0;
  if (typeof renderWipe === 'function') renderWipe(); syncLock(); $('#wipeBox').hidden = true; closeHome(); toast('Libro borrado: todas las láminas quedaron en blanco');
};
$('#clearNo').onclick = () => { $('#confirmClear').hidden = true; };
$('#clearYes').onclick = () => {
  pushUndo('color', 0, 0, W, H); xColor.clearRect(0, 0, W, H);
  pushUndo('ink', 0, 0, W, H); xInk.clearRect(0, 0, W, H);
  if (wipeUsed) { pushUndo('wipe', 0, 0, W, H); xMask.clearRect(0, 0, W, H); renderWipe(); }
  texts = {}; renderTexts(); $('#confirmClear').hidden = true; closeSheet(); queueSave(); toast('Lámina borrada');
};
$('#btnRedo').onclick = () => swap(redo, undo);

/* ---------------- escribir con teclado ---------------- */
let kbdZone = null;
function openKeyboard(x, y) {
  const wz = writeZoneAt(x, y); if (!wz) { toast('Toca un cuadrito o una bolita para escribir'); return; }
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
const PN = ['Portada', 'Edición Digital 2026', 'Bienvenida', 'Índice de contenido', 'Orden de construcción', 'Orden de construcción (2)',
  'El cuento de la Unidad 1', 'Los músculos de la Unidad 1', 'Lámina del grupo', 'Obturador externo', 'Obturador interno', 'Gemelo superior',
  'Gemelo inferior', 'Cuadrado femoral', 'Piriforme', 'Lienzo libre: dibuje la Unidad 1',
  'El cuento de la Unidad 2', 'Los músculos de la Unidad 2', 'Lámina del grupo', 'Ilíaco', 'Psoas mayor', 'Psoas menor', 'Lienzo libre: dibuje la Unidad 2',
  'El cuento de la Unidad 3', 'Los músculos de la Unidad 3', 'Lámina del grupo', 'Vasto intermedio', 'Vasto medial', 'Vasto lateral', 'Recto femoral', 'Sartorio', 'Lienzo libre: dibuje la Unidad 3'];
const SECTIONS = [['Inicio', '', 1, 6], ['Unidad 1', 'Músculos posteriores profundos de la cadera', 7, 16], ['Unidad 2', 'Músculos anteriores profundos de la cadera', 17, 23], ['Unidad 3', 'Músculos anteriores de la cadera y el muslo', 24, 32]];
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
  pr.innerHTML = `<div class="hp1"><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg><b>Su progreso</b><span>${bd} de ${bk} láminas completadas</span><em>${pct}%</em></div><div class="hbar"><i style="width:${pct}%"></i></div>`;
  g.appendChild(pr);
  for (const [t, sub, a, b] of SECTIONS) {
    const sec = document.createElement('div'); sec.className = 'hsec';
    const [sd, sk] = plateCount(a, b);
    const badge = sk ? (sd === sk ? `<span class="ribbon"><svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="m8.5 13.5-2 7.5 5.5-3 5.5 3-2-7.5"/></svg>Listón ganado</span>` : `<span class="stars">${sd}/${sk} <svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></span>`) : '';
    sec.innerHTML = `<h2>${t}${badge}${sub ? `<small>${sub}</small>` : ''}</h2>`;
    const cards = document.createElement('div'); cards.className = 'cards';
    for (let n = a; n <= Math.min(b, N); n++) {
      const c = document.createElement('button'); c.className = 'card' + (n === cur ? ' cur' : '');
      c.innerHTML = `<span class="th"><canvas width="153" height="198"></canvas><span class="n">${n}</span>${DONE[n] ? '<span class="star"><svg viewBox="0 0 24 24"><path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg></span>' : ''}${keys.has('p' + n) ? '<span class="dot"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></span>' : ''}</span><span class="t">${PN[n - 1]}</span>`;
      c.onclick = () => { closeHome(); openPage(n); };
      cards.appendChild(c); drawThumb(c.querySelector('canvas'), n);
    }
    const ui = SECTIONS.indexOf(SECTIONS.find(s => s[0] === t));
    if (RETO.U[ui]) {
      const rr = (store.get('reto', {})[ui]) || {}, rb = document.createElement('button'); rb.className = 'card reto' + (rr.ok ? ' won' : '');
      rb.innerHTML = `<span class="th rtth"><b>${rr.ok ? '⭐' : '🏆'}</b><em>${rr.ok ? 'Aprobado' : 'Reto'}</em>${rr.mejor ? `<small>${rr.mejor}%</small>` : ''}</span><span class="t">Reto de la ${t}</span>`;
      rb.onclick = () => RETO.abrir(ui); cards.appendChild(rb);
    }
    if (!RETO.unidadAbierta(a)) { sec.classList.add('locked'); cards.querySelectorAll('.card').forEach(c => { c.onclick = () => toast('Modo progresivo: complete la unidad anterior y apruebe su reto para abrir esta'); }); }
    sec.appendChild(cards); g.appendChild(sec);
  }
  const md = document.createElement('div'); md.className = 'hmodo'; const mo = store.get('modo', 'libre');
  md.innerHTML = `<b>Cómo quiere avanzar</b><div><button data-m="progresivo" class="${mo === 'progresivo' ? 'on' : ''}">Progresivo<small>Cada unidad se abre al completar la anterior y aprobar su reto</small></button><button data-m="libre" class="${mo === 'libre' ? 'on' : ''}">Libre<small>Todas las unidades abiertas</small></button></div>`;
  md.querySelectorAll('button').forEach(b => b.onclick = () => { store.set('modo', b.dataset.m); buildHome(); });
  g.insertBefore(md, g.children[1]);
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
  ['<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>', 'Elija y pinte', 'Abajo toque <b>la herramienta</b> y <b>el color</b>. Con <b>No salirme</b> encendido, el color se queda dentro de la parte que empezó a pintar: un músculo, un tendón, un hueso o un segmento.'],
  ['<circle cx="6" cy="12" r="2.5"/><line x1="9" y1="12" x2="22" y2="12"/><circle cx="18" cy="6" r="2.5"/><line x1="2" y1="6" x2="15" y2="6"/><circle cx="10" cy="18" r="2.5"/><line x1="2" y1="18" x2="7" y2="18"/><line x1="13" y1="18" x2="22" y2="18"/>', 'Grosor, opacidad y dureza', 'Dentro del panel de herramientas, <b>deslice hacia abajo</b> para ver tres controles: <b>Grosor</b> (línea fina o gruesa), <b>Opacidad</b> (transparente u opaco) y <b>Dureza</b> (borde suave o definido). Ajústelos antes de pintar para lograr exactamente el efecto que busca.'],
  ['<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>', 'Acerque y mueva la lámina', 'Abra dos dedos para ampliar y arrástrelos para mover la lámina: mientras usa dos dedos <b>no se pinta nada</b>. También tiene, arriba a la derecha, <b>la lupa</b> para ampliar o reducir y <b>la mano</b> para mover la lámina con un dedo, arriba, abajo y de lado. Toque la mano otra vez para volver a pintar.'],
  ['<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', 'Todas sus láminas', 'Deslice de lado o use <b>Anterior</b> y <b>Siguiente</b>, arriba de la lámina. Toque <b>el número de página</b> para ver todas las láminas y lo que ya pintó.'],
  ['<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>', 'Música para pintar', 'Toque <b>la nota musical</b> y elija la música que lo acompaña mientras colorea. Suena dentro de la app, también sin internet.'],
  ['<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>', 'Su obra no se borra', 'Lo que pinta <b>queda en su lámina</b>: puede cerrar la app, cambiar de página o volver otro día y todo sigue ahí, tal como lo dejó.'],
  ['<path d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M8 7h6M8 11h6"/>', 'Aprenda pintando', 'Antes de colorear, ubique <b>dónde nace</b> el músculo (su origen) y <b>dónde termina</b> (su inserción). Píntelo de punta a punta, siga la dirección de sus fibras y complete el cuadro: <b>músculo, origen, inserción y acción</b>. Así su mano y su ojo aprenden juntos.'],
  ['<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.2 5.2 0 0 0 22 9.2C22 5.8 17.5 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>', 'Libere su artista', 'Cuando termine sus músculos, <b>la lámina entera es su lienzo</b>. Decore, agregue fondos, dibujos y detalles, mezcle acuarela con lápiz, invente su paleta. Siéntase libre y expanda su mente: lo que se pinta con creatividad <b>se recuerda mejor</b> y se enseña con más pasión.'],
  ['<path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>', 'Firme y comparta su obra', 'Como el artista que es, <b>firme su obra y póngale la fecha</b> con el bolígrafo, en el lugar que usted quiera. Luego toque <b>la flecha hacia arriba</b>, arriba a la derecha, y elija cómo se verá: en el atril del pintor, en óleo, acuarela, tiza, grafito, cómic y más. Compártala por WhatsApp o en sus redes e inspire a otros a aprender pintando.']
];
let gi = 0;
function showGuide() {
  gi = 0; $('#guide').hidden = false; renderGuide();
}
function renderGuide() {
  const [ic, t, p] = GUIDE[gi];
  $('#gSlides').innerHTML = `<div class="gslide"><div class="gi"><svg viewBox="0 0 24 24">${ic}</svg></div><b>${t}</b><p>${p}</p></div>`;
  $('#gDots').innerHTML = GUIDE.map((_, i) => `<i class="${i === gi ? 'on' : ''}"></i>`).join('');
  $('#gNext').textContent = gi === GUIDE.length - 1 ? '¡A pintar!' : 'Siguiente';
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
  balde: ['<svg viewBox="0 0 32 32" style="stroke-width:1.15"><g transform="rotate(200 16 9)"><path d="M10 4h12l-1.6 9.5h-8.8z" fill="#fff"/><path d="M10 4h12l-1.6 9.5h-8.8zM11 4c0-3.6 10-3.6 10 0"/></g><path d="M16 31.6 13.9 25.4a2.2 2.2 0 1 1 4.2 0z" fill="var(--c)" stroke-width=".9"/></svg>', 16 * .72, 31.6 * .72, 23],
  textura: ['<svg viewBox="0 0 32 32"><rect x="14" y="14" width="16" height="16" rx="2.5" fill="#fff"/><path d="M14 19.3h16M14 24.7h16M19.3 14v16M24.7 14v16" stroke="var(--c)" stroke-width="1.6"/><rect x="14" y="14" width="16" height="16" rx="2.5"/><path d="M1.5 1.5v17l4.6-4.3 3.3 7.2 3-1.4-3.3-7h6.4z" fill="#fff"/></svg>', 1.5, 1.5],
  gotero: ['<svg viewBox="0 0 32 32"><path d="M19 5l8 8M16.5 7.5l8 8L12 28H4v-8z" fill="#fff"/><path d="M4 28l-1.6 1.6" /><circle cx="2.6" cy="29.4" r="2.2" fill="var(--c)" stroke-width="1"/></svg>', 2.6, 29.4],
  degradado: ['<svg viewBox="0 0 32 32"><defs><linearGradient id="cg" x1="0" x2="1"><stop offset="0" stop-color="var(--c)"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="12" y="14" width="18" height="14" rx="3" fill="url(#cg)"/><rect x="12" y="14" width="18" height="14" rx="3"/><path d="M1.5 1.5v17l4.6-4.3 3.3 7.2 3-1.4-3.3-7h6.4z" fill="#fff"/></svg>', 1.5, 1.5],
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
    if (ic) { const z = ic[3] || 32; h = `<b style="left:${-ic[1]}px;top:${-ic[2]}px;width:${z}px;height:${z}px">${ic[0].replace('<svg ', `<svg width="${z}" height="${z}" `)}</b>`; }
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
  if (hs) { const n = +hs.dataset.n; if (n) openPage(n); else toast('Disponible en la próxima versión'); return; }
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
    toast(Lz ? (nm ? `Zona ${Lz}: ${nm}` : `Zona ${Lz}: sin nombre todavía`) : 'Línea negra'); if (Lz && Lz !== page.bg) flashZones([Lz]); return; }
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
  if (gesture) { if (pointers.size < 2) { if (!gesture.moved && Date.now() - gesture.t < 300) { swap(undo, redo); toast('Deshecho'); } gesture = null; } return; }
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
$('#zHand').onclick = () => { hand = !hand; $('#zHand').classList.toggle('on', hand); document.body.classList.toggle('hand', hand); toast(hand ? 'Mover: arrastre con un dedo para mover la lámina. Toque la mano otra vez para volver a pintar' : 'Listo para pintar'); };
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
$('#btnNext').onclick = () => {
  // En modo progresivo: si estamos en la última página de una unidad que tiene reto, mostrar el reto antes de avanzar
  if (store.get('modo', 'libre') === 'progresivo' && typeof RETO !== 'undefined' && META.length) {
    const si = SECTIONS.findIndex(([, , a, b]) => cur >= a && cur <= b);
    if (si > 0) {
      const [, , , lastPage] = SECTIONS[si];
      if (cur === lastPage && RETO.U[si] && !RETO.aprobado(si)) {
        setTimeout(() => RETO.abrir(si), 100);
        return;
      }
    }
  }
  openPage(cur + 1);
};


/* ---------------- guardado (IndexedDB) ---------------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((ok, ko) => { const r = indexedDB.open('atlas-muscular', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
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
  $('#mdTitle').textContent = unit ? `¡${sec[0]} completada!` : '¡Lámina completada!';
  $('#mdText').innerHTML = unit ? `Ganó el <b>listón de la ${sec[0]}</b>: pintó con cuidado todas sus láminas. ¡Es usted un artista del cuerpo!` : `<b>${PN[n - 1]}</b> ya tiene su estrella. Lleva ${d} de ${k} láminas en ${sec ? sec[0] : 'el libro'}.`;
  $('#mdBar').style.width = Math.round(bd / bk * 100) + '%'; $('#mdPct').textContent = `Libro: ${Math.round(bd / bk * 100)}% completado`;
  $('#medal').classList.toggle('unit', !!unit); $('#medal').hidden = false; buzz(30);
  const cf = $('#mdConf'); cf.innerHTML = '';
  for (let i = 0; i < 40; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.background = ['#E0457B', '#F2C230', '#2EC4B6', '#3A86FF', '#8AC926'][i % 5]; e.style.animationDelay = Math.random() * 0.6 + 's'; e.style.transform = `rotate(${Math.random() * 360}deg)`; cf.appendChild(e); }
}
$('#mdOk').onclick = () => { $('#medal').hidden = true; };

/* ---------------- Reto de la unidad: ubicar, origen e inserción, quién soy, juntos, clave de colores, Pilates ---------------- */
const RETO = (() => {
  const PERFIL = [['educador', 'Soy educador o formador de Pilates'], ['instructor', 'Soy instructor de Pilates'], ['formacion', 'Me estoy formando como instructor'], ['practico', 'Practico Pilates'], ['nopilates', 'No conozco el método Pilates']];
  const U = {
    1: {
      titulo: 'La Liga del Calabozo Pélvico', unidad: 'Unidad 1', lamina: 9, ultima: 16,
      retos: [
        { t: 'toca', m: 'el piriforme' }, { t: 'toca', m: 'el obturador interno' }, { t: 'toca', m: 'el gemelo superior' },
        { t: 'toca', m: 'el gemelo inferior' }, { t: 'toca', m: 'el cuadrado femoral' }, { t: 'toca', m: 'el obturador externo' },
        { t: 'oi', m: 'el piriforme', img: 6, no: 'la cara anterior del sacro', ni: 'el borde superior del trocánter mayor' },
        { t: 'oi', m: 'el obturador interno', img: 2, no: 'la cara interna del foramen obturador', ni: 'la cara medial del trocánter mayor' },
        { t: 'oi', m: 'el gemelo superior', img: 3, no: 'la espina isquiática', ni: 'el tendón del obturador interno, en el trocánter mayor' },
        { t: 'oi', m: 'el gemelo inferior', img: 4, no: 'la parte alta de la tuberosidad isquiática', ni: 'el tendón del obturador interno, en el trocánter mayor' },
        { t: 'oi', m: 'el cuadrado femoral', img: 5, no: 'el borde lateral de la tuberosidad isquiática', ni: 'la cresta intertrocantérea' },
        { t: 'oi', m: 'el obturador externo', img: 1, no: 'la cara externa del foramen obturador', ni: 'la fosa trocantérea' },
        { t: 'op', s: 'Quién soy', q: 'Salgo de la pelvis por el agujero ciático mayor y el nervio ciático suele pasar debajo de mí.', op: ['Piriforme', 'Gemelo superior', 'Cuadrado femoral'], ok: 0 },
        { t: 'op', s: 'Quién soy', q: 'Mi tendón dobla casi 90 grados en la escotadura ciática menor.', op: ['Obturador externo', 'Obturador interno', 'Piriforme'], ok: 1 },
        { t: 'op', s: 'Quién soy', q: 'Soy el ancla cuadrada del grupo y también ayudo a acercar el muslo a la línea media.', op: ['Gemelo inferior', 'Obturador interno', 'Cuadrado femoral'], ok: 2 },
        { t: 'op', s: 'Quién soy', q: 'Mi tendón cruza por detrás del cuello del fémur.', op: ['Obturador externo', 'Gemelo superior', 'Piriforme'], ok: 0 },
        { t: 'op', s: 'Lo que hacen juntos', q: '¿Qué movimiento hacen los seis?', op: ['Flexión de la cadera', 'Rotación externa de la cadera', 'Extensión de la rodilla'], ok: 1 },
        { t: 'op', s: 'Lo que hacen juntos', q: '¿Qué otra tarea comparten los seis?', op: ['Mantener la cabeza del fémur centrada en el acetábulo, como un manguito rotador de la cadera', 'Inclinar la pelvis hacia adelante', 'Doblar la rodilla'], ok: 0 },
        { t: 'clave' },
        { t: 'op', s: 'Pilates', pil: true, q: 'Los seis rotadores profundos sostienen una posición clásica del método Pilates. ¿Cuál es?', op: ['Posición paralela, con pies y rodillas al ancho de la cadera', 'Posición de Pilates en V: talones juntos y puntas hacia afuera', 'Pies en flex, con los dedos hacia el techo', 'Rotación interna, con las puntas de los pies hacia adentro'], ok: 1, nota: 'La V del Pilates nace en la cadera, no en los pies: es una rotación externa del fémur, el trabajo de los seis profundos.' },
        { t: 'op', s: 'Pilates', pil: true, q: 'En el Footwork del Reformer en posición de Pilates, ¿qué cuida usted para que la V la sostengan los rotadores profundos y no los pies?', op: ['Que la rotación salga de la cadera y las rodillas sigan la línea de los pies', 'Que los pies se abran lo más posible', 'Que las rodillas se junten', 'Que la pelvis se incline hacia adelante'], ok: 0 },
        { t: 'op', s: 'Quién soy', nopil: true, q: 'Cuando estoy contraído o acortado, puedo apretar al nervio ciático. ¿Quién soy?', op: ['Obturador interno', 'Piriforme', 'Gemelo inferior'], ok: 1 }
      ]
    }
  };
  let S = null;   // estado del reto en curso
  const R = () => store.get('reto', {});
  const box = () => $('#reto');
  const esPil = () => { const p = store.get('perfil', ''); return p && p !== 'nopilates'; };
  function aprobado(u) { return !!(R()[u] && R()[u].ok); }
  function unidadAbierta(n) {   // modo progresivo: la unidad siguiente se abre con todo completo y el reto aprobado
    if (store.get('modo', 'libre') !== 'progresivo') return true;
    const si = SECTIONS.findIndex(([, , a, b]) => n >= a && n <= b); if (si <= 1) return true;
    for (let k = 1; k < si; k++) { const [, , a, b] = SECTIONS[k]; const [d, t] = plateCount(a, b); if (d < t || !aprobado(k)) return false; }
    return true;
  }
  function html(h) { const b = box(); b.querySelector('.rtbody').innerHTML = h; b.querySelector('.rtbody').scrollTop = 0; }
  function head() {
    const tot = S.lista.length, i = S.i;
    box().querySelector('.rthead').innerHTML = `<b>Reto · ${U[S.u].unidad}</b><span>${Math.min(i + 1, tot)} / ${tot}</span><div class="rtdots">${S.lista.map((_, k) => `<i class="${k < i ? (S.res[k] ? 'ok' : 'no') : k === i ? 'cur' : ''}"></i>`).join('')}</div>`;
  }
  function abrir(u) {
    if (!U[u]) { toast('El reto de esta unidad viene pronto'); return; }
    closeHome(); box().hidden = false;
    if (!store.get('perfil', '')) { perfil(u); return; }
    empezar(u);
  }
  function perfil(u) {
    box().querySelector('.rthead').innerHTML = `<b>Reto · ${U[u].unidad}</b>`;
    html(`<h3>Antes de empezar</h3><p class="rtq">¿Qué relación tiene usted con el método Pilates?</p><div class="rtops">${PERFIL.map(([k, t]) => `<button data-k="${k}">${t}</button>`).join('')}</div><p class="rtsmall">Con esto el reto le hace preguntas de Pilates o de anatomía. Puede cambiarlo cuando quiera.</p>`);
    box().querySelectorAll('.rtops button').forEach(b => b.onclick = () => { store.set('perfil', b.dataset.k); empezar(u); });
  }
  function empezar(u) {
    const pil = esPil();
    S = { u, i: 0, res: [], lista: U[u].retos.filter(r => !(r.pil && !pil) && !(r.nopil && pil)).sort(() => Math.random() - .5) };
    html(`<div class="rtintro"><div class="rtbig">🦸</div><h3>${U[u].titulo}</h3><p>${S.lista.length} retos cortos. Se aprueba con el <b>80%</b>.</p><p class="rtsmall">Ubique cada músculo, toque su origen y su inserción en el esqueleto y demuestre lo que sabe de la liga.</p><button class="pill on rtgo">¡Empezar!</button><button class="pill rtperfil">Cambiar mi perfil</button></div>`);
    box().querySelector('.rthead').innerHTML = `<b>Reto · ${U[u].unidad}</b>`;
    box().querySelector('.rtgo').onclick = () => paso();
    box().querySelector('.rtperfil').onclick = () => perfil(u);
  }
  function paso() {
    if (S.i >= S.lista.length) return fin();
    head(); const r = S.lista[S.i];
    if (r.t === 'toca') return tocaMusculo(r);
    if (r.t === 'oi') return origenInsercion(r);
    if (r.t === 'clave') return clave();
    return opciones(r);
  }
  function resultado(ok, msg) {
    S.res[S.i] = ok; head(); SFX.blip(ok ? 'fill' : 'undo'); buzz(ok ? 18 : 40);
    const f = document.createElement('div'); f.className = 'rtfb ' + (ok ? 'ok' : 'no');
    f.innerHTML = `<b>${ok ? ['¡Muy bien!', '¡Exacto!', '¡Así es!', '¡Perfecto!'][S.i % 4] : '¡Casi!'}</b>${msg ? `<span>${msg}</span>` : ''}<button class="pill on">${S.i + 1 < S.lista.length ? 'Siguiente' : 'Ver resultado'}</button>`;
    box().querySelector('.rtbody').appendChild(f); f.scrollIntoView({ behavior: 'smooth', block: 'end' });
    f.querySelector('button').onclick = () => { S.i++; paso(); };
  }
  /* estación 1: tocar el músculo en la lámina del grupo */
  async function tocaMusculo(r) {
    const n = U[S.u].lamina, z = (MAP[n] || {}).zones || {};
    html(`<p class="rtst">Encuentre al músculo</p><p class="rtq">Toque <b>${r.m}</b></p><div class="rtimg"><canvas></canvas></div>`);
    const cv = box().querySelector('canvas'), x = cv.getContext('2d');
    const [im, li] = await Promise.all([loadImg(pageFile(n, '.jpg')), loadImg(pageFile(n, '_lab.png'))]);
    const pm = META[n - 1], yb = Math.round((pm.yb || 792) * PT), y0 = Math.round(90 * PT);
    cv.width = W; cv.height = yb - y0; x.fillStyle = '#fff'; x.fillRect(0, 0, W, cv.height); x.drawImage(im, 0, -y0, W, H);
    const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lx = lc.getContext('2d', { willReadFrequently: true }); lx.drawImage(li, 0, 0);
    let done = false;
    cv.onclick = e => {
      if (done) return; const rc = cv.getBoundingClientRect(), px = (e.clientX - rc.left) / rc.width * W, py = (e.clientY - rc.top) / rc.height * cv.height + y0;
      const d = lx.getImageData(px | 0, py | 0, 1, 1).data, L = d[0] | (d[1] << 8), nm = z[L];
      done = true;
      const ok = nm === r.m;
      // marcar la zona correcta en verde (y la tocada en rojo si falló)
      const hl = (lab, col) => { const id = lx.getImageData(0, y0, W, cv.height), D = id.data, o = x.getImageData(0, 0, W, cv.height), O = o.data;
        for (let i = 0; i < D.length; i += 4) { const l = D[i] | (D[i + 1] << 8); if (lab(l)) { O[i] = O[i] * .4 + col[0] * .6; O[i + 1] = O[i + 1] * .4 + col[1] * .6; O[i + 2] = O[i + 2] * .4 + col[2] * .6; } }
        x.putImageData(o, 0, 0); };
      if (!ok && L && L !== pm.bg) hl(l => l === L, [220, 40, 40]);
      hl(l => z[l] === r.m, [40, 170, 80]);
      resultado(ok, ok ? '' : (nm ? `Ese es ${nm}. ${cap(r.m)} está marcado en verde.` : `${cap(r.m)} está marcado en verde.`));
    };
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  /* estación 2: origen e inserción sobre el esqueleto */
  async function origenInsercion(r) {
    const base = `reto/u${S.u}_${r.img}_`;
    html(`<p class="rtst">De dónde sale y a dónde llega</p><p class="rtq"><b>${cap(r.m)}</b>: toque primero su <b class="rto">origen</b>.</p><div class="rtimg sk"><canvas></canvas></div><div class="rtpair" hidden><img alt=""><img alt=""></div><p class="rtsmall rthint">Vista posterolateral, como en su libro. Puede ampliar con dos dedos.</p>`);
    const cv = box().querySelector('canvas'), x = cv.getContext('2d');
    const [im, mk] = await Promise.all([loadImg(base + 'hueso.jpg'), loadImg(base + 'marcas.png')]);
    cv.width = im.width; cv.height = im.height; x.drawImage(im, 0, 0);
    const mc = document.createElement('canvas'); mc.width = im.width; mc.height = im.height; const mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(mk, 0, 0);
    const M = mx.getImageData(0, 0, im.width, im.height).data;
    const toPx = e => { const rc = cv.getBoundingClientRect(); return [(e.clientX - rc.left) / rc.width * im.width, (e.clientY - rc.top) / rc.height * im.height]; };
    const near = (p, ch) => { const R = 16; for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) { if (dx * dx + dy * dy > R * R) continue; const X = (p[0] + dx) | 0, Y = (p[1] + dy) | 0; if (X < 0 || Y < 0 || X >= im.width || Y >= im.height) continue; if (M[(Y * im.width + X) * 4 + ch] > 128) return true; } return false; };
    const dot = (p, col) => { x.beginPath(); x.arc(p[0], p[1], 7, 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 2; x.strokeStyle = '#fff'; x.stroke(); };
    let fase = 0, okO = false;
    cv.onclick = async e => {
      const p = toPx(e);
      if (fase === 0) { okO = near(p, 0); dot(p, okO ? '#1E9E4A' : '#D7322F'); fase = 1; box().querySelector('.rtq').innerHTML = `<b>${cap(r.m)}</b>: ahora toque su <b class="rti">inserción</b>.`; return; }
      if (fase !== 1) return;
      fase = 2; const okI = near(p, 2); dot(p, okI ? '#1E9E4A' : '#D7322F');
      const pr = box().querySelector('.rtpair'), ims = pr.querySelectorAll('img'); ims[0].src = base + 'huellas.jpg'; ims[1].src = base + 'musculo.jpg'; pr.hidden = false;
      box().querySelector('.rthint').textContent = 'Rojo: origen. Azul: inserción. A la derecha, el músculo pintado de origen a inserción.';
      resultado(okO && okI, `Sale de ${r.no} y llega ${r.ni.replace(/^el /, 'al ').replace(/^la /, 'a la ')}.`);
    };
  }
  /* estación 3, 4 y 6: opciones */
  function opciones(r) {
    const ord = r.op.map((t, k) => [t, k]).sort(() => Math.random() - .5);
    html(`<p class="rtst">${r.s}</p><p class="rtq">${r.q}</p><div class="rtops">${ord.map(([t, k]) => `<button data-k="${k}">${t}</button>`).join('')}</div>`);
    const bs = box().querySelectorAll('.rtops button');
    bs.forEach(b => b.onclick = () => {
      bs.forEach(o => { o.disabled = true; if (+o.dataset.k === r.ok) o.classList.add('ok'); });
      const ok = +b.dataset.k === r.ok; if (!ok) b.classList.add('no');
      resultado(ok, ok ? (r.nota || '') : `La respuesta es: ${r.op[r.ok]}.${r.nota ? ' ' + r.nota : ''}`);
    });
  }
  /* estación 5: su clave de colores (su color manda, nunca el del libro) */
  async function clave() {
    const n = U[S.u].lamina, z = (MAP[n] || {}).zones || {}, mus = (MAP[n] || {}).muscles || [];
    let pista = null;
    try {
      const sv = await idbGet('p' + n);
      if (sv && sv.color) {
        const ci = await blobImg(sv.color), li = await loadImg(pageFile(n, '_lab.png'));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(ci, 0, 0); const C = cx.getImageData(0, 0, W, H).data; cx.clearRect(0, 0, W, H); cx.drawImage(li, 0, 0); const Lb = cx.getImageData(0, 0, W, H).data;
        const acc = {}; for (let i = 0; i < Lb.length; i += 16) { const nm = z[Lb[i] | (Lb[i + 1] << 8)]; if (!nm || !mus.includes(nm) || C[i + 3] < 80) continue; const a = acc[nm] || (acc[nm] = [0, 0, 0, 0]); a[0] += C[i]; a[1] += C[i + 1]; a[2] += C[i + 2]; a[3]++; }
        const lst = Object.entries(acc).filter(([, a]) => a[3] > 200);
        const cols = lst.map(([nm, a]) => [nm, [a[0] / a[3], a[1] / a[3], a[2] / a[3]]]);
        // un músculo con un color que ningún otro comparta
        for (const [nm, c1] of cols.sort(() => Math.random() - .5)) if (cols.every(([o, c2]) => o === nm || Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]) > 60)) { pista = [nm, c1]; break; }
      }
    } catch (e) {}
    if (!pista) {   // aún no pintó la lámina del grupo con colores distintos
      return opciones({ s: 'Su clave de colores', q: 'En el orden de construcción, ¿qué número tiene el piriforme?', op: ['1', '4', '6'], ok: 2, nota: 'Pinte la lámina del grupo con un color para cada músculo y este reto usará su propia clave.' });
    }
    const [nm, c1] = pista, rgb = `rgb(${c1.map(v => v | 0).join(',')})`;
    const ops = [nm, ...mus.filter(m => m !== nm).sort(() => Math.random() - .5).slice(0, 2)];
    opciones({ s: 'Su clave de colores', q: `En su lámina del grupo usted pintó un músculo de este color <span class="rtsw" style="background:${rgb}"></span>. ¿Cuál es?`, op: ops.map(cap), ok: 0, nota: 'Lo que cuenta es su propia clave: su color, su número y su nombre siempre van juntos.' });
  }
  function fin() {
    const tot = S.lista.length, ok = S.res.filter(Boolean).length, pct = Math.round(ok / tot * 100), pasa = pct >= 80;
    const r = R(); const prev = r[S.u] || {}; r[S.u] = { ok: prev.ok || pasa, mejor: Math.max(prev.mejor || 0, pct), fecha: Date.now() }; store.set('reto', r);
    box().querySelector('.rthead').innerHTML = `<b>Reto · ${U[S.u].unidad}</b>`;
    if (pasa) {
      html(`<div class="rtfin ok"><div class="rtconf"></div><div class="rtstar">⭐</div><h3>¡Felicidades!</h3><p class="rtbigtxt">${ok} de ${tot}</p><p>Usted ya conoce a <b>${U[S.u].titulo}</b>: sabe dónde vive cada uno, de dónde sale y a dónde llega.</p><p class="rtsmall">¡Ya está listo para construirlos con sus manos!</p><button class="pill on rtok">¡Seguir!</button></div>`);
      const cf = box().querySelector('.rtconf'); for (let i = 0; i < 60; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.background = ['#E0457B', '#F2C230', '#2EC4B6', '#3A86FF', '#8AC926'][i % 5]; e.style.animationDelay = Math.random() * .8 + 's'; cf.appendChild(e); }
      buzz(60);
    } else {
      html(`<div class="rtfin"><div class="rtstar">💪</div><h3>¡Ya casi!</h3><p class="rtbigtxt">${ok} de ${tot}</p><p>Necesita el 80% (${Math.ceil(tot * .8)} de ${tot}). Repase la ficha y las láminas y vuelva a intentarlo: cada intento le enseña algo nuevo.</p><button class="pill on rtre">Intentar de nuevo</button><button class="pill rtok">Volver al libro</button></div>`);
      box().querySelector('.rtre').onclick = () => empezar(S.u);
    }
    box().querySelector('.rtok').onclick = cerrar;
  }
  function cerrar() { box().hidden = true; S = null; }
  return { abrir, cerrar, aprobado, unidadAbierta, U };
})();
$('#rtClose').onclick = () => RETO.cerrar();
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
  let totalArea = 0, totalPnt = 0;
  for (let L = 1; L < n; L++) {
    if (skip[L]) continue;
    totalArea += area[L]; totalPnt += pnt[L];
    const cov = pnt[L] / area[L];
    if (cov < 0.15) miss.push(L); else if (cov < 0.88) part.push(L);
    else if (spill[L] / area[L] > 0.05) sp.push(L);
  }
  // Bloqueo único: menos del 50% de la lámina pintada en total
  if (totalArea > 0 && totalPnt / totalArea < 0.50) {
    const pct = Math.round(totalPnt / totalArea * 100);
    rv.block.push(`Pinte al menos el <b>50%</b> de la lámina para compartirla. Lleva el <b>${pct}%</b>.`);
  }
  rv.zones = miss.concat(part, sp);
  const pl = (k, a, b) => k === 1 ? a : b.replace('#', k);
  const zn = (MAP[cur] || {}).zones || {}, mus = new Set((MAP[cur] || {}).muscles || []);
  // con el Mapa de músculos se nombra cada parte: primero los músculos, luego los huesos
  const named = list => { const nm = [], seen = new Set(); let rest = 0;
    for (const L of list) { const t = zn[L]; if (!t) { rest++; continue; } if (!seen.has(t)) { seen.add(t); nm.push(t); } }
    nm.sort((a, b) => (mus.has(b) ? 1 : 0) - (mus.has(a) ? 1 : 0));
    if (!nm.length) return null;
    const extra = nm.length > 4 ? nm.length - 3 : 0, lst = (extra ? nm.slice(0, 3) : nm).map(t => `<b>${t}</b>`).concat(extra ? [`${extra} partes más`] : []), txt = lst.length > 1 ? lst.slice(0, -1).join(', ') + ' y ' + lst.at(-1) : lst[0];
    return rest ? `${txt} (y ${pl(rest, '1 parte pequeña', '# partes pequeñas')})` : txt; };
  const nMiss = named(miss), nPart = named(part), nSp = named(sp);
  // sugerencias (ya no bloquean):
  if (nMiss) rv.tips.push(`Puede pintar también ${nMiss}.`);
  else if (miss.length) rv.tips.push(pl(miss.length, 'Hay <b>1 parte</b> de la lámina sin pintar.', 'Hay <b>#</b> partes de la lámina sin pintar.'));
  if (nPart) rv.tips.push(`${nPart} ${nPart.includes(' y ') ? 'quedaron a medio pintar' : 'quedó a medio pintar'}: lleve el color hasta las líneas negras.`);
  else if (part.length) rv.tips.push(pl(part.length, '<b>1 parte</b> quedó a medio pintar: lleve el color hasta las líneas negras.', '<b>#</b> partes quedaron a medio pintar: lleve el color hasta las líneas negras.'));
  if (nSp) rv.tips.push(`En ${nSp} el color se pasó a la parte vecina.`);
  else if (sp.length) rv.tips.push(pl(sp.length, 'En <b>1 parte</b> el color se pasó a la parte vecina.', 'En <b>#</b> partes el color se pasó a la parte vecina.'));
  // lo escrito: cuadro y bolitas
  const ink = xInk.getImageData(0, 0, W, H).data;
  const hasInk = (r, key) => { if (texts[key] && String(texts[key]).trim()) return true; let c = 0;
    for (let y = r[1] * PT | 0; y < r[3] * PT; y += 2) for (let x = r[0] * PT | 0; x < r[2] * PT; x += 2) if (ink[(y * W + x) * 4 + 3] > 40 && ++c > 12) return true; return false; };
  const wr = page.write || [];
  if (wr.length === 5) {
    const nm = ['el músculo', 'el origen', 'la inserción', 'la acción'], falta = nm.filter((_, i) => !hasInk(wr[i], 'w' + i));
    if (falta.length) rv.tips.push(`En el cuadro todavía falta escribir ${falta.length > 1 ? falta.slice(0, -1).join(', ') + ' y ' + falta[falta.length - 1] : falta[0]}.`);
  } else if (wr.length) {
    const k = wr.filter((r, i) => !hasInk(r, 'w' + i)).length;
    if (k) rv.tips.push(pl(k, 'Queda <b>1 línea</b> de respuesta sin escribir.', 'Quedan <b>#</b> líneas de respuesta sin escribir.'));
  }
  const ck = (page.circles || []).filter((r, i) => !hasInk(r, 'c' + i)).length;
  if (ck) rv.tips.push(pl(ck, 'Falta escribir el número en <b>1 bolita</b>.', 'Falta escribir el número en <b>#</b> bolitas.'));
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
  $('#rvTitle').textContent = ok ? '¡Su obra va muy bien!' : 'Revisemos su obra';
  $('#rvIntro').innerHTML = ok ? 'Antes de compartirla, un último vistazo de artista:' : 'Para compartirla, su lámina tiene que quedar pintada con cuidado, como una obra. Esto es lo que falta:';
  $('#rvList').innerHTML = rv.block.map(t => `<li class="b">${t}</li>`).join('') + rv.tips.map(t => `<li class="t">${t}</li>`).join('');
  $('#rvNote').innerHTML = 'Compare el origen, la inserción y la acción con la ficha de la unidad: así se asegura de que estén bien.';
  $('#rvShow').hidden = !rv.zones.length; $('#rvGo').hidden = !ok;
  $('#rvShow').onclick = () => { $('#reviewBox').hidden = true; flashZones(rv.zones); };
  $('#reviewBox').hidden = false;
}
$('#rvBack').onclick = () => { $('#reviewBox').hidden = true; };
$('#rvGo').onclick = () => { $('#reviewBox').hidden = true; SH.passed = true; $('#btnShare').onclick(); };
$('#reviewBox').addEventListener('pointerdown', e => { if (e.target.id === 'reviewBox') $('#reviewBox').hidden = true; });

/* ---------------- compartir: su obra firmada, en el estilo que elija ---------------- */
const SHARE_STYLES = [
  ['natural', 'Natural', 'Sin ningún efecto'],
  ['atril', 'Atril', 'Madera y lino'],
  ['oleo', 'Óleo', 'Lienzo y marco dorado'],
  ['acuarela', 'Acuarela', 'Papel de algodón'],
  ['marcador', 'Marcadores', 'Trazo vivo'],
  ['tiza', 'Tiza', 'En la pizarra'],
  ['grafito', 'Grafito', 'Lápiz sobre papel'],
  ['comic', 'Cómic', 'Revista de historietas'],
  ['digital', 'Digital', 'Colores de pantalla'],
  ['foto', 'Fotografía', 'Color vivo y contraste'],
  ['vintage', 'Vintage', 'Foto antigua, cálida'],
  ['byn', 'Blanco y negro', 'Foto clásica']
];
const SH = { cache: {}, logo: null, style: (s => SHARE_STYLES.some(t => t[0] === s) ? s : 'natural')(store.get('shareStyle', 'natural')), busy: false };
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
  for (let yy = -H, r = 0; yy <= H; yy += 200, r++) for (let xx = -W * 1.2; xx <= W * 1.2; xx += 820) x.fillText('ATLAS MUSCULAR · BALANCED BODY', xx + (r % 2 ? 410 : 0), yy);
  x.restore();
  x.drawImage(cInk, 0, 0);
  x.save(); x.globalAlpha = 0.55; x.fillStyle = '#3F4A57'; x.font = '500 20px Montserrat, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'bottom';
  x.fillText('Atlas Muscular · Digital Coloring Book · © Balanced Body', W / 2, H - 14); x.restore();
  for (const [key, v] of Object.entries(texts)) {
    const r = zoneRect(key); if (!r) continue; const hpt = (r[3] - r[1]) * PT;
    x.fillStyle = '#1F3B73'; x.font = `500 ${key[0] === 'c' ? hpt * .75 : Math.min(hpt * .62, 40)}px Caveat, cursive`;
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
  if (['atril', 'limpio', 'digital', 'natural', 'foto', 'vintage', 'byn'].includes(st)) {
    const vg = (j) => { const xx = (j % w) / w - .5, yy = ((j / w) | 0) / h - .5; return xx * xx + yy * yy; };
    const f = st === 'digital' ? 1.3 : 1;
    for (let j = 0, i = 0; j < n; j++, i += 4) {
      const a = A[j]; let [cr, cg, cb] = f !== 1 ? sat(C[i], C[i + 1], C[i + 2], f) : [C[i], C[i + 1], C[i + 2]];
      let r = 255 * (1 - a + a * cr / 255), g = 255 * (1 - a + a * cg / 255), b = 255 * (1 - a + a * cb / 255);
      if (st === 'digital') { r = (r - 128) * 1.08 + 132; g = (g - 128) * 1.08 + 132; b = (b - 128) * 1.08 + 132; }
      r = r * L[i] / 255; g = g * L[i + 1] / 255; b = b * L[i + 2] / 255;
      if (st === 'foto') {            // foto: más color, más contraste y una viñeta suave
        [r, g, b] = sat(r, g, b, 1.18); const v = 1 - vg(j) * .55; r = ((r - 128) * 1.12 + 128) * v; g = ((g - 128) * 1.12 + 128) * v; b = ((b - 128) * 1.12 + 128) * v;
      } else if (st === 'vintage') {  // vintage: sepia cálida, negros lavados, grano y viñeta
        const y = .3 * r + .59 * g + .11 * b; let vr = r * .68 + y * .32 + 16, vgc = g * .68 + y * .32 + 5, vb = b * .68 + y * .32 - 12;
        vr = 30 + vr * .82; vgc = 26 + vgc * .8; vb = 22 + vb * .74; const gr = (R() - .5) * 22, v = 1 - vg(j) * .9;
        r = (vr + gr) * v; g = (vgc + gr) * v; b = (vb + gr) * v;
      } else if (st === 'byn') {      // blanco y negro con contraste y un grano fino
        let y = .3 * r + .59 * g + .11 * b; y = (y - 128) * 1.25 + 128 + (R() - .5) * 12; const v = 1 - vg(j) * .4; r = g = b = y * v;
      }
      put(i, r, g, b);
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
  const L1 = 'ATLAS MUSCULAR', L2 = 'DIGITAL COLORING BOOK', L3 = 'Edición Digital 2026';
  let f1 = 26 * s, f2 = 11 * s; const lh = 40 * s, logo = SH.logo, lw = logo ? lh * logo.width / logo.height : 0, gap = 26 * s;
  const meas = () => { x.font = `700 ${f1}px Montserrat, sans-serif`; const a = Math.max(x.measureText(L1).width, x.measureText(L2).width); x.font = `400 ${f2}px Montserrat, sans-serif`; return Math.max(a, x.measureText(L3).width); };
  let tw = meas(); while (lw + gap + tw > maxW && f1 > 6) { f1 *= 0.94; f2 *= 0.94; tw = meas(); }
  /* logo hacia la izquierda, texto hacia la derecha, ambos con margen interior */
  const x0 = cx - maxW / 2 + gap / 2, xr = cx + maxW / 2 - gap / 2;
  const draw = (dx, dy, c, a) => {
    x.save(); x.globalAlpha = a; x.translate(dx, dy);
    if (logo) x.drawImage(tinted(logo, c), x0, cy - lh / 2, lw, lh);
    x.fillStyle = c; x.textAlign = 'right'; x.textBaseline = 'alphabetic';
    x.font = `700 ${f1}px Montserrat, sans-serif`;
    x.fillText(L1, xr, cy - f1 * 0.65);
    x.fillText(L2, xr, cy + f1 * 0.55);
    x.font = `400 ${f2}px Montserrat, sans-serif`;
    x.globalAlpha = a * 0.60; x.fillText(L3, xr, cy + f1 * 0.55 + f2 * 1.9); x.restore();
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
  x.lineWidth = 8 * s; x.strokeStyle = '#111'; x.strokeText('¡ATLAS MUSCULAR!', 26 * s, (head - 30 * s) / 2, w * 0.72 - 50 * s); x.fillText('¡ATLAS MUSCULAR!', 26 * s, (head - 30 * s) / 2, w * 0.72 - 50 * s); x.restore();
  x.save(); x.translate(mg + w - 150 * s, mg + 40 * s); x.rotate(0.12); x.fillStyle = '#fff'; x.strokeStyle = '#111'; x.lineWidth = 6 * s;
  x.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, r = (k % 2 ? 70 : 108) * s; x.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * .8); } x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#111'; x.font = `italic 900 ${40 * s}px Montserrat, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`N.º ${cur}`, 0, 0); x.restore();
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
function scenePhoto(art, s) {
  const w = art.width, h = art.height, b = 34 * s, bb = 120 * s, M = 90 * s, CW = w + 2 * b + 2 * M, CH = h + b + bb + 2 * M, c = mkC(CW, CH), x = c.getContext('2d');
  x.fillStyle = '#E9E6E1'; x.fillRect(0, 0, CW, CH);
  x.save(); x.translate(CW / 2, CH / 2); x.rotate(-0.012); x.translate(-CW / 2, -CH / 2);
  x.shadowColor = 'rgba(0,0,0,.28)'; x.shadowBlur = 30 * s; x.shadowOffsetY = 10 * s; x.fillStyle = '#FBFAF7'; x.fillRect(M, M, w + 2 * b, h + b + bb); x.shadowColor = 'transparent';
  x.drawImage(art, M + b, M + b); caption(x, M + b + w / 2, M + b + h + bb * .55, w, s, '#3F4A57'); x.restore();
  return c;
}
/* lo que se comparte: solo la obra con un borde fino (la escena es para elegir el estilo) */
function shareBorder(art) {
  const w = art.width, h = art.height, b = Math.round(Math.max(w, h) * .025), k = w / 1224, foot = Math.round(150 * k), c = mkC(w + 2 * b, h + 2 * b + foot), x = c.getContext('2d');
  x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, c.height); x.drawImage(art, b, b);
  x.strokeStyle = 'rgba(63,74,87,.25)'; x.lineWidth = 1.5; x.strokeRect(b - .75, b - .75, w + 1.5, h + 1.5);
  // marca de agua: fecha y hora compartida (esquina superior derecha, dentro del arte)
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const hh = now.getHours(), mm = now.getMinutes(), ampm = hh >= 12 ? 'p.m.' : 'a.m.';
  const ts = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} · ${pad(hh > 12 ? hh - 12 : hh || 12)}:${pad(mm)} ${ampm}`;
  const tf = Math.round(14 * k); x.save(); x.font = `400 ${tf}px Montserrat, sans-serif`; x.fillStyle = 'rgba(63,74,87,.28)'; x.textAlign = 'right'; x.textBaseline = 'top'; x.fillText(ts, b + w - 14 * k, b + 12 * k); x.restore();
  caption(x, c.width / 2, b + h + foot * .52, w * .9, k * 1.1, '#3F4A57');
  return c;
}
async function shareRender(st, s, final) {
  if (!SH.logo) SH.logo = await loadImg('bb_logo.png').catch(() => null);
  const Ly = await shareLayers(s), art = styleArt(st, Ly);
  if (final) return shareBorder(art);
  return ({ atril: a => sceneEasel(a, s, false), oleo: a => sceneEasel(a, s, true), acuarela: a => sceneWall(a, s), marcador: a => sceneDesk(a, s), tiza: a => sceneBoard(a, s), grafito: a => sceneClip(a, s), comic: a => sceneComic(a, s), digital: a => sceneDigital(a, s), limpio: a => sceneClean(a, s), natural: a => sceneClean(a, s), foto: a => scenePhoto(a, s), vintage: a => scenePhoto(a, s), byn: a => scenePhoto(a, s) })[st](art);
}
$('#btnShare').onclick = async () => {
  if (!page) return;
  if (!page.plate) { toast('Solo se comparten las láminas que usted colorea'); return; }
  if (!SH.passed) { const rv = reviewArt(); if (rv.block.length || rv.tips.length) { showReview(rv); return; } toast('¡Quedó preciosa! Elija cómo compartirla'); checkDone(true); }
  SH.passed = false;
  await saveNow(); SH.cache = {}; SH.ready = null; $('#sgYes').textContent = 'Compartir mi obra';
  try { await Promise.all([document.fonts.load('500 40px Caveat'), document.fonts.load('700 40px Caveat'), document.fonts.load('700 30px Montserrat'), document.fonts.load('italic 900 40px Montserrat')]); } catch (e) {}
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
$('#sgNo').onclick = () => { $('#shareBox').hidden = true; SH.ready = null; $('#sgYes').textContent = 'Compartir mi obra'; };
$('#shareBox').addEventListener('pointerdown', e => { if (e.target.id === 'shareBox') $('#shareBox').hidden = true; });
async function shareFile(file, blob) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Atlas Muscular · Digital Coloring Book' }); return true; }
  } catch (e) {
    if (e && e.name === 'AbortError') return true;
    if (e && e.name === 'NotAllowedError') return false;   // el teléfono pide otro toque
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  toast('Lámina guardada en Descargas'); return true;
}
$('#sgYes').onclick = async () => {
  if (SH.ready) { const { file, blob } = SH.ready; SH.ready = null; $('#sgYes').textContent = 'Compartir mi obra'; $('#shareBox').hidden = true; await shareFile(file, blob); return; }
  if (SH.busy) return; SH.busy = true; $('#sgYes').classList.add('wait');
  try {
    const c = await shareRender(SH.style, 1, true);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
    const file = new File([blob], `atlas-muscular-pagina-${cur}.jpg`, { type: 'image/jpeg' });
    $('#shareBox').hidden = true;
    if (!(await shareFile(file, blob))) { SH.ready = { file, blob }; $('#shareBox').hidden = false; $('#sgYes').textContent = 'Su obra está lista: toque para compartir'; }
  } finally { SH.busy = false; $('#sgYes').classList.remove('wait'); }
};


/* ---------------- música para colorear (generada en la app, sin internet) ---------------- */
const MUSIC = (() => {
  let ac = null, master = null, verb = null, cur = null, timers = [], nodes = [];
  const TR = [
    ['piano', 'Piano suave', 'Piano con cuerdas de fondo', '🎹'],
    ['ambiente', 'Ambiente', 'Flauta, campanitas, pajaritos y sapitos', '🌙'],
    ['lluvia', 'Lluvia', 'Gotas serenas y sapitos lejanos', '🌧'],
    ['mar', 'Mar', 'Olas lentas y lejanas', '🌊'],
    ['cuencos', 'Cuencos de cristal', 'Vibración que relaja', '🔔'],
    ['indie', 'Indie relax', 'Guitarra, handpan, tambor y campanitas', '🌿'],
    ['mantra', 'Mantra Om', 'Om, tanpura y sitar suave', '🧘'],
    ['cuerdas', 'Arpa y violines', 'Cuerdas suaves que relajan', '🎻'],
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
const STORIES = { 7: { src: 'audio/cuento_u1.mp3', t: 'Escuchar el cuento' } };
const story = new Audio(); story.preload = 'none';
function storyUI() {
  const st = STORIES[cur]; const b = $('#storyBtn');
  b.hidden = !st; if (!st) { if (!story.paused) story.pause(); return; }
  const playing = !story.paused && story.dataset.p == cur;
  b.classList.toggle('on', playing);
  $('#storyLabel').textContent = playing ? 'Pausar' : (story.dataset.p == cur && story.currentTime > 1 ? 'Seguir' : 'Escuchar');
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
  if (story.paused) { if (MUSIC.cur) MUSIC.stop(); story.play().catch(() => toast('No se pudo reproducir el audio')); } else story.pause();
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
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => { reg.update(); }).catch(() => {});
    let swUpdated = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (swUpdated) return; swUpdated = true;
      const bar = document.createElement('div');
      bar.textContent = '✦ Nueva versión lista — toque para actualizar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#1A6FFF;color:#fff;text-align:center;padding:14px 16px;font:600 15px/1.4 system-ui,sans-serif;cursor:pointer;letter-spacing:.02em';
      bar.onclick = () => location.reload();
      document.body.appendChild(bar);
    });
  }
  setupInstall();
}
new ResizeObserver(() => { const ph = stage.style.height; $('#texts').style.setProperty('--ph', ph); }).observe(stage);
start();
})();
