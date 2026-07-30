// Sons sintetizados (Web Audio API) — sem arquivos externos.
// playKnock/playClack reaproveitados do Curling de Mesa sem mudança;
// playScore, playLaunch, playTurnEnd e playGameEnd são novos — o Curling
// não tem esses eventos discretos (lá é só distância até o centro, um
// único jogador lançando por vez, sem turno completo pra fechar).

const GameAudio = (function () {
  let ctx;
  let lastKnockAt = -Infinity;
  let lastClackAt = -Infinity;
  let lastScoreAt = -Infinity;
  let lastLaunchAt = -Infinity;
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

  // Batida — peça contra o trilho/divisor. Mais aguda e seca a pedido
  // (frequências mais altas + decaimento bem mais curto, menos "corpo"
  // ressoando — um toque mais do que um baque).
  function playKnock(intensity) {
    const ac = ensureCtx();
    if (ac.currentTime - lastKnockAt < MIN_INTERVAL) return;
    lastKnockAt = ac.currentTime;
    playImpact(intensity, {
      bandpassBase: 420, bandpassRange: 180, noiseDecay: 0.045,
      oscBase: 260, oscRange: 60, oscTarget: 140, oscDecay: 0.05
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

  // Sininho curto — o disco realmente entrou num compartimento (não é só
  // um toque, é o momento de pontuar). Duas notas rápidas ascendentes,
  // tom triangular, decaimento curto.
  function playScore() {
    const ac = ensureCtx();
    const now = ac.currentTime;
    if (now - lastScoreAt < MIN_INTERVAL) return;
    lastScoreAt = now;

    [0, 0.07].forEach((delay, i) => {
      const t = now + delay;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 880 : 1318.5, t);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.32, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  // Whoosh do lançamento — ruído filtrado com o passa-banda descendo de
  // agudo pra grave, simulando o disco deslizando rápido sobre a madeira
  // lisa. Intensidade (0-1, força do puxão) controla volume e duração: um
  // puxão fraco mal se ouve, um puxão quase máximo desliza com um rastro
  // mais longo — combina com a superfície bem lisa da física nova.
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

  // Flourish curto e descendente — fecha o turno de um jogador na
  // passagem de bastão pro outro. Contraste de propósito com playScore
  // (que sobe): aqui é "capítulo encerrado", não "acabei de pontuar".
  function playTurnEnd() {
    const ac = ensureCtx();
    const now = ac.currentTime;
    [0, 0.1].forEach((delay, i) => {
      const t = now + delay;
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(i === 0 ? 660 : 440, t);
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }

  // Fanfarra de fim de partida — arpejo ascendente de 4 notas, mais
  // sustentado que os outros sinais curtos (é o único momento em que a
  // partida inteira termina, merece se destacar dos sons de jogada).
  function playGameEnd() {
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

  return { ensureCtx, playKnock, playClack, playScore, playLaunch, playTurnEnd, playGameEnd };
})();
