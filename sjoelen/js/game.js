// Máquina de estado do jogo: turnos completos por jogador, rodadas de
// repescagem, pontuação e loop principal.
//
// Diferença central pro Curling de Mesa: lá os lançamentos se alternam um a
// um entre os dois jogadores. Aqui cada jogador joga o turno INTEIRO (as 3
// rodadas com os 12 discos, repescando só quem não pontuou) antes de passar
// a vez — igual ao sjoelen de verdade.

const Game = (function () {
  let ctx, canvas;
  let dpr = 1;
  let state;
  // Duração do anel de confirmação quando um disco pontua (ver
  // e.scoredAt/drawScorePulse) — puramente visual, não afeta o jogo.
  const SCORE_PULSE_MS = 650;

  function freshState() {
    return {
      players: [
        { key: PLAYERS.P1, label: 'JOGADOR 1', score: 0, played: false },
        { key: PLAYERS.P2, label: 'JOGADOR 2', score: 0, played: false }
      ],
      currentPlayerIndex: 0,
      round: 1,
      pucksQueue: [], // ids ainda por lançar NESTA rodada
      nextRoundQueue: [], // ids que ficaram na pista, repescados pra próxima rodada
      onBoard: [], // { id, body, settledFrames } — peças atualmente no tabuleiro (podem ser de rodadas anteriores)
      activeEntry: null, // entrada de onBoard correspondente à peça em jogo agora
      phase: 'aiming', // aiming | flight | gameEnd
      nextPuckId: 0
    };
  }

  function currentPlayer() {
    return state.players[state.currentPlayerIndex];
  }

  function startTurn() {
    state.round = 1;
    state.pucksQueue = Array.from({ length: RULES.pucksPerTurn }, () => state.nextPuckId++);
    state.onBoard = [];
    spawnActivePiece();
    updateHud();
  }

  function spawnActivePiece() {
    const id = state.pucksQueue.shift();
    const body = GamePhysics.createPiece(GameInput.restPosition.x, GameInput.restPosition.y, id);
    // thrownRound marca em qual rodada este disco especificamente foi
    // lançado — endRound() só reexamina discos com thrownRound === rodada
    // atual pra decidir repescagem. Sem isso, um disco de uma rodada
    // anterior que só ficou parado ali (já pontuado) seria reexaminado de
    // novo a cada rodada seguinte e, se alguém o derrubasse pra pista mais
    // tarde, entraria errado na fila de repescagem (a regra real só
    // repesca quem falhou NA rodada em que foi lançado).
    const entry = { id, body, settledFrames: 0, launched: false, settled: false, thrownRound: state.round };
    state.onBoard.push(entry);
    state.activeEntry = entry;
    state.phase = 'aiming';
    updateHud();
  }

  // dirX/dirY/speed já vêm prontos do gesto de arremesso (ver input.js) —
  // sem estilingue, não há mais distância de puxão pra converter em força.
  function launch(dirX, dirY, speed) {
    Matter.Body.setVelocity(state.activeEntry.body, { x: dirX * speed, y: dirY * speed });
    GameAudio.playLaunch(speed / PHYSICS.maxLaunchSpeed);
    state.activeEntry.launched = true;
    state.phase = 'flight';
    state.activeEntry = null;
  }

  function cancelDrag() {
    Matter.Body.setPosition(state.activeEntry.body, GameInput.restPosition);
    Matter.Body.setVelocity(state.activeEntry.body, { x: 0, y: 0 });
  }

  function onDrag(x, y) {
    Matter.Body.setPosition(state.activeEntry.body, { x, y });
    Matter.Body.setVelocity(state.activeEntry.body, { x: 0, y: 0 });
  }

  // Compartimento onde uma peça está, ou null se ainda está na pista aberta
  // (abaixo da linha do gate) — usado tanto pra decidir repescagem quanto
  // pra pontuação final. Sempre pela posição de repouso, nunca por um
  // evento de "passou pela linha" — assim um disco derrubado depois some
  // do placar sozinho, sem lógica extra (mesmo espírito do Curling, que
  // pontua por posição final, não por trajetória).
  function slotForBody(body) {
    if (body.position.y >= BOARD.gateY) return null;
    for (const slot of BOARD.slots) {
      if (body.position.x >= slot.xMin && body.position.x <= slot.xMax) return slot;
    }
    return null;
  }

  function computeScore(entries) {
    const counts = {};
    for (const v of BOARD.slotOrder) counts[v] = 0;
    for (const e of entries) {
      const slot = slotForBody(e.body);
      if (slot) counts[slot.value]++;
    }
    const sets = Math.min(...BOARD.slotOrder.map((v) => counts[v]));
    let score = sets * RULES.setBonus;
    for (const v of BOARD.slotOrder) score += (counts[v] - sets) * v;
    return { score, sets, counts };
  }

  function endRound() {
    // Repescagem desativada temporariamente (ver RULES.repescagemEnabled em
    // constants.js): discos que erraram simplesmente ficam onde pararam, na
    // pista aberta, até o fim do turno — sem rodada 2/3 pra relançá-los.
    if (!RULES.repescagemEnabled) {
      endTurn();
      return;
    }

    const thrownThisRound = state.onBoard.filter((e) => e.thrownRound === state.round);

    const stillOnLane = [];
    for (const e of thrownThisRound) {
      if (!slotForBody(e.body)) {
        stillOnLane.push(e.id);
        GamePhysics.removePiece(e.body);
        state.onBoard = state.onBoard.filter((o) => o !== e);
      }
    }

    if (state.round < RULES.roundsPerTurn && stillOnLane.length > 0) {
      state.round++;
      state.pucksQueue = stillOnLane;
      spawnActivePiece();
    } else {
      endTurn();
    }
  }

  function endTurn() {
    const result = computeScore(state.onBoard);
    currentPlayer().score = result.score;
    currentPlayer().played = true;

    if (state.currentPlayerIndex === 0) {
      GameAudio.playTurnEnd();
      showTurnEndOverlay();
    } else {
      state.phase = 'gameEnd';
      showGameEnd();
    }
  }

  // Pausa entre os dois turnos: mostra quem acabou de jogar, a pontuação e
  // quem é o próximo, e só limpa o tabuleiro/começa o turno seguinte quando
  // o jogador confirma — dá tempo de ver o resultado final antes dos discos
  // sumirem. Enquanto essa tela está visível não há activeEntry nenhum, então
  // o gesto de arremesso já fica desabilitado sozinho (ver canDrag em init()).
  function showTurnEndOverlay() {
    const finished = currentPlayer();
    const next = state.players[1];
    document.getElementById('turn-overlay-title').textContent = `${finished.label}: ${finished.score} pontos`;
    document.getElementById('turn-overlay-body').textContent = `Próximo: ${next.label}`;
    document.getElementById('turn-overlay').classList.add('visible');
  }

  function proceedToNextTurn() {
    document.getElementById('turn-overlay').classList.remove('visible');
    for (const e of state.onBoard) GamePhysics.removePiece(e.body);
    state.onBoard = [];
    state.currentPlayerIndex = 1;
    startTurn();
  }

  function showGameEnd() {
    GameAudio.playGameEnd();
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const body = document.getElementById('overlay-body');
    const [p1, p2] = state.players;
    let winnerText;
    if (p1.score > p2.score) winnerText = `${p1.label} vence!`;
    else if (p2.score > p1.score) winnerText = `${p2.label} vence!`;
    else winnerText = 'Empate!';
    title.textContent = winnerText;
    body.textContent = `${p1.label}: ${p1.score} pontos  |  ${p2.label}: ${p2.score} pontos`;
    overlay.classList.add('visible');
  }

  function resetGame() {
    document.getElementById('overlay').classList.remove('visible');
    document.getElementById('turn-overlay').classList.remove('visible');
    for (const e of state.onBoard) GamePhysics.removePiece(e.body);
    state = freshState();
    startTurn();
  }

  function updateHud() {
    const [p1, p2] = state.players;
    SevenSeg.render('score-p1', p1.score);
    SevenSeg.render('score-p2', p2.score);

    const activeIdx = state.currentPlayerIndex;
    document.getElementById('sub-p1').textContent = subLineFor(0, activeIdx);
    document.getElementById('sub-p2').textContent = subLineFor(1, activeIdx);
    renderQueue('queue-p1', 0, activeIdx);
    renderQueue('queue-p2', 1, activeIdx);

    document.getElementById('lamp-p1').classList.toggle('lit', activeIdx === 0 && state.phase !== 'gameEnd');
    document.getElementById('lamp-p2').classList.toggle('lit', activeIdx === 1 && state.phase !== 'gameEnd');
  }

  function subLineFor(idx, activeIdx) {
    if (idx !== activeIdx) return state.players[idx].played ? 'turno concluído' : 'aguardando';
    return '';
  }

  // Um pontinho por disco ainda por lançar no turno do jogador da vez
  // (incluindo o que está em jogo agora) — substitui o antigo texto
  // "restam N" por uma fila visual de mini-discos.
  function renderQueue(elId, idx, activeIdx) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    if (idx !== activeIdx || state.phase === 'gameEnd') return;
    const remaining = state.pucksQueue.length + (state.activeEntry ? 1 : 0);
    for (let i = 0; i < remaining; i++) {
      const dot = document.createElement('span');
      dot.className = 'queue-dot';
      el.appendChild(dot);
    }
  }

  function resizeCanvas() {
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    const ratio = totalW / totalH;
    dpr = window.devicePixelRatio || 1;
    canvas.width = totalW * dpr;
    canvas.height = totalH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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

  // Placar atualiza jogada a jogada — não só no fim do turno inteiro — pra
  // dar feedback imediato de cada disco que entra ou sai de um compartimento
  // (inclusive quando um disco quica pra fora depois de empurrado por outro,
  // ou termina de assentar em segundo plano — ver frame()).
  function refreshScore() {
    currentPlayer().score = computeScore(state.onBoard).score;
    updateHud();
  }

  function frame() {
    tick();
    render();
    requestAnimationFrame(frame);
  }

  function tick() {
    if (state.phase === 'flight') {
      // Espera o disco parar de verdade antes de atualizar o placar e
      // liberar a próxima tacada — a pedido explícito (a versão anterior
      // liberava cedo, com um limiar tolerante, e ficou confuso: o próximo
      // disco aparecia enquanto o anterior ainda estava visivelmente
      // deslizando).
      const active = state.onBoard.find((e) => e.launched && !e.settled);
      if (active) {
        if (GamePhysics.isOutOfBounds(active.body)) {
          active.settled = true;
          GamePhysics.removePiece(active.body);
          state.onBoard = state.onBoard.filter((o) => o !== active);
          afterSettle();
        } else if (GamePhysics.isSettled(active.body)) {
          active.settledFrames++;
          if (active.settledFrames > 12) {
            active.settled = true;
            Matter.Body.setVelocity(active.body, { x: 0, y: 0 });
            if (slotForBody(active.body)) {
              GameAudio.playScore();
              active.scoredAt = performance.now();
            }
            afterSettle();
          }
        } else {
          active.settledFrames = 0;
        }
      }
    }

    GamePhysics.update(1000 / 60);
  }

  // Chamado assim que o disco ativo assenta de verdade: ou tem mais peças
  // na fila desta rodada (lança a próxima), ou a rodada acabou
  // (repesca/fim de turno).
  function afterSettle() {
    refreshScore();
    if (state.pucksQueue.length > 0) {
      spawnActivePiece();
    } else {
      endRound();
    }
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
    GameRender.drawSlots(ctx);
    GameRender.drawDividers(ctx);

    const now = performance.now();
    for (const e of state.onBoard) {
      const pos = e.body.position;
      GameRender.drawPiece(ctx, pos.x, pos.y);
      if (e.scoredAt && now - e.scoredAt < SCORE_PULSE_MS) {
        GameRender.drawScorePulse(ctx, pos.x, pos.y, (now - e.scoredAt) / SCORE_PULSE_MS);
      }
    }

    // Sem estilingue: o "aro" pontilhado sinaliza o disco arrastável, e a
    // seta de prévia (só durante o arrasto) mostra a direção/força que o
    // arremesso teria se soltasse agora — ambos lidos do gesto real (ver
    // GameInput.getPreviewVelocity em input.js).
    if (state.phase === 'aiming' && state.activeEntry) {
      const pos = state.activeEntry.body.position;
      const t = performance.now() / 1000;
      GameRender.drawAimHint(ctx, pos.x, pos.y, t);
      const preview = GameInput.getPreviewVelocity();
      if (preview) {
        GameRender.drawThrowIndicator(ctx, pos.x, pos.y, preview.dirX, preview.dirY, preview.speed / PHYSICS.maxLaunchSpeed);
      }
    }

    GameRender.drawLogo(ctx, BOARD.width - 44, BOARD.height - 40, 0.42, 'rgba(255,255,255,0.25)');

    ctx.restore();
  }

  function init() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    GamePhysics.init();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    GameInput.attach(canvas, {
      canDrag: () => state.phase === 'aiming' && !!state.activeEntry,
      getPiecePosition: () => state.activeEntry ? state.activeEntry.body.position : GameInput.restPosition,
      onDrag: (x, y) => onDrag(x, y),
      onRelease: (dx, dy, dist) => launch(dx, dy, dist),
      onCancel: () => cancelDrag()
    });

    state = freshState();
    startTurn();

    document.getElementById('btn-restart').addEventListener('click', resetGame);
    document.getElementById('btn-play-again').addEventListener('click', resetGame);
    document.getElementById('btn-next-turn').addEventListener('click', proceedToNextTurn);
    document.getElementById('btn-start-game').addEventListener('click', dismissRules);
    maybeShowRules();

    requestAnimationFrame(frame);
  }

  // Regras na abertura: só na primeira visita, ou até o jogador marcar
  // "não mostrar novamente" (persistido em localStorage, mesmo padrão de
  // chave "jogo:campo" do storage.js do Pinball/Escapa Buraco). O jogo já
  // está pronto por baixo (ver #rules-overlay em style.css bloqueando
  // clique na área toda) — dispensar o modal não precisa reiniciar nada.
  const RULES_HIDDEN_KEY = 'sjoelen:rulesHidden';
  function maybeShowRules() {
    if (window.localStorage.getItem(RULES_HIDDEN_KEY) === '1') return;
    document.getElementById('rules-overlay').classList.add('visible');
  }
  function dismissRules() {
    if (document.getElementById('rules-dont-show').checked) {
      window.localStorage.setItem(RULES_HIDDEN_KEY, '1');
    }
    document.getElementById('rules-overlay').classList.remove('visible');
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Game.init);
