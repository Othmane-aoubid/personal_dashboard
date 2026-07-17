/**
 * Game sound effects — generated entirely with the Web Audio API.
 * No audio files needed. Works in every modern browser.
 */

let _ctx = null;
let _muted = false;

export const isMuted = () => _muted;
export const setMuted = (v) => { _muted = v; };
export const toggleMute = () => { _muted = !_muted; return _muted; };

function ctx() {
  if (typeof window === 'undefined') return null;
  try {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  } catch { return null; }
}

/** Single oscillator tone with exponential fade-out */
function tone(freq, dur, type = 'sine', vol = 0.25, t0 = null) {
  const c = ctx(); if (!c || _muted) return;
  const now = t0 ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.start(now); o.stop(now + dur + 0.02);
}

/** Frequency sweep (glide from f0 to f1) */
function sweep(f0, f1, dur, type = 'sine', vol = 0.25, t0 = null) {
  const c = ctx(); if (!c || _muted) return;
  const now = t0 ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.connect(g); g.connect(c.destination);
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.start(now); o.stop(now + dur + 0.02);
}

/** Short white-noise burst */
function noise(dur, vol = 0.2, t0 = null) {
  const c = ctx(); if (!c || _muted) return;
  const now = t0 ?? c.currentTime;
  const sampleRate = c.sampleRate;
  const buf = c.createBuffer(1, Math.ceil(sampleRate * dur), sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const g = c.createGain();
  src.buffer = buf;
  src.connect(g); g.connect(c.destination);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.start(now); src.stop(now + dur + 0.02);
}

// ═══════════════════════════════════════════════════════════════════
//  CHESS
// ═══════════════════════════════════════════════════════════════════

/** Soft wooden thud when a piece is placed */
export function sfxChessMove() {
  tone(210, 0.08, 'triangle', 0.22);
  noise(0.04, 0.06);
}

/** Harder impact on capture */
export function sfxChessCapture() {
  noise(0.12, 0.22);
  tone(130, 0.15, 'sawtooth', 0.18);
}

/** Alert ding when a king enters check */
export function sfxChessCheck() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(880, 0.14, 'sine', 0.3, now);
  tone(1108, 0.10, 'sine', 0.22, now + 0.13);
}

/** Dramatic descending fanfare — checkmate */
export function sfxChessCheckmate() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  [880, 698, 587, 440].forEach((f, i) => tone(f, 0.30, 'sine', 0.38, now + i * 0.22));
}

/** Neutral double-beep for stalemate / draw */
export function sfxChessStalemate() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(440, 0.28, 'sine', 0.28, now);
  tone(440, 0.28, 'sine', 0.28, now + 0.34);
}

/** Two quick clicks when castling (two pieces moving) */
export function sfxCastle() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(280, 0.07, 'triangle', 0.22, now);
  tone(380, 0.07, 'triangle', 0.18, now + 0.09);
}

// ═══════════════════════════════════════════════════════════════════
//  2048
// ═══════════════════════════════════════════════════════════════════

/** Quick whoosh when tiles slide */
export function sfxSlide() {
  sweep(380, 200, 0.09, 'sine', 0.14);
}

/** Satisfying pop/bubble on merge — pitch scales with tile value */
export function sfxMerge(tileValue = 4) {
  const c = ctx(); if (!c || _muted) return;
  // log2(4)=2, log2(2048)=11 → map to 500–1600 Hz
  const f = Math.min(500 + (Math.log2(tileValue || 2) - 2) * 100, 1600);
  sweep(f, f * 1.7, 0.13, 'sine', 0.24);
}

/** Ascending fanfare on reaching 2048 */
export function sfx2048Win() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.26, 'sine', 0.32, now + i * 0.13));
}

/** Descending tones — game over */
export function sfx2048Over() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  [440, 330, 220].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.28, now + i * 0.20));
}

// ═══════════════════════════════════════════════════════════════════
//  SNAKE
// ═══════════════════════════════════════════════════════════════════

/** Classic retro bloop — eating food */
export function sfxSnakeEat() {
  sweep(440, 880, 0.09, 'square', 0.18);
}

/** Descending crash — hitting a wall or self */
export function sfxSnakeDie() {
  sweep(440, 55, 0.55, 'sawtooth', 0.28);
  noise(0.18, 0.12);
}

// ═══════════════════════════════════════════════════════════════════
//  MINESWEEPER
// ═══════════════════════════════════════════════════════════════════

/** Light click — revealing a cell */
export function sfxReveal() {
  tone(900, 0.03, 'triangle', 0.10);
}

/** Plant flag — rising two-note pluck */
export function sfxFlag() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(600, 0.07, 'triangle', 0.20, now);
  tone(820, 0.06, 'triangle', 0.15, now + 0.05);
}

/** Remove flag — falling two-note pluck */
export function sfxUnflag() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(820, 0.06, 'triangle', 0.15, now);
  tone(600, 0.07, 'triangle', 0.20, now + 0.05);
}

/** Boom — mine exploded */
export function sfxExplosion() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  noise(0.60, 0.50, now);
  sweep(90, 28, 0.55, 'sawtooth', 0.40, now);
}

/** Victory fanfare — all mines cleared */
export function sfxMineWin() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.30, now + i * 0.11));
}

// ═══════════════════════════════════════════════════════════════════
//  FLAPPY BIRD
// ═══════════════════════════════════════════════════════════════════

/** Wing beat — upward swoosh */
export function sfxFlap() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  sweep(180, 360, 0.07, 'sine', 0.14, now);
  sweep(360, 220, 0.07, 'sine', 0.10, now + 0.06);
}

/** Passing a pipe — double beep */
export function sfxFlappyPoint() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(1000, 0.07, 'sine', 0.22, now);
  tone(1320, 0.07, 'sine', 0.18, now + 0.07);
}

/** Crash — hitting a pipe or the ground */
export function sfxFlappyHit() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  noise(0.30, 0.35, now);
  tone(100, 0.30, 'sawtooth', 0.30, now);
}

// ═══════════════════════════════════════════════════════════════════
//  SOCCER
// ═══════════════════════════════════════════════════════════════════

/** Ball kicked — short thump + high snap */
export function sfxKick() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  noise(0.06, 0.25, now);
  tone(180, 0.08, 'triangle', 0.28, now);
  sweep(800, 400, 0.07, 'sine', 0.14, now + 0.02);
}

/** Goal scored — crowd roar */
export function sfxGoal() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  // Rising crowd noise
  noise(1.5, 0.35, now);
  // Fanfare
  [523, 659, 784, 880, 1047].forEach((f, i) => tone(f, 0.4, 'sine', 0.3, now + i * 0.1));
}

/** Referee whistle */
export function sfxWhistle() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  sweep(2400, 2800, 0.12, 'sine', 0.3, now);
  sweep(2800, 2400, 0.10, 'sine', 0.25, now + 0.14);
  sweep(2400, 2700, 0.08, 'sine', 0.22, now + 0.26);
}

/** Tackle / collision between players */
export function sfxTackle() {
  noise(0.10, 0.20);
  tone(120, 0.10, 'sawtooth', 0.18);
}

/** Ball saved by goalkeeper */
export function sfxSave() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  noise(0.08, 0.18, now);
  sweep(600, 300, 0.12, 'triangle', 0.2, now);
}

/** Ball hits post */
export function sfxPost() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(420, 0.35, 'triangle', 0.35, now);
  tone(220, 0.25, 'triangle', 0.2, now + 0.05);
}

/** Card shown */
export function sfxCard() {
  const c = ctx(); if (!c || _muted) return;
  const now = c.currentTime;
  tone(440, 0.12, 'sawtooth', 0.28, now);
  tone(330, 0.18, 'sawtooth', 0.22, now + 0.14);
}
