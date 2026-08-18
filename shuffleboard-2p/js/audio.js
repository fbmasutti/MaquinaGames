// Sons sintetizados (Web Audio API) — sem arquivos externos.
// playKnock/playClack/playLaunch vêm do Passe-Trappe sem mudança; playScore
// (disco parou dentro do alvo) e playRoundEnd/playTurn são adaptações dos
// motivos curtos do mesmo arquivo pro contexto de jogo em turnos.

const GameAudio = (function () {
  let ctx;
  let lastKnockAt = -Infinity;
  let lastClackAt = -Infinity;
  let lastLaunchAt = -Infinity;
  const MIN_INTERVAL = 0.05;

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

  // Batida — disco contra trilho/elástico.
  function playKnock(intensity) {
    const ac = ensureCtx();
    if (ac.currentTime - lastKnockAt < MIN_INTERVAL) return;
    lastKnockAt = ac.currentTime;
    playImpact(intensity, {
      bandpassBase: 420, bandpassRange: 180, noiseDecay: 0.045,
      oscBase: 260, oscRange: 60, oscTarget: 140, oscDecay: 0.05
    });
  }

  // Clack agudo — disco contra disco.
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

  // Whoosh do lançamento.
  function playLaunch(intensity) {
    const ac = ensureCtx();
    const now = ac.currentTime;
    if (now - lastLaunchAt < MIN_INTERVAL) return;
    lastLaunchAt = now;

    const vol = Math.min(0.4, 0.07 + intensity * 0.3);
    const decay = 0.1 + intensity * 0.12;

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
    bandpass.Q.value = 0.9;
    bandpass.frequency.setValueAtTime(1300 + intensity * 600, now);
    bandpass.frequency.exponentialRampToValueAtTime(320, now + decay);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + decay);
    noise.connect(bandpass).connect(gain).connect(ac.destination);
    noise.start(now);
    noise.stop(now + decay + 0.01);
  }

  // Sininho — o turno acabou com o disco DENTRO do alvo. Quanto mais perto do
  // centro (score maior), mais agudo: dá pra ouvir a qualidade do tiro sem
  // olhar pro placar.
  function playScore(score) {
    const ac = ensureCtx();
    const now = ac.currentTime;
    const freqs = { 5: 523.25, 10: 659.25, 15: 783.99, 20: 1046.5 };
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freqs[score] || 523.25, now);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Bipe seco de troca de turno — marca "agora é do outro lado".
  function playTurn() {
    const ac = ensureCtx();
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(392, now);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Arpejo de 4 notas — fim de rodada com vencedor.
  function playRoundEnd() {
    const ac = ensureCtx();
    const now = ac.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.11;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.52);
    });
  }

  // Duas notas iguais — empate, sem vencedor pra celebrar.
  function playTie() {
    const ac = ensureCtx();
    const now = ac.currentTime;
    [0, 0.16].forEach((delay) => {
      const t = now + delay;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, t);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.26, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.36);
    });
  }

  return { ensureCtx, playKnock, playClack, playLaunch, playScore, playTurn, playRoundEnd, playTie };
})();
