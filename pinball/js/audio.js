// Motor de áudio — Pinball. Sons sintetizados via Web Audio API.

const GameAudio = (function () {
  let ctx = null;
  let master = null;
  let muted = false;

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
    if (c && c.state === 'suspended') void c.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  }

  function tone(freq, dur, when, opts = {}) {
    const c = ensure();
    if (!c || !master || muted || freq <= 0) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.value = freq;
    const peak = opts.gain ?? 0.14;
    const attack = opts.attack ?? 0.004;
    const release = opts.release ?? 0.12;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setValueAtTime(peak, when + Math.max(attack, dur - release));
    g.gain.linearRampToValueAtTime(0, when + dur);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  // Sino tocado — alvo principal, timbre brilhante de sino de verdade
  // (fundamental + parciais levemente desafinados, como um sino real).
  function bellRing() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const fundamental = 1320;
    const partials = [1, 2.01, 2.99, 4.2];
    for (let i = 0; i < partials.length; i++) {
      tone(fundamental * partials[i], 1.1 - i * 0.15, t, {
        type: 'sine',
        gain: 0.16 / (i + 1),
        attack: 0.003,
        release: 0.9 - i * 0.15,
      });
    }
  }

  function flipperThwack() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    g.gain.setValueAtTime(0.12, t);
    g.gain.linearRampToValueAtTime(0, t + 0.07);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  function postDing() {
    tone(880, 0.09, (ensure() || {}).currentTime ?? 0, { type: 'triangle', gain: 0.13, release: 0.06 });
  }

  function plungerRelease(power) {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(60 + power * 260, t + 0.09);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.1 + power * 0.06, t + 0.015);
    g.gain.linearRampToValueAtTime(0, t + 0.12);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  function ballDrain() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.02);
    g.gain.linearRampToValueAtTime(0, t + 0.55);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  function gameOver() {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 1.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.linearRampToValueAtTime(0, t + 1.2);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.25);
  }

  function click() {
    tone(720, 0.04, (ensure() || {}).currentTime ?? 0, { type: 'square', gain: 0.05, attack: 0.001, release: 0.03 });
  }

  // Baque surdo — bola batendo nas bordas/paredes do campo. `intensity`
  // (0-1, vem da velocidade do impacto) controla volume e um leve grave a
  // mais nas pancadas fortes, pra não soar igual em toda batida.
  function wallThud(intensity) {
    const c = ensure();
    if (!c || !master || muted) return;
    const t = c.currentTime;
    const amt = Math.max(0, Math.min(1, intensity ?? 0.4));
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + amt * 40, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.07);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05 + amt * 0.14, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + amt * 0.04);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  return {
    resume,
    setMuted,
    get muted() { return muted; },
    bellRing,
    flipperThwack,
    postDing,
    plungerRelease,
    ballDrain,
    gameOver,
    click,
    wallThud,
  };
})();
