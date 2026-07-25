// Máquina de estado do jogo: turnos, lançamento, pontuação e loop principal.

const Game = (function () {
  const RING_SCORES_ASC = [...BOARD.targetRings].sort((a, b) => a.radius - b.radius);

  let ctx, canvas;
  let dpr = 1;
  let state;

  function freshState() {
    return {
      order: [PLAYERS.YELLOW, PLAYERS.RED],
      turnIndex: 0,
      remaining: { [PLAYERS.YELLOW]: 5, [PLAYERS.RED]: 5 },
      pieces: [], // { body, player, settledFrames }
      activeBody: null,
      activePlayer: null,
      phase: 'aiming', // aiming | flight | roundEnd
      totalThrown: 0
    };
  }

  function currentPlayer() {
    return state.order[state.turnIndex];
  }

  function spawnActivePiece() {
    const player = currentPlayer();
    const body = GamePhysics.createPiece(
      GameInput.restPosition.x,
      GameInput.restPosition.y,
      player,
      state.totalThrown
    );
    state.activeBody = body;
    state.activePlayer = player;
    state.phase = 'aiming';
    state.pieces.push({ body, player, settledFrames: 0, launched: false });
    updateHud();
  }

  function launch(dirX, dirY, dist) {
    const ratio = Math.min(dist / PHYSICS.maxPullDistance, 1);
    const speed = ratio * PHYSICS.maxLaunchSpeed;
    Matter.Body.setVelocity(state.activeBody, { x: dirX * speed, y: dirY * speed });
    const entry = state.pieces.find((p) => p.body === state.activeBody);
    if (entry) entry.launched = true;
    state.phase = 'flight';
    state.activeBody = null;
  }

  function cancelDrag() {
    Matter.Body.setPosition(state.activeBody, GameInput.restPosition);
    Matter.Body.setVelocity(state.activeBody, { x: 0, y: 0 });
  }

  function onDrag(x, y) {
    Matter.Body.setPosition(state.activeBody, { x, y });
    Matter.Body.setVelocity(state.activeBody, { x: 0, y: 0 });
  }

  function advanceTurn() {
    state.remaining[currentPlayer()] -= 1;
    state.totalThrown += 1;
    if (state.totalThrown >= 10) {
      endRound();
      return;
    }
    state.turnIndex = (state.turnIndex + 1) % state.order.length;
    spawnActivePiece();
  }

  function scoreForDistance(dist) {
    for (const ring of RING_SCORES_ASC) {
      if (dist <= ring.radius) return ring.score;
    }
    return 0;
  }

  function computeScores() {
    const totals = { [PLAYERS.YELLOW]: 0, [PLAYERS.RED]: 0 };
    for (const p of state.pieces) {
      if (!p.onBoard) continue;
      const dist = Math.hypot(p.body.position.x - BOARD.targetX, p.body.position.y - BOARD.targetY);
      totals[p.player] += scoreForDistance(dist);
    }
    return totals;
  }

  function endRound() {
    state.phase = 'roundEnd';
    const totals = computeScores();
    showRoundEnd(totals);
  }

  function showRoundEnd(totals) {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const body = document.getElementById('overlay-body');
    let winnerText;
    if (totals.yellow > totals.red) winnerText = 'Amarelo vence!';
    else if (totals.red > totals.yellow) winnerText = 'Vermelho vence!';
    else winnerText = 'Empate!';
    title.textContent = winnerText;
    body.textContent = `Amarelo: ${totals.yellow} pontos  |  Vermelho: ${totals.red} pontos`;
    overlay.classList.add('visible');
  }

  function resetGame() {
    document.getElementById('overlay').classList.remove('visible');
    for (const p of state.pieces) {
      GamePhysics.removePiece(p.body);
    }
    state = freshState();
    spawnActivePiece();
  }

  function updateHud() {
    SevenSeg.render('score-yellow', computeScores().yellow);
    SevenSeg.render('score-red', computeScores().red);
    document.getElementById('remaining-yellow').textContent = state.remaining[PLAYERS.YELLOW];
    document.getElementById('remaining-red').textContent = state.remaining[PLAYERS.RED];
    const lampYellow = document.getElementById('lamp-yellow');
    const lampRed = document.getElementById('lamp-red');
    lampYellow.classList.toggle('lit', currentPlayer() === PLAYERS.YELLOW && state.phase !== 'roundEnd');
    lampRed.classList.toggle('lit', currentPlayer() === PLAYERS.RED && state.phase !== 'roundEnd');
  }

  function resizeCanvas() {
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    const ratio = totalW / totalH;
    dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Calcula o tamanho de exibição em CSS px preservando a proporção exata
    // do board — evitar depender de width:100%/aspect-ratio combinados, que
    // distorcem o canvas (círculos viram elipses) quando max-height corta a altura.
    const wrap = canvas.parentElement;
    const wrapStyle = getComputedStyle(wrap);
    const availWidth = wrap.clientWidth
      - parseFloat(wrapStyle.paddingLeft) - parseFloat(wrapStyle.paddingRight);
    const availHeight = window.innerHeight * 0.72;
    let displayWidth = Math.min(availWidth, availHeight * ratio);
    let displayHeight = displayWidth / ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }

  function frame() {
    if (state.phase === 'flight') {
      const inFlightPieces = state.pieces.filter((p) => p.launched && !p.settled && !p.removed);
      for (const p of inFlightPieces) {
        if (GamePhysics.isOutOfBounds(p.body)) {
          p.removed = true;
          p.onBoard = false;
          GamePhysics.removePiece(p.body);
          advanceTurn();
          break;
        } else if (GamePhysics.isSettled(p.body)) {
          p.settledFrames = (p.settledFrames || 0) + 1;
          if (p.settledFrames > 12) {
            p.settled = true;
            p.onBoard = true;
            Matter.Body.setVelocity(p.body, { x: 0, y: 0 });
            advanceTurn();
            break;
          }
        } else {
          p.settledFrames = 0;
        }
      }
    }

    GamePhysics.update(1000 / 60);
    render();
    requestAnimationFrame(frame);
  }

  function render() {
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    ctx.clearRect(0, 0, totalW, totalH);
    GameRender.drawWoodFrame(ctx, totalW, totalH);

    ctx.save();
    ctx.translate(BOARD.railThickness, BOARD.railThickness);

    GameRender.drawRails(ctx);
    GameRender.drawPlaySurface(ctx);
    GameRender.drawTarget(ctx);

    // O elástico é desenhado antes das peças para passar por baixo delas
    // (prende na parte inferior da peça, não por cima).
    let jitterX = 0;
    let jitterY = 0;
    if (state.phase === 'aiming' && state.activeBody) {
      const pos = state.activeBody.position;
      const dist = Math.hypot(pos.x - GameInput.anchorMid.x, pos.y - GameInput.anchorMid.y);
      const tension = Math.min(1, dist / PHYSICS.maxPullDistance);
      // instabilidade: praticamente nula em repouso, cresce só conforme a
      // tensão aumenta (curva quadrática) — nada de tremor constante.
      const t = performance.now() / 1000;
      const wobX = Math.sin(t * 5 * Math.PI * 2) * 0.6 + Math.sin(t * 8.3 * Math.PI * 2 + 2.1) * 0.4;
      const wobY = Math.sin(t * 4.4 * Math.PI * 2 + 0.7) * 0.6 + Math.sin(t * 7.1 * Math.PI * 2 + 4.0) * 0.4;
      const jitterAmp = tension * tension * 7;
      jitterX = wobX * jitterAmp;
      jitterY = wobY * jitterAmp;
      GameRender.drawSling(ctx, GameInput.anchorL, GameInput.anchorR, pos.x + jitterX, pos.y + jitterY);
    }

    for (const p of state.pieces) {
      if (p.removed) continue;
      const pos = p.body.position;
      const isActive = p.body === state.activeBody;
      const dx = isActive ? jitterX : 0;
      const dy = isActive ? jitterY : 0;
      GameRender.drawPiece(ctx, pos.x + dx, pos.y + dy, p.body.angle, p.player);
    }

    GameRender.drawLogo(ctx, BOARD.width - 44, BOARD.height - 40, 0.42, 'rgba(169,113,63,0.4)');

    ctx.restore();
  }

  function init() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    GamePhysics.init();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    GameInput.attach(canvas, {
      canDrag: () => state.phase === 'aiming' && !!state.activeBody,
      getPiecePosition: () => state.activeBody ? state.activeBody.position : GameInput.restPosition,
      onDrag: (x, y) => onDrag(x, y),
      onRelease: (dx, dy, dist) => launch(dx, dy, dist),
      onCancel: () => cancelDrag()
    });

    state = freshState();
    spawnActivePiece();

    document.getElementById('btn-restart').addEventListener('click', resetGame);
    document.getElementById('btn-play-again').addEventListener('click', resetGame);

    requestAnimationFrame(frame);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Game.init);
