// All sound is synthesized with WebAudio: one shared noise buffer, oscillators and
// filtered noise bursts. No audio assets, no network. Volumes are kept low and the
// context is created lazily on the first user gesture (pointer lock / click).
let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

function noise(dur, filterType, freq, gain, when = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
  if (!ensure()) return;
  const t = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// distance 0..1 (1 = far): quieter and duller.
export const sfx = {
  shot(kind, distance = 0) {
    const vol = 0.5 * (1 - distance * 0.75);
    if (kind === 'sniper') { noise(0.22, 'lowpass', 900, vol); tone(140, 0.14, 'sawtooth', vol * 0.5, 60); }
    else if (kind === 'smg') { noise(0.09, 'bandpass', 2400, vol * 0.8); tone(220, 0.05, 'square', vol * 0.25, 120); }
    else if (kind === 'pistol') { noise(0.12, 'bandpass', 1800, vol * 0.9); tone(180, 0.07, 'square', vol * 0.3, 90); }
    else { noise(0.13, 'lowpass', 1400, vol); tone(170, 0.08, 'sawtooth', vol * 0.4, 70); }
  },
  dryFire() { tone(1200, 0.03, 'square', 0.12); },
  reload() {
    tone(900, 0.04, 'square', 0.12);
    tone(650, 0.04, 'square', 0.12, 0, 0.22);
    tone(1100, 0.05, 'square', 0.16, 0, 0.55);
  },
  hit() { tone(2100, 0.05, 'sine', 0.25); },
  kill() { tone(2100, 0.05, 'sine', 0.25); tone(2800, 0.08, 'sine', 0.25, 0, 0.07); },
  hurt() { noise(0.18, 'lowpass', 500, 0.4); tone(110, 0.16, 'sawtooth', 0.25, 55); },
  plantBeep(final = false) { tone(final ? 1500 : 950, final ? 0.3 : 0.09, 'sine', 0.3); },
  defuseBeep() { tone(1250, 0.09, 'sine', 0.3); },
  explosion() {
    noise(1.1, 'lowpass', 320, 0.9);
    tone(70, 0.9, 'sine', 0.7, 28);
    noise(0.3, 'highpass', 3000, 0.25);
  },
  grenadePin() { tone(1400, 0.03, 'square', 0.12); tone(900, 0.03, 'square', 0.1, 0, 0.06); },
  bounce() { tone(300, 0.05, 'sine', 0.15, 180); },
  roundWin() { [523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.28, 0, i * 0.11)); },
  roundLose() { [392, 330, 262].forEach((f, i) => tone(f, 0.26, 'triangle', 0.26, 0, i * 0.12)); },
  click() { tone(1600, 0.03, 'square', 0.1); },
  buy() { tone(880, 0.06, 'sine', 0.22); tone(1320, 0.09, 'sine', 0.22, 0, 0.07); },
  denied() { tone(220, 0.12, 'square', 0.18, 160); },
  spikePickup() { tone(700, 0.08, 'sine', 0.2); tone(1050, 0.1, 'sine', 0.2, 0, 0.08); },
};
