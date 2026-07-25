// Motor chiptune — Escapa Buraco. Sons sintetizados via Web Audio API.

const EscapaAudio = (function () {
  const NOTE = (() => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const out = {};
    for (let oct = 2; oct <= 6; oct++) {
      names.forEach((n, i) => {
        const midi = 12 * (oct + 1) + i;
        out[`${n}${oct}`] = 440 * Math.pow(2, (midi - 69) / 12);
      });
    }
    return out;
  })();
  const SILENCE = 0;

  // "The Lick", em ré menor, com uma pequena respiração antes da nota final
  // para marcar a frase (em vez de duração contínua sem separação).
  const THE_LICK = [
    { f: NOTE.D4, d: 0.18 },
    { f: NOTE.E4, d: 0.18 },
    { f: NOTE.F4, d: 0.18 },
    { f: NOTE.G4, d: 0.18 },
    { f: NOTE.E4, d: 0.28 },
    { f: NOTE.C4, d: 0.18 },
    { f: SILENCE, d: 0.06 },
    { f: NOTE.D4, d: 0.5 },
  ];

  // "Go Go Power Rangers" — par de notas de arranque com respiro, escorregada
  // central, nota de clímax e retomada cadenciada, cada nota separada por um
  // silêncio explícito (staccato), em vez de notas coladas.
  const POWER_RANGERS = [
    { f: NOTE.E4, d: 0.15 },
    { f: SILENCE, d: 0.08 },
    { f: NOTE.E4, d: 0.15 },
    { f: SILENCE, d: 0.08 },
    { f: NOTE.G4, d: 0.15 },
    { f: NOTE.A4, d: 0.15 },
    { f: SILENCE, d: 0.08 },
    { f: NOTE.B4, d: 0.22 },
    { f: SILENCE, d: 0.08 },
    { f: NOTE.E4, d: 0.2 },
    { f: SILENCE, d: 0.15 },
    { f: SILENCE, d: 0.15 },
  ];

  let ctx = null;
  let master = null;
  let motorOsc = null;
  let motorGain = null;
  let motorLfo = null;
  let motorActive = false;
  let muted = false;
  let lastWallTockAt = -Infinity;
  const WALL_TOCK_MIN_INTERVAL = 0.12; // evita metralhar o som quando a bola fica encostada no batente

  function ensure() {
    if (ctx) return ctx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
    if (m) stopMotor();
  }

  function tone(freq, dur, when, opts = {}) {
    const c = ensure();
    if (!c || !master || muted || freq <= 0) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? "triangle";
    osc.frequency.value = freq;
    const peak = opts.gain ?? 0.12;
    const attack = opts.attack ?? 0.005;
    const release = opts.release ?? 0.08;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  function playSequence(seq, opts = {}) {
    const c = ensure();
    if (!c) return;
    let t = c.currentTime + 0.02;
    for (const n of seq) {
      tone(n.f, n.d * 0.92, t, { type: opts.type, gain: opts.gain });
      t += n.d;
    }
  }

  function playTheLick() {
    playSequence(THE_LICK, { type: "triangle", gain: 0.14 });
  }

  function playPowerRangers() {
    playSequence(POWER_RANGERS, { type: "square", gain: 0.11 });
  }

  // --- Tom contínuo do motor de passo (bem baixinho, sem bip) ---
  function startMotor() {
    const c = ensure();
    if (!c || !master || muted || motorActive) return;
    motorActive = true;

    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = 500;

    const gain = c.createGain();
    gain.gain.value = 0;

    const lfo = c.createOscillator();
    lfo.type = "square";
    lfo.frequency.value = 22;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.003;

    lfo.connect(lfoGain).connect(gain.gain);
    osc.connect(gain).connect(master);

    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.005, now + 0.05);

    osc.start();
    lfo.start();

    motorOsc = osc;
    motorGain = gain;
    motorLfo = lfo;
  }

  function stopMotor() {
    if (!motorActive || !ctx || !motorOsc || !motorGain || !motorLfo) return;
    motorActive = false;
    const now = ctx.currentTime;
    motorGain.gain.cancelScheduledValues(now);
    motorGain.gain.setValueAtTime(motorGain.gain.value, now);
    motorGain.gain.linearRampToValueAtTime(0, now + 0.06);
    const osc = motorOsc;
    const lfo = motorLfo;
    setTimeout(() => {
      try {
        osc.stop();
        lfo.stop();
      } catch {
        /* noop */
      }
    }, 100);
    motorOsc = null;
    motorGain = null;
    motorLfo = null;
  }

  // --- SFX ---
  function click() {
    const c = ensure();
    if (!c) return;
    tone(720, 0.04, c.currentTime + 0.001, { type: "square", gain: 0.05, attack: 0.001, release: 0.03 });
  }

  // Toque seco de "batente" — bola quicando na ponta da barra, ou a barra
  // encontrando o fim de curso na animação de reset.
  function wallTock() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    if (t - lastWallTockAt < WALL_TOCK_MIN_INTERVAL) return;
    lastWallTockAt = t;
    tone(180, 0.08, t, { type: "square", gain: 0.09, attack: 0.001, release: 0.06 });
  }

  function wrongHole() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.01);
    g.gain.linearRampToValueAtTime(0, t + 0.4);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Sino curto de dois tons para alvo intermediário acertado.
  function checkpoint() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + 0.005;
    tone(NOTE.E5, 0.11, t, { type: "triangle", gain: 0.12, release: 0.06 });
    tone(NOTE.B5, 0.16, t + 0.09, { type: "triangle", gain: 0.11, release: 0.09 });
  }

  function countdownBeep(secondsLeft) {
    const c = ensure();
    if (!c) return;
    const base = 660 + (5 - secondsLeft) * 60;
    tone(base, 0.09, c.currentTime + 0.001, { type: "square", gain: 0.09, attack: 0.002, release: 0.06 });
  }

  function gameOver() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 1.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.25);
  }

  return {
    resume,
    setMuted,
    get muted() { return muted; },
    playTheLick,
    playPowerRangers,
    startMotor,
    stopMotor,
    click,
    wallTock,
    wrongHole,
    checkpoint,
    countdownBeep,
    gameOver,
  };
})();
