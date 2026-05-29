let ctx: AudioContext | null = null;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function playSound(type: 'click' | 'boom' | 'splash' | 'win' | 'lose' | 'place' | 'turn') {
  // Проверяем настройку (сохранена в localStorage)
  const settings = JSON.parse(localStorage.getItem('settings-storage') || '{}');
  if (settings?.state?.sound === false) return;

  const c = getCtx();
  const t = c.currentTime;

  if (type === 'click') {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.05);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  } 
  
  else if (type === 'boom') {
    // Белый шум для взрыва
    const bufferSize = c.sampleRate * 0.5;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    
    // Фильтр низких частот (глухой взрыв)
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.3);
    
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start(t);
  }

  else if (type === 'splash') {
    // Высокочастотный шум
    const bufferSize = c.sampleRate * 0.2;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    
    const noise = c.createBufferSource();
    noise.buffer = buffer;
    
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2000, t);
    
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    noise.start(t);
  }

  else if (type === 'win') {
    // Арпеджио
    [400, 500, 600, 800].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0, t + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.1, t + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.3);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.3);
    });
  }

  else if (type === 'place') {
    // Глухой «стук» постановки корабля
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  else if (type === 'turn') {
    // Лёгкий двойной «пинг» — твой ход
    [660, 880].forEach((freq, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.1);
      gain.gain.setValueAtTime(0.0001, t + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.08, t + i * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.18);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t + i * 0.1);
      osc.stop(t + i * 0.1 + 0.18);
    });
  }

  else if (type === 'lose') {
    // Падающий тон
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.6);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}
