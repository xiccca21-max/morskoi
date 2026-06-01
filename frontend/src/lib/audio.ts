let ctx: AudioContext | null = null;

async function getCtx(): Promise<AudioContext> {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}

/** Разблокировать AudioContext при первом касании (вызвать из App.tsx один раз). */
export function unlockAudio() {
  getCtx().catch(() => {});
}

function makeNoise(c: AudioContext, duration: number): AudioBuffer {
  const len = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  // Pink-noise approximation: more bass body than pure white
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

function makeWhiteNoise(c: AudioContext, duration: number): AudioBuffer {
  const len = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function compressor(c: AudioContext): DynamicsCompressorNode {
  const comp = c.createDynamicsCompressor();
  comp.threshold.setValueAtTime(-18, c.currentTime);
  comp.knee.setValueAtTime(6, c.currentTime);
  comp.ratio.setValueAtTime(10, c.currentTime);
  comp.attack.setValueAtTime(0.001, c.currentTime);
  comp.release.setValueAtTime(0.15, c.currentTime);
  comp.connect(c.destination);
  return comp;
}

/* ─── ВЗРЫВ (попадание) ────────────────────────────────────────────────── */
function playBoom(c: AudioContext) {
  const t = c.currentTime;
  const out = compressor(c);

  // 1. Резкий щелчок-крэк (начальный удар снаряда, 0–80мс)
  const crackBuf = makeWhiteNoise(c, 0.09);
  const crack = c.createBufferSource();
  crack.buffer = crackBuf;
  const crackBP = c.createBiquadFilter();
  crackBP.type = 'bandpass';
  crackBP.frequency.setValueAtTime(3500, t);
  crackBP.Q.setValueAtTime(0.4, t);
  const crackG = c.createGain();
  crackG.gain.setValueAtTime(3.5, t);
  crackG.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
  crack.connect(crackBP);
  crackBP.connect(crackG);
  crackG.connect(out);
  crack.start(t);

  // 2. Тело взрыва — розовый шум, НЧ (суть "бум", 0–700мс)
  const bodyBuf = makeNoise(c, 0.8);
  const body = c.createBufferSource();
  body.buffer = bodyBuf;
  const bodyLP = c.createBiquadFilter();
  bodyLP.type = 'lowpass';
  bodyLP.frequency.setValueAtTime(1200, t);
  bodyLP.frequency.exponentialRampToValueAtTime(60, t + 0.55);
  const bodyG = c.createGain();
  bodyG.gain.setValueAtTime(4.5, t);
  bodyG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  body.connect(bodyLP);
  bodyLP.connect(bodyG);
  bodyG.connect(out);
  body.start(t);

  // 3. Суббасовый удар-пульс (давление взрывной волны, синус 50→30 Гц)
  const sub = c.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(65, t);
  sub.frequency.exponentialRampToValueAtTime(28, t + 0.28);
  const subG = c.createGain();
  subG.gain.setValueAtTime(4.0, t);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
  sub.connect(subG);
  subG.connect(out);
  sub.start(t);
  sub.stop(t + 0.30);

  // 4. Средне-высокочастотный треск (осколки, горение, 40–500мс)
  const crklBuf = makeWhiteNoise(c, 0.5);
  const crkl = c.createBufferSource();
  crkl.buffer = crklBuf;
  const crklBP = c.createBiquadFilter();
  crklBP.type = 'bandpass';
  crklBP.frequency.setValueAtTime(1800, t + 0.04);
  crklBP.Q.setValueAtTime(0.8, t + 0.04);
  const crklG = c.createGain();
  crklG.gain.setValueAtTime(0, t);
  crklG.gain.linearRampToValueAtTime(0.9, t + 0.06);
  crklG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  crkl.connect(crklBP);
  crklBP.connect(crklG);
  crklG.connect(out);
  crkl.start(t + 0.04);

  // 5. Низкочастотное эхо-грохотание (затихающий рёв, 100–900мс)
  const rumbBuf = makeNoise(c, 0.9);
  const rumb = c.createBufferSource();
  rumb.buffer = rumbBuf;
  const rumbLP = c.createBiquadFilter();
  rumbLP.type = 'lowpass';
  rumbLP.frequency.setValueAtTime(250, t + 0.1);
  rumbLP.frequency.exponentialRampToValueAtTime(40, t + 0.85);
  const rumbG = c.createGain();
  rumbG.gain.setValueAtTime(0, t);
  rumbG.gain.linearRampToValueAtTime(0.7, t + 0.15);
  rumbG.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  rumb.connect(rumbLP);
  rumbLP.connect(rumbG);
  rumbG.connect(out);
  rumb.start(t + 0.1);
}

/* ─── ВСПЛЕСК (промах) ──────────────────────────────────────────────────── */
function playSplash(c: AudioContext) {
  const t = c.currentTime;

  // 1. Тупой удар снаряда о воду (низкий синус, быстрое затухание)
  const thud = c.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(180, t);
  thud.frequency.exponentialRampToValueAtTime(55, t + 0.14);
  const thudG = c.createGain();
  thudG.gain.setValueAtTime(1.8, t);
  thudG.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  thud.connect(thudG);
  thudG.connect(c.destination);
  thud.start(t);
  thud.stop(t + 0.16);

  // 2. Главный всплеск — широкополосный шум с пиком и спадом
  const spBuf = makeWhiteNoise(c, 0.55);
  const sp = c.createBufferSource();
  sp.buffer = spBuf;
  const spHP = c.createBiquadFilter();
  spHP.type = 'highpass';
  spHP.frequency.setValueAtTime(800, t + 0.01);
  spHP.frequency.exponentialRampToValueAtTime(2500, t + 0.1);
  const spLP = c.createBiquadFilter();
  spLP.type = 'lowpass';
  spLP.frequency.setValueAtTime(9000, t + 0.01);
  const spG = c.createGain();
  spG.gain.setValueAtTime(0, t);
  spG.gain.linearRampToValueAtTime(1.6, t + 0.04);
  spG.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  sp.connect(spHP);
  spHP.connect(spLP);
  spLP.connect(spG);
  spG.connect(c.destination);
  sp.start(t + 0.01);

  // 3. Водные пузырьки — узкополосный шум, медленное затухание
  const bubBuf = makeNoise(c, 0.7);
  const bub = c.createBufferSource();
  bub.buffer = bubBuf;
  const bubBP = c.createBiquadFilter();
  bubBP.type = 'bandpass';
  bubBP.frequency.setValueAtTime(600, t + 0.08);
  bubBP.Q.setValueAtTime(4, t + 0.08);
  bubBP.frequency.exponentialRampToValueAtTime(180, t + 0.65);
  const bubG = c.createGain();
  bubG.gain.setValueAtTime(0, t);
  bubG.gain.linearRampToValueAtTime(0.45, t + 0.12);
  bubG.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  bub.connect(bubBP);
  bubBP.connect(bubG);
  bubG.connect(c.destination);
  bub.start(t + 0.08);

  // 4. Капли воды — несколько случайных микровсплесков после основного
  for (let i = 0; i < 4; i++) {
    const dt = 0.18 + Math.random() * 0.35;
    const dropOsc = c.createOscillator();
    dropOsc.type = 'sine';
    dropOsc.frequency.setValueAtTime(900 + Math.random() * 600, t + dt);
    dropOsc.frequency.exponentialRampToValueAtTime(200, t + dt + 0.06);
    const dropG = c.createGain();
    dropG.gain.setValueAtTime(0.12 + Math.random() * 0.1, t + dt);
    dropG.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.07);
    dropOsc.connect(dropG);
    dropG.connect(c.destination);
    dropOsc.start(t + dt);
    dropOsc.stop(t + dt + 0.07);
  }
}

/* ─── КЛИК ──────────────────────────────────────────────────────────────── */
function playClick(c: AudioContext) {
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(700, t);
  osc.frequency.exponentialRampToValueAtTime(320, t + 0.04);
  gain.gain.setValueAtTime(0.12, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

/* ─── УКЛАДКА КОРАБЛЯ ───────────────────────────────────────────────────── */
function playPlace(c: AudioContext) {
  const t = c.currentTime;
  // Тяжёлый деревянный стук
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(80, t + 0.07);
  const g = c.createGain();
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  // Добавляем короткий "knock" шум
  const nBuf = makeWhiteNoise(c, 0.05);
  const n = c.createBufferSource();
  n.buffer = nBuf;
  const nLP = c.createBiquadFilter();
  nLP.type = 'lowpass';
  nLP.frequency.setValueAtTime(1200, t);
  const nG = c.createGain();
  nG.gain.setValueAtTime(0.18, t);
  nG.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(g);
  g.connect(c.destination);
  n.connect(nLP);
  nLP.connect(nG);
  nG.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.09);
  n.start(t);
}

/* ─── СМЕНА ХОДА ────────────────────────────────────────────────────────── */
function playTurn(c: AudioContext) {
  const t = c.currentTime;
  // Два удара корабельного колокола
  [[0, 520], [0.22, 660]] .forEach(([dt, freq]) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq as number, t + dt);
    const harm = c.createOscillator();
    harm.type = 'sine';
    harm.frequency.setValueAtTime((freq as number) * 2.76, t + dt); // металлический обертон
    const g = c.createGain();
    g.gain.setValueAtTime(0.001, t + dt);
    g.gain.linearRampToValueAtTime(0.18, t + dt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.55);
    const gH = c.createGain();
    gH.gain.setValueAtTime(0.001, t + dt);
    gH.gain.linearRampToValueAtTime(0.05, t + dt + 0.01);
    gH.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.3);
    osc.connect(g);
    harm.connect(gH);
    g.connect(c.destination);
    gH.connect(c.destination);
    osc.start(t + dt);
    osc.stop(t + dt + 0.6);
    harm.start(t + dt);
    harm.stop(t + dt + 0.35);
  });
}

/* ─── ПОБЕДА ────────────────────────────────────────────────────────────── */
function playWin(c: AudioContext) {
  const t = c.currentTime;
  [0, 1, 2, 3, 4].forEach((i) => {
    const freq = [400, 500, 640, 800, 1000][i];
    const dt = i * 0.11;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t + dt);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t + dt);
    g.gain.linearRampToValueAtTime(0.14, t + dt + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.4);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(t + dt);
    osc.stop(t + dt + 0.42);
  });
}

/* ─── ПОРАЖЕНИЕ ─────────────────────────────────────────────────────────── */
function playLose(c: AudioContext) {
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(320, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.75);
  const g = c.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
  // Добавляем низкий грохот
  const rBuf = makeNoise(c, 0.75);
  const r = c.createBufferSource();
  r.buffer = rBuf;
  const rLP = c.createBiquadFilter();
  rLP.type = 'lowpass';
  rLP.frequency.setValueAtTime(300, t);
  rLP.frequency.exponentialRampToValueAtTime(50, t + 0.7);
  const rG = c.createGain();
  rG.gain.setValueAtTime(0.3, t);
  rG.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  osc.connect(g);
  g.connect(c.destination);
  r.connect(rLP);
  rLP.connect(rG);
  rG.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.75);
  r.start(t);
}

/* ─── ГЛАВНАЯ ФУНКЦИЯ ───────────────────────────────────────────────────── */
export async function playSound(type: 'click' | 'boom' | 'splash' | 'win' | 'lose' | 'place' | 'turn') {
  const settings = JSON.parse(localStorage.getItem('settings-storage') || '{}');
  if (settings?.state?.sound === false) return;

  let c: AudioContext;
  try {
    c = await getCtx();
  } catch {
    return;
  }

  switch (type) {
    case 'boom':   playBoom(c);   break;
    case 'splash': playSplash(c); break;
    case 'click':  playClick(c);  break;
    case 'place':  playPlace(c);  break;
    case 'turn':   playTurn(c);   break;
    case 'win':    playWin(c);    break;
    case 'lose':   playLose(c);   break;
  }
}
