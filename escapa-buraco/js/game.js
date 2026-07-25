// Máquina de estado do jogo: níveis, sequências, pontuação e loop principal.

const Game = (function () {
  let canvas, ctx, dpr = 1;
  let lastTime = 0;

  let phase = "start"; // start | playing | fetching | levelClear | gameOver
  let gState = Physics.initState();
  let levelIdx = 0;
  let targetIdx = 0;
  let timeLeft = LEVELS[0].timeSeconds;
  let score = 0;
  let lives = 3;
  let lastCountdownBeep = -1;
  let flash = 0;
  let highScore = 0;
  let muted = false;

  // Animação de "busca": toda vez que a bola entra em um buraco (certo ou
  // errado), a barra nivela, desce até a casinha para buscar a bola e sobe de
  // volta à posição inicial — só então a consequência (avançar alvo, limpar
  // nível, perder vida) é aplicada, via callback `onDone`.
  const FETCH_LEVEL_DUR = 0.32;
  const FETCH_DOWN_DUR = 0.46;
  const FETCH_UP_DUR = 0.46;
  const FETCH_OVERSHOOT = 16;
  let fetch = null;

  const MUTE_ICON_ON =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const MUTE_ICON_OFF =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9l6 6"/><path d="M22 9l-6 6"/></svg>';

  function currentLevel() {
    return LEVELS[levelIdx];
  }
  function currentTargetId() {
    const seq = currentLevel().sequence;
    return seq[Math.min(targetIdx, seq.length - 1)];
  }

  function easeInOutQuad(p) {
    return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // ---------------- HUD ----------------
  function updateHud() {
    SevenSeg.render("hud-level", levelIdx + 1, 2);
    SevenSeg.render("hud-time", Math.max(0, Math.ceil(timeLeft)), 2);
    SevenSeg.render("hud-score", score, 4);
    SevenSeg.render("hud-hi", highScore, 4);
    for (let i = 0; i < 3; i++) {
      const el = document.getElementById(`lamp-life-${i}`);
      if (el) el.classList.toggle("lit", i < lives);
    }
    const muteBtn = document.getElementById("btn-mute");
    if (muteBtn) muteBtn.innerHTML = muted ? MUTE_ICON_OFF : MUTE_ICON_ON;
  }

  function updateOverlay() {
    const overlay = document.getElementById("overlay");
    const title = document.getElementById("overlay-title");
    const body = document.getElementById("overlay-body");
    const cta = document.getElementById("btn-primary");
    const ctaLabel = document.getElementById("btn-primary-label");
    const hi = document.getElementById("overlay-hi");

    if (phase === "playing" || phase === "fetching") {
      overlay.classList.remove("visible");
      return;
    }
    overlay.classList.add("visible");
    cta.classList.toggle("cta-gameover", phase === "gameOver");
    title.classList.toggle("title-font", phase === "start" || phase === "gameOver");

    if (phase === "start") {
      title.textContent = "ESCAPA BURACO";
      body.textContent = "Guie a bola até o buraco alvo destacado";
      ctaLabel.textContent = "Iniciar";
      cta.style.display = "";
      hi.style.display = highScore > 0 ? "" : "none";
      hi.textContent = `HI · ${String(highScore).padStart(4, "0")}`;
    } else if (phase === "levelClear") {
      title.textContent = `NÍVEL ${levelIdx + 1} OK`;
      body.textContent = "Preparando próximo nível…";
      cta.style.display = "none";
      hi.style.display = "none";
    } else if (phase === "gameOver") {
      title.textContent = "FIM DE JOGO";
      body.textContent = `Pontuação: ${score}   ·   Recorde: ${Math.max(score, highScore)}`;
      ctaLabel.textContent = "Jogar de novo";
      cta.style.display = "";
      hi.style.display = "none";
    }
  }

  // ---------------- Fluxo do jogo ----------------
  function startGame() {
    EscapaAudio.stopMotor();
    gState = Physics.initState();
    Input.reset();
    levelIdx = 0;
    targetIdx = 0;
    timeLeft = LEVELS[0].timeSeconds;
    score = 0;
    lives = 3;
    lastCountdownBeep = -1;
    flash = 0;
    fetch = null;
    phase = "playing";
    EscapaAudio.playTheLick();
    updateHud();
    updateOverlay();
  }

  function nextLevel() {
    const next = levelIdx + 1;
    if (next >= TOTAL_LEVELS) {
      finishGame(true);
      return;
    }
    levelIdx = next;
    targetIdx = 0;
    timeLeft = LEVELS[next].timeSeconds;
    lastCountdownBeep = -1;
    gState = Physics.initState();
    phase = "playing";
    flash = 0;
    updateHud();
    updateOverlay();
  }

  // onResume roda quando a barra termina de buscar a bola e o jogo volta a
  // rodar (não é chamado se as vidas zeraram — aí quem assume é finishGame).
  function loseLife(onResume) {
    lives -= 1;
    EscapaAudio.wrongHole();
    updateHud();
    if (lives <= 0) {
      beginFetch(() => finishGame(false));
    } else {
      targetIdx = 0;
      beginFetch(() => {
        phase = "playing";
        if (onResume) onResume();
        updateOverlay();
      });
    }
  }

  // Toda entrada em buraco (certa ou errada) dispara essa animação: a barra
  // nivela, desce até a casinha buscar a bola e sobe de volta à posição
  // inicial — só então `onDone` aplica a consequência (retomar, limpar nível,
  // fim de jogo). Isso também garante que a barra nunca fica tilted entre um
  // alvo intermediário e o próximo, o que faria a bola cair sozinha.
  function beginFetch(onDone) {
    phase = "fetching";
    EscapaAudio.stopMotor();
    EscapaAudio.startMotor();
    fetch = {
      t: 0,
      startLeft: gState.barLeftY,
      startRight: gState.barRightY,
      avgY: (gState.barLeftY + gState.barRightY) / 2,
      thunkPlayed: false,
      onDone,
    };
    Input.reset();
    updateHud();
    updateOverlay();
  }

  function finishGame(won) {
    phase = "gameOver";
    EscapaAudio.stopMotor();
    EscapaAudio.gameOver();
    if (won) score += 1000;
    if (score > highScore) {
      highScore = score;
      Storage.saveHighScore(highScore);
    }
    updateHud();
    updateOverlay();
  }

  function clearedLevel() {
    phase = "levelClear";
    updateOverlay();
    updateHud();
    setTimeout(() => {
      if (phase === "levelClear") nextLevel();
    }, 900);
  }

  function handlePrimaryAction() {
    EscapaAudio.resume();
    if (phase === "start" || phase === "gameOver") startGame();
  }

  function handleHole(h) {
    const seq = currentLevel().sequence;
    const idx = targetIdx;
    const expectedId = seq[idx];

    if (h.id !== expectedId) {
      loseLife();
      return;
    }

    score += Scoring.scoreForHit(h.row, timeLeft, idx);
    updateHud();

    if (idx + 1 >= seq.length) {
      // Toca a fanfarra de vitória imediatamente, antes do reset da barra.
      EscapaAudio.playPowerRangers();
      flash = 1;
      beginFetch(() => clearedLevel());
    } else {
      EscapaAudio.checkpoint();
      flash = 0.6;
      const nextIdx = idx + 1;
      beginFetch(() => {
        phase = "playing";
        targetIdx = nextIdx;
        timeLeft += CHECKPOINT_TIME_BONUS;
        lastCountdownBeep = -1;
        updateOverlay();
        updateHud();
      });
    }
  }

  // ---------------- Loop ----------------
  function stepFetch(dt) {
    fetch.t += dt;
    const t = fetch.t;
    if (t < FETCH_LEVEL_DUR) {
      const p = easeInOutQuad(t / FETCH_LEVEL_DUR);
      gState.barLeftY = lerp(fetch.startLeft, fetch.avgY, p);
      gState.barRightY = lerp(fetch.startRight, fetch.avgY, p);
    } else if (t < FETCH_LEVEL_DUR + FETCH_DOWN_DUR) {
      const p = easeInOutQuad((t - FETCH_LEVEL_DUR) / FETCH_DOWN_DUR);
      const y = lerp(fetch.avgY, BOARD.barMaxY + FETCH_OVERSHOOT, p);
      gState.barLeftY = y;
      gState.barRightY = y;
    } else if (t < FETCH_LEVEL_DUR + FETCH_DOWN_DUR + FETCH_UP_DUR) {
      if (!fetch.thunkPlayed) {
        EscapaAudio.wallTock();
        fetch.thunkPlayed = true;
      }
      const p = easeInOutQuad((t - FETCH_LEVEL_DUR - FETCH_DOWN_DUR) / FETCH_UP_DUR);
      const y = lerp(BOARD.barMaxY + FETCH_OVERSHOOT, BOARD.barMaxY, p);
      gState.barLeftY = y;
      gState.barRightY = y;
    } else {
      EscapaAudio.stopMotor();
      gState.barLeftY = BOARD.barMaxY;
      gState.barRightY = BOARD.barMaxY;
      gState.ballS = BOARD.width / 2;
      gState.ballV = 0;
      const onDone = fetch.onDone;
      fetch = null;
      onDone && onDone();
    }
  }

  function advance(dt) {
    if (phase === "playing") {
      const leftDir = Input.state.leftUp ? -1 : Input.state.leftDown ? 1 : 0;
      const rightDir = Input.state.rightUp ? -1 : Input.state.rightDown ? 1 : 0;
      Physics.moveBarEnd(gState, "left", leftDir, dt);
      Physics.moveBarEnd(gState, "right", rightDir, dt);

      const evt = Physics.stepPhysics(gState, dt);
      if (evt) {
        if (evt.type === "bounce") EscapaAudio.wallTock();
        else if (evt.type === "hole") handleHole(evt.hole);
      }

      timeLeft -= dt;
      const whole = Math.ceil(timeLeft);
      if (whole <= 5 && whole >= 1 && whole !== lastCountdownBeep) {
        lastCountdownBeep = whole;
        EscapaAudio.countdownBeep(whole);
      }
      if (timeLeft <= 0) {
        timeLeft = 0;
        loseLife(() => {
          timeLeft = currentLevel().timeSeconds;
          lastCountdownBeep = -1;
        });
      }
      updateHud();
    } else if (phase === "fetching") {
      stepFetch(dt);
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
    Render.draw(ctx, {
      state: gState,
      targetHoleId: currentTargetId(),
      showTarget: phase === "playing",
      showBall: phase !== "fetching",
      flash,
    });
  }

  // ---------------- Setup ----------------
  // Calcula o tamanho de exibição em CSS px preservando a proporção exata do
  // board — width:100% combinado com aspect-ratio/max-height distorce o
  // canvas (círculos viram elipses) quando a altura acaba cortando a largura.
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = BOARD.width * dpr;
    canvas.height = BOARD.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ratio = BOARD.width / BOARD.height;
    const wrap = canvas.parentElement;
    const wrapStyle = getComputedStyle(wrap);
    const availWidth = wrap.clientWidth - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight);
    const availHeight = Math.max(260, window.innerHeight - 360);
    const displayWidth = Math.min(availWidth, availHeight * ratio);
    const displayHeight = displayWidth / ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }

  function init() {
    canvas = document.getElementById("board");
    ctx = canvas.getContext("2d");
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    muted = Storage.loadMuted();
    EscapaAudio.setMuted(muted);
    highScore = Storage.loadHighScore();

    Input.attach({
      onInteract: () => EscapaAudio.resume(),
      onPrimary: () => handlePrimaryAction(),
      onMotorChange: (before, after) => {
        if (phase !== "playing") {
          EscapaAudio.stopMotor();
          return;
        }
        if (!before && after) EscapaAudio.startMotor();
        else if (before && !after) EscapaAudio.stopMotor();
      },
    });

    // No fliperama físico, o botão Start funciona como reset: interrompe a
    // partida a qualquer momento e começa do zero — igual ao knob de reset.
    const hardReset = () => {
      EscapaAudio.resume();
      startGame();
    };
    document.getElementById("btn-restart").addEventListener("click", hardReset);
    document.getElementById("btn-start-panel").addEventListener("click", hardReset);
    document.getElementById("btn-primary").addEventListener("click", handlePrimaryAction);
    document.getElementById("btn-mute").addEventListener("click", () => {
      muted = !muted;
      Storage.saveMuted(muted);
      EscapaAudio.setMuted(muted);
      updateHud();
    });

    updateHud();
    updateOverlay();
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  return { init };
})();

window.addEventListener("DOMContentLoaded", Game.init);
