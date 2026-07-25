// Sons de batida de madeira sintetizados (Web Audio API) — sem arquivos externos.

const GameAudio = (function () {
  let ctx;
  let lastKnockAt = -Infinity;
  let lastClackAt = -Infinity;
  const MIN_INTERVAL = 0.05; // evita estourar áudio em colisões múltiplas no mesmo instante

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function playImpact(intensity, opts) {
    const ac = ensureCtx();
    const now = ac.currentTime;
    const vol = Math.min(0.55, 0.12 + intensity * 0.4);

    // estouro de ruído filtrado (o "toc" percussivo do impacto)
    const bufferSize = Math.floor(ac.sampleRate * 0.06);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ac.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = opts.bandpassBase + Math.random() * opts.bandpassRange;
    bandpass.Q.value = 1.1;
    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + opts.noiseDecay);
    noise.connect(bandpass).connect(noiseGain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + opts.noiseDecay + 0.01);

    // corpo de madeira (ressonância curta)
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(opts.oscBase + Math.random() * opts.oscRange, now);
    osc.frequency.exponentialRampToValueAtTime(opts.oscTarget, now + opts.oscDecay);
    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(vol * 0.75, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + opts.oscDecay + 0.02);
    osc.connect(oscGain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + opts.oscDecay + 0.03);
  }

  // Batida grave — peça contra o trilho
  function playKnock(intensity) {
    const ac = ensureCtx();
    if (ac.currentTime - lastKnockAt < MIN_INTERVAL) return;
    lastKnockAt = ac.currentTime;
    playImpact(intensity, {
      bandpassBase: 280, bandpassRange: 180, noiseDecay: 0.09,
      oscBase: 170, oscRange: 50, oscTarget: 85, oscDecay: 0.1
    });
  }

  // Clack agudo — peça contra peça: quase só o transiente, bem mais curto
  function playClack(intensity) {
    const ac = ensureCtx();
    const now = ac.currentTime;
    if (now - lastClackAt < MIN_INTERVAL) return;
    lastClackAt = now;

    const vol = Math.min(0.5, 0.14 + intensity * 0.36);
    const decay = 0.025;

    const bufferSize = Math.floor(ac.sampleRate * decay);
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const bandpass = ac.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.value = 750 + Math.random() * 350;
    bandpass.Q.value = 1.4;
    const noiseGain = ac.createGain();
    noiseGain.gain.setValueAtTime(vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    noise.connect(bandpass).connect(noiseGain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + decay + 0.01);
  }

  return { ensureCtx, playKnock, playClack };
})();
