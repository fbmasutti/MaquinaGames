// Máquina de estado do jogo: bolas, pontuação e loop principal — Toca o Sino.

const Game = (function () {
  const BELL_POINTS = 100;
  const BUMPER_POINTS = 10;

  const MUTE_ICON_ON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const MUTE_ICON_OFF =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9l6 6"/><path d="M22 9l-6 6"/></svg>';

  let canvas, ctx, dpr = 1;
  let lastTime = 0;

  let phase = 'start'; // start | playing | gameOver
  let score = 0;
  let highScore = 0;
  let ballsLeft = 3;
  let ballNum = 1;
  let muted = false;
  let flash = 0;
  let charge = 0;
  let charging = false;

  // ---------------- HUD ----------------
  function updateHud() {
    SevenSeg.render('hud-ball', ballNum, 1);
    SevenSeg.render('hud-score', score, 4);
    SevenSeg.render('hud-hi', highScore, 4);
    for (let i = 0; i < BOARD.ballsPerGame; i++) {
      const el = document.getElementById(`lamp-ball-${i}`);
      if (el) el.classList.toggle('lit', i < ballsLeft);
    }
    const muteBtn = document.getElementById('btn-mute');
    if (muteBtn) muteBtn.innerHTML = muted ? MUTE_ICON_OFF : MUTE_ICON_ON;
  }

  function updateOverlay() {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const body = document.getElementById('overlay-body');
    const cta = document.getElementById('btn-primary');
    const ctaLabel = document.getElementById('btn-primary-label');
    const hi = document.getElementById('overlay-hi');

    if (phase === 'playing') {
      overlay.classList.remove('visible');
      return;
    }
    overlay.classList.add('visible');
    cta.classList.toggle('cta-gameover', phase === 'gameOver');
    title.classList.toggle('title-font', true);

    if (phase === 'start') {
      title.textContent = 'TOCA O SINO';
      body.textContent = 'Segure para carregar o lançador e acerte o sino';
      ctaLabel.textContent = 'Iniciar';
      hi.style.display = highScore > 0 ? '' : 'none';
      hi.textContent = `HI · ${String(highScore).padStart(4, '0')}`;
    } else if (phase === 'gameOver') {
      title.textContent = 'FIM DE JOGO';
      body.textContent = `Pontuação: ${score}   ·   Recorde: ${Math.max(score, highScore)}`;
      ctaLabel.textContent = 'Jogar de novo';
      hi.style.display = 'none';
    }
  }

  // ---------------- Fluxo do jogo ----------------
  function startGame() {
    score = 0;
    ballsLeft = BOARD.ballsPerGame;
    ballNum = 1;
    flash = 0;
    charge = 0;
    charging = false;
    phase = 'playing';
    GamePhysics.spawnBall();
    GameInput.reset();
    updateHud();
    updateOverlay();
  }

  function nextBall() {
    ballNum += 1;
    GamePhysics.spawnBall();
    updateHud();
  }

  function loseBall() {
    GameAudio.ballDrain();
    ballsLeft -= 1;
    updateHud();
    if (ballsLeft <= 0) {
      finishGame();
    } else {
      nextBall();
    }
  }

  function finishGame() {
    phase = 'gameOver';
    GameAudio.gameOver();
    if (score > highScore) {
      highScore = score;
      GameStorage.saveHighScore(highScore);
    }
    updateHud();
    updateOverlay();
  }

  function handlePrimaryAction() {
    GameAudio.resume();
    if (phase === 'start' || phase === 'gameOver') startGame();
  }

  function handleBellHit() {
    score += BELL_POINTS;
    flash = 1;
    GameAudio.bellRing();
    updateHud();
  }

  function handleBumperHit() {
    score += BUMPER_POINTS;
    GameAudio.bumperDing();
    updateHud();
  }

  // ---------------- Loop ----------------
  function advance(dt) {
    if (phase === 'playing') {
      if (charging) charge = Math.min(1, charge + BOARD.launcherChargeRate * dt);
      if (GamePhysics.isDrained()) loseBall();
      GamePhysics.update(1000 / 60);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 1.6);
    draw();
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    advance(dt);
    requestAnimationFrame(tick);
  }

  function draw() {
    GameRender.drawField(ctx);
    GameRender.drawWalls(ctx);
    GameRender.drawRamp(ctx);
    for (const b of BOARD.bumpers) GameRender.drawBumper(ctx, b);
    GameRender.drawBell(ctx, flash);

    for (const side of ['left', 'right']) {
      const f = PhysicsFlipperInfo(side);
      GameRender.drawFlipper(ctx, f.pivot, f.angle, BOARD.flipperLength, BOARD.flipperThickness);
    }

    const ball = GamePhysics.getBall();
    if (ball) GameRender.drawBall(ctx, ball.position.x, ball.position.y);

    GameRender.drawLauncherMeter(ctx, charge);

    if (flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(255, 236, 160, ${flash * 0.28})`;
      ctx.fillRect(0, 0, BOARD.width, BOARD.height);
      ctx.restore();
    }
  }

  // Pequeno acesso somente-leitura ao ângulo/pivô do flipper pro desenho
  // (evita expor os bodies inteiros do Matter pro módulo de render).
  function PhysicsFlipperInfo(side) {
    return GamePhysics.getFlipperInfo(side);
  }

  // ---------------- Setup ----------------
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD.width * dpr;
    canvas.height = BOARD.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ratio = BOARD.width / BOARD.height;
    const wrap = canvas.parentElement;
    const wrapStyle = getComputedStyle(wrap);
    const availWidth = wrap.clientWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight);
    const availHeight = Math.max(260, window.innerHeight - 320);
    const displayWidth = Math.min(availWidth, availHeight * ratio);
    const displayHeight = displayWidth / ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }

  function init() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    GamePhysics.init();
    GamePhysics.setOnBellHit(handleBellHit);
    GamePhysics.setOnBumperHit(handleBumperHit);
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    muted = GameStorage.loadMuted();
    GameAudio.setMuted(muted);
    highScore = GameStorage.loadHighScore();

    GameInput.attach({
      onInteract: () => GameAudio.resume(),
      onFlipper: (side, active) => {
        GamePhysics.setFlipperActive(side, active);
        if (active) GameAudio.flipperThwack();
      },
      onChargeStart: () => {
        if (phase !== 'playing' || !GamePhysics.isBallHeld()) return;
        charging = true;
        charge = 0;
      },
      onChargeRelease: () => {
        if (!charging) return;
        charging = false;
        if (phase === 'playing' && GamePhysics.isBallHeld()) {
          GamePhysics.launchBall(charge);
          GameAudio.plungerRelease(charge);
        }
        charge = 0;
      },
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
      GameAudio.resume();
      startGame();
    });
    document.getElementById('btn-primary').addEventListener('click', handlePrimaryAction);
    document.getElementById('btn-mute').addEventListener('click', () => {
      muted = !muted;
      GameStorage.saveMuted(muted);
      GameAudio.setMuted(muted);
      updateHud();
    });

    updateHud();
    updateOverlay();
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Game.init);
