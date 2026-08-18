// Máquina de estado do jogo: turnos, arremesso, pontuação, IA e loop
// principal — 2P Shuffleboard.
//
// Cruzamento dos dois irmãos: o FLUXO é o do Curling de Mesa (um disco ativo
// por vez, jogadores se revezando, pontuação por anel no fim), e a MECÂNICA
// de arremesso é a do Passe-Trappe (estilingue de duas âncoras, elástico
// como parede física, direção calculada na hora da soltura a partir da
// posição REAL do disco). A novidade é que existem duas pontas ativas: as
// âncoras trocam de lado a cada turno, e o lado de cima pode ser um segundo
// humano (hot-seat) ou a máquina.

const Game = (function () {
  const RULES_HIDDEN_KEY = 'shuffleboard2p:rulesHidden';
  const RING_SCORES_ASC = [...BOARD.targetRings].sort((a, b) => a.radius - b.radius);

  // Profundidade mínima do puxão pra contar como arremesso intencional.
  const MIN_PULL_DEPTH = PHYSICS.maxPullDistance * 0.12;
  // A direção vem majoritariamente do GESTO, com uma correção leve rumo à
  // perpendicular do elástico (a força de restituição real de uma tira
  // esticada entre duas âncoras puxa o disco PRA FRENTE, perpendicular à
  // linha — não em direção ao meio dela).
  const GESTURE_WEIGHT = 0.8;
  const FORWARD_WEIGHT = 0.2;

  const AI_WINDUP_MS = 620;
  const TURN_PAUSE_MS = 550;   // pausa pra ver o resultado antes do próximo disco
  const SETTLE_FRAMES = 8;     // quadros seguidos com tudo parado
  const TURN_TIMEOUT_MS = 8000; // rede de segurança: nunca travar o turno

  let canvas, ctx, dpr = 1;
  let phase = 'start';      // start | aiming | flight | settling | roundEnd
  let mode = 'hotseat';     // hotseat | solo
  let difficulty = 'medium';
  let state = null;

  // ---------------- Estado ----------------
  function freshState() {
    return {
      order: [PLAYERS.RED, PLAYERS.BLUE],
      turnIndex: 0,
      remaining: { [PLAYERS.RED]: BOARD.discsPerPlayer, [PLAYERS.BLUE]: BOARD.discsPerPlayer },
      discs: [],            // { body, player }
      active: null,         // disco da vez, estático até ser lançado
      dragging: false,
      dragStart: null,
      thrown: 0,
      lastThrown: null,
      clearingPassthrough: [],
      settleFrames: 0,
      flightStart: 0,
      nextTurnAt: 0,
      aiState: null,
      aiThinkAt: 0
    };
  }

  function currentPlayer() {
    return state.order[state.turnIndex];
  }

  function otherPlayer(player) {
    return player === PLAYERS.RED ? PLAYERS.BLUE : PLAYERS.RED;
  }

  function isAiTurn() {
    return mode === 'solo' && currentPlayer() === PLAYERS.BLUE;
  }

  // ---------------- Discos ----------------
  // O disco da vez nasce no meio da linha do elástico. Se um disco rebatido
  // estiver parado justo ali (acontece: o elástico é uma parede e devolve
  // discos pra essa faixa), procura a primeira vaga livre ao lado — senão o
  // disco novo nasceria sobreposto e sairia empurrado ao ser solto.
  function findFreeRestPosition(player) {
    const y = SIDES[player].anchorY;
    const step = BOARD.pieceRadius * 2 + 8;
    const offsets = [0];
    for (let i = 1; i <= 3; i++) offsets.push(-i * step, i * step);
    for (const dx of offsets) {
      const x = BOARD.width / 2 + dx;
      if (x < BOARD.pieceRadius || x > BOARD.width - BOARD.pieceRadius) continue;
      const blocked = state.discs.some(
        (d) => Math.hypot(d.body.position.x - x, d.body.position.y - y) < BOARD.pieceRadius * 2 + 2
      );
      if (!blocked) return { x, y };
    }
    return { x: BOARD.width / 2, y };
  }

  function spawnActiveDisc() {
    const player = currentPlayer();
    const pos = findFreeRestPosition(player);
    const body = GamePhysics.createPiece(pos.x, pos.y);
    // Estático enquanto se mira: não deriva, não é empurrado, e o jogador
    // arrasta com precisão total.
    Matter.Body.setStatic(body, true);
    // Atravessa o próprio elástico durante o puxão (e na saída do tiro, até
    // cruzar pra frente da âncora — ver processClearingPassthrough).
    GamePhysics.setElasticPassthrough(body, true);

    const entry = { body, player };
    state.discs.push(entry);
    state.active = entry;
    state.aiState = null;
    phase = 'aiming';
    GameInput.setSide(player);
    if (isAiTurn()) state.aiThinkAt = performance.now() + AiController.thinkDelay(difficulty);
    updateHud();
    updateHint();
  }

  // ---------------- Arremesso (jogador e máquina usam o MESMO caminho) ----------------
  // Vetor unitário "pra frente" de um lado: perpendicular ao elástico, rumo
  // ao campo adversário.
  function forwardVector(side) {
    return { x: 0, y: -side.backwardSign };
  }

  // Cálculo puro do vetor de tiro — a seta de prévia usa exatamente esta
  // conta, então nunca aponta pra um lugar diferente do tiro real. Retorna
  // null se ainda não dispararia (não cruzou a linha do elástico, ou o puxão
  // é raso demais pra ser intencional).
  //
  // A FORÇA sai da PROFUNDIDADE do puxão — o quanto o disco foi levado para
  // trás da linha do elástico — e não da distância até o meio dela. Essa
  // distinção não é preciosismo: o disco da vez nasce deslocado pro lado
  // sempre que o centro da linha está ocupado (ver findFreeRestPosition), e
  // com a conta antiga um disco nascido perto da lateral já começava a
  // "distância do meio" em mais de 130px — ou seja, um puxão de 5 pixels
  // saía com força máxima (bug real, pego em teste). Profundidade também é
  // o que estica um elástico de verdade preso nas duas pontas.
  function computeShot(restPos, side, x, y) {
    const depth = (y - side.anchorY) * side.backwardSign;
    if (depth < MIN_PULL_DEPTH) return null;

    const gx = restPos.x - x;
    const gy = restPos.y - y;
    const gDist = Math.hypot(gx, gy);
    if (gDist < 0.001) return null;

    const f = forwardVector(side);
    let dirX = (gx / gDist) * GESTURE_WEIGHT + f.x * FORWARD_WEIGHT;
    let dirY = (gy / gDist) * GESTURE_WEIGHT + f.y * FORWARD_WEIGHT;
    const dirLen = Math.hypot(dirX, dirY) || 1;

    return {
      dirX: dirX / dirLen,
      dirY: dirY / dirLen,
      ratio: Math.min(depth / PHYSICS.maxPullDistance, 1),
      depth
    };
  }

  // Inverso de computeShot: dado o tiro DESEJADO, qual gesto o produz. A IA
  // usa isso pra saber pra onde arrastar o disco — sem inverter a mistura
  // gesto/perpendicular, a correção de 20% desviaria todo tiro angulado da
  // máquina alguns graus rumo à reta, e ela erraria sempre pro mesmo lado.
  //
  // Resolve  w_g*g + w_f*f = λ*d  com |g| = 1  →  λ² - 2·w_f·a·λ + (w_f² - w_g²) = 0,
  // onde a = d·f. A raiz positiva dá o gesto exato.
  function gestureForDirection(dir, side) {
    const f = forwardVector(side);
    const a = dir.x * f.x + dir.y * f.y;
    const discriminant = FORWARD_WEIGHT * FORWARD_WEIGHT * a * a - FORWARD_WEIGHT * FORWARD_WEIGHT + GESTURE_WEIGHT * GESTURE_WEIGHT;
    const lambda = FORWARD_WEIGHT * a + Math.sqrt(Math.max(0, discriminant));
    const gx = (lambda * dir.x - FORWARD_WEIGHT * f.x) / GESTURE_WEIGHT;
    const gy = (lambda * dir.y - FORWARD_WEIGHT * f.y) / GESTURE_WEIGHT;
    const len = Math.hypot(gx, gy) || 1;
    return { x: gx / len, y: gy / len };
  }

  function cancelShot(entry, restPos) {
    Matter.Body.setPosition(entry.body, restPos);
    Matter.Body.setVelocity(entry.body, { x: 0, y: 0 });
  }

  // Dispara lendo a posição REAL do disco no instante da soltura (nunca um
  // vetor pré-calculado) — é o que garante que máquina e jogador obedecem à
  // mesma regra de "só sai se tiver de fato esticado o elástico".
  function releaseShot(entry, restPos, x, y) {
    const side = SIDES[entry.player];
    const shot = computeShot(restPos, side, x, y);
    if (!shot) {
      cancelShot(entry, restPos);
      return null;
    }
    const speed = shot.ratio * PHYSICS.maxLaunchSpeed;
    Matter.Body.setStatic(entry.body, false);
    Matter.Body.setVelocity(entry.body, { x: shot.dirX * speed, y: shot.dirY * speed });
    GameAudio.playLaunch(shot.ratio);

    state.clearingPassthrough.push(entry);
    state.lastThrown = entry;
    state.active = null;
    state.aiState = null;
    state.settleFrames = 0;
    state.flightStart = performance.now();
    phase = 'flight';
    updateHint();
    return shot;
  }

  // ---------------- Ponteiro ----------------
  // Devolve a posição atual do disco da vez (o input usa isso pra calcular o
  // deslocamento do agarre e mover o disco de forma relativa) ou null.
  function tryGrab(x, y) {
    if (phase !== 'aiming' || !state || !state.active || isAiTurn()) return null;
    const pos = state.active.body.position;
    if (Math.hypot(x - pos.x, y - pos.y) > BOARD.grabRadius) return null;
    state.dragging = true;
    state.dragStart = { x: pos.x, y: pos.y };
    return { x: pos.x, y: pos.y };
  }

  function onDrag(x, y) {
    if (!state || !state.dragging || !state.active) return;
    Matter.Body.setPosition(state.active.body, { x, y });
  }

  function onRelease(x, y) {
    if (!state || !state.dragging || !state.active) return;
    state.dragging = false;
    releaseShot(state.active, state.dragStart, x, y);
  }

  function onCancel() {
    if (!state || !state.dragging || !state.active) return;
    state.dragging = false;
    cancelShot(state.active, state.dragStart);
  }

  // ---------------- Máquina ----------------
  // Ela só decide direção e força; o arrasto até o ponto de puxão e o
  // disparo são os mesmos do jogador (releaseShot). Cópia da estrutura de
  // advanceAi do Passe-Trappe, incluindo a lição do fireAt ancorado em
  // "agora" — usar um horário agendado que já passou fazia a interpolação
  // nascer completa, o disco não saía do lugar e a máquina travava sem atirar.
  function advanceAi(now) {
    if (phase !== 'aiming' || !state.active || !isAiTurn()) return;
    const side = SIDES[currentPlayer()];

    if (!state.aiState) {
      if (now < state.aiThinkAt) return;
      const restPos = { x: state.active.body.position.x, y: state.active.body.position.y };
      // Mira a partir do DISCO dela, não do meio do elástico: o disco da vez
      // nasce deslocado pro lado sempre que o centro da linha está ocupado
      // (ver findFreeRestPosition), e mirar da posição errada erraria tanto a
      // direção quanto a distância.
      const shot = AiController.pickShot({
        difficulty,
        discs: state.discs.filter((d) => d !== state.active),
        me: currentPlayer(),
        opponent: otherPlayer(currentPlayer()),
        from: restPos,
        myRemaining: state.remaining[currentPlayer()]
      });
      const ratio = Math.min(shot.speed / PHYSICS.maxLaunchSpeed, 1);
      const depth = Math.max(MIN_PULL_DEPTH + 4, ratio * PHYSICS.maxPullDistance);
      // O ponto de puxão sai do gesto que PRODUZ o tiro desejado, e o
      // comprimento é escolhido pra profundidade bater com a força pedida
      // (um gesto angulado precisa ser mais longo pra afundar o mesmo tanto).
      const gesture = gestureForDirection({ x: shot.dirX, y: shot.dirY }, side);
      const f = forwardVector(side);
      const gDotF = Math.max(0.35, gesture.x * f.x + gesture.y * f.y);
      const pullLen = depth / gDotF;
      const pullPos = {
        x: Math.max(BOARD.pieceRadius, Math.min(BOARD.width - BOARD.pieceRadius,
          restPos.x - gesture.x * pullLen)),
        y: restPos.y - gesture.y * pullLen
      };
      state.aiState = { startAt: now, fireAt: now + AI_WINDUP_MS, restPos, pullPos };
    }

    const w = state.aiState;
    // Recuo com aceleração (easeInQuad): começa quase parado e ganha
    // velocidade, como um gesto de mão de verdade.
    const t = Math.min(1, Math.max(0, (now - w.startAt) / (w.fireAt - w.startAt)));
    const eased = t * t;
    Matter.Body.setPosition(state.active.body, {
      x: w.restPos.x + (w.pullPos.x - w.restPos.x) * eased,
      y: w.restPos.y + (w.pullPos.y - w.restPos.y) * eased
    });

    if (now >= w.fireAt) {
      const entry = state.active;
      const pos = entry.body.position;
      // Mesma função de disparo do jogador, lendo a posição REAL do disco no
      // instante de soltar — a máquina não tem atalho nenhum.
      releaseShot(entry, w.restPos, pos.x, pos.y);
    }
  }

  // ---------------- Turno ----------------
  // Discos recém-lançados continuam atravessando o próprio elástico até
  // cruzarem pra frente da âncora — senão o disco bateria na própria linha
  // ao sair, sem nunca chegar ao campo.
  function processClearingPassthrough() {
    if (state.clearingPassthrough.length === 0) return;
    state.clearingPassthrough = state.clearingPassthrough.filter((entry) => {
      const side = SIDES[entry.player];
      const cleared = side.backwardSign === 1
        ? entry.body.position.y < side.anchorY - 4
        : entry.body.position.y > side.anchorY + 4;
      if (cleared) GamePhysics.setElasticPassthrough(entry.body, false);
      return !cleared;
    });
  }

  function everythingSettled() {
    for (const d of state.discs) {
      if (d.body.isStatic) continue;
      if (!GamePhysics.isSettled(d.body)) return false;
    }
    return true;
  }

  function finishTurn(now) {
    for (const d of state.discs) {
      if (d.body.isStatic) continue;
      Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(d.body, 0);
      // Rede de segurança: disco que tenha ficado atrás de um elástico (só
      // por tunelamento) volta pro campo — aquela faixa não é área de jogo.
      for (const key of Object.keys(SIDES)) {
        const side = SIDES[key];
        const behind = side.backwardSign === 1
          ? d.body.position.y > side.anchorY
          : d.body.position.y < side.anchorY;
        if (!behind) continue;
        Matter.Body.setPosition(d.body, {
          x: d.body.position.x,
          y: side.anchorY - side.backwardSign * (BOARD.pieceRadius + 6)
        });
        GamePhysics.setElasticPassthrough(d.body, false);
      }
    }

    if (state.lastThrown && state.discs.includes(state.lastThrown)) {
      const score = scoreForDisc(state.lastThrown);
      if (score > 0) GameAudio.playScore(score);
    }

    phase = 'settling';
    state.nextTurnAt = now + TURN_PAUSE_MS;
    updateHud();
    updateHint();
  }

  function advanceTurn() {
    state.remaining[currentPlayer()] -= 1;
    state.thrown += 1;
    if (state.thrown >= BOARD.discsPerPlayer * 2) {
      endRound();
      return;
    }
    state.turnIndex = (state.turnIndex + 1) % state.order.length;
    GameAudio.playTurn();
    spawnActiveDisc();
  }

  // ---------------- Pontuação ----------------
  function scoreForDisc(entry) {
    const dist = Math.hypot(
      entry.body.position.x - BOARD.targetX,
      entry.body.position.y - BOARD.targetY
    );
    for (const ring of RING_SCORES_ASC) {
      if (dist <= ring.radius) return ring.score;
    }
    return 0;
  }

  function computeScores() {
    const totals = { [PLAYERS.RED]: 0, [PLAYERS.BLUE]: 0 };
    if (!state) return totals;
    for (const d of state.discs) {
      // O disco da vez ainda está no elástico: não conta até ser arremessado.
      if (d === state.active) continue;
      totals[d.player] += scoreForDisc(d);
    }
    return totals;
  }

  function endRound() {
    phase = 'roundEnd';
    const totals = computeScores();
    if (totals[PLAYERS.RED] === totals[PLAYERS.BLUE]) GameAudio.playTie();
    else GameAudio.playRoundEnd();
    updateHud();
    updateOverlay(totals);
  }

  // ---------------- HUD / textos ----------------
  function playerLabel(player) {
    if (mode === 'solo' && player === PLAYERS.BLUE) return 'MÁQUINA';
    return SIDES[player].label;
  }

  function updateHud() {
    const totals = computeScores();
    SevenSeg.render('score-red', totals[PLAYERS.RED], 3);
    SevenSeg.render('score-blue', totals[PLAYERS.BLUE], 3);
    const remaining = state ? state.remaining : { [PLAYERS.RED]: BOARD.discsPerPlayer, [PLAYERS.BLUE]: BOARD.discsPerPlayer };
    document.getElementById('remaining-red').textContent = remaining[PLAYERS.RED];
    document.getElementById('remaining-blue').textContent = remaining[PLAYERS.BLUE];
    document.getElementById('label-blue').textContent = playerLabel(PLAYERS.BLUE);

    const playing = state && phase !== 'start' && phase !== 'roundEnd';
    const turn = playing ? currentPlayer() : null;
    document.getElementById('lamp-red').classList.toggle('lit', turn === PLAYERS.RED);
    document.getElementById('lamp-blue').classList.toggle('lit', turn === PLAYERS.BLUE);
  }

  function updateHint() {
    const hint = document.getElementById('hint');
    if (!state || phase === 'start' || phase === 'roundEnd') {
      hint.textContent = 'Puxe o disco contra o elástico e solte — pare o mais perto que conseguir do centro';
      return;
    }
    if (phase === 'flight' || phase === 'settling') {
      hint.textContent = 'Disco em jogo…';
      return;
    }
    if (isAiTurn()) {
      hint.textContent = 'A máquina está mirando…';
      return;
    }
    hint.textContent = `Vez do ${playerLabel(currentPlayer())} — puxe o disco contra o elástico e solte`;
  }

  // ---------------- Overlay ----------------
  function updateOverlay(totals) {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const body = document.getElementById('overlay-body');
    const rules = document.getElementById('overlay-rules');
    const rulesCheckbox = document.getElementById('overlay-rules-checkbox');
    const modeRow = document.getElementById('mode-row');
    const diffRow = document.getElementById('difficulty-row');
    const ctaLabel = document.getElementById('btn-primary-label');

    if (phase !== 'start' && phase !== 'roundEnd') {
      overlay.classList.remove('visible');
      return;
    }
    overlay.classList.add('visible');

    if (phase === 'start') {
      title.textContent = '2P SHUFFLEBOARD';
      body.textContent = 'Cada jogador numa ponta da mesa — quem chegar mais perto do centro leva a rodada';
      const showRules = localStorage.getItem(RULES_HIDDEN_KEY) !== '1';
      rules.style.display = showRules ? '' : 'none';
      rulesCheckbox.style.display = showRules ? '' : 'none';
      modeRow.style.display = '';
      diffRow.style.display = mode === 'solo' ? '' : 'none';
      ctaLabel.textContent = 'Jogar';
      document.getElementById('btn-primary').classList.remove('cta-gameover');
      return;
    }

    const red = totals[PLAYERS.RED];
    const blue = totals[PLAYERS.BLUE];
    if (red > blue) title.textContent = `${playerLabel(PLAYERS.RED)} VENCE!`;
    else if (blue > red) title.textContent = `${playerLabel(PLAYERS.BLUE)} VENCE!`;
    else title.textContent = 'EMPATE!';
    body.textContent = `${playerLabel(PLAYERS.RED)} ${red}  ×  ${blue} ${playerLabel(PLAYERS.BLUE)}`;
    rules.style.display = 'none';
    rulesCheckbox.style.display = 'none';
    modeRow.style.display = '';
    diffRow.style.display = mode === 'solo' ? '' : 'none';
    ctaLabel.textContent = 'Jogar de novo';
    document.getElementById('btn-primary').classList.add('cta-gameover');
  }

  // ---------------- Fluxo ----------------
  function startRound() {
    GameAudio.ensureCtx();
    if (state) {
      for (const d of state.discs) GamePhysics.removePiece(d.body);
    }
    if (phase === 'start') {
      const dontShow = document.getElementById('rules-dont-show');
      if (dontShow && dontShow.checked) localStorage.setItem(RULES_HIDDEN_KEY, '1');
    }
    state = freshState();
    phase = 'aiming';
    document.getElementById('overlay').classList.remove('visible');
    spawnActiveDisc();
  }

  function hardReset() {
    GameAudio.ensureCtx();
    if (state) {
      for (const d of state.discs) GamePhysics.removePiece(d.body);
    }
    state = null;
    phase = 'start';
    updateHud();
    updateHint();
    updateOverlay();
  }

  function setMode(next) {
    mode = next;
    for (const btn of document.querySelectorAll('.mode-btn')) {
      btn.classList.toggle('selected', btn.dataset.mode === mode);
    }
    document.getElementById('difficulty-row').style.display = mode === 'solo' ? '' : 'none';
    updateHud();
  }

  function setDifficulty(next) {
    difficulty = next;
    for (const btn of document.querySelectorAll('.diff-btn')) {
      btn.classList.toggle('selected', btn.dataset.difficulty === difficulty);
    }
  }

  // ---------------- Loop ----------------
  function tick(now) {
    if (state) {
      if (phase === 'aiming') {
        advanceAi(now);
      } else if (phase === 'flight') {
        GamePhysics.update(1000 / 60);
        processClearingPassthrough();

        for (let i = state.discs.length - 1; i >= 0; i--) {
          const d = state.discs[i];
          if (d.body.isStatic) continue;
          if (GamePhysics.isOutOfBounds(d.body)) {
            // Com trilhos nos quatro lados isso só acontece por tunelamento;
            // o disco é perdido e não pontua.
            GamePhysics.removePiece(d.body);
            state.discs.splice(i, 1);
          }
        }

        if (everythingSettled()) {
          state.settleFrames += 1;
          if (state.settleFrames > SETTLE_FRAMES) finishTurn(now);
        } else {
          state.settleFrames = 0;
          if (now - state.flightStart > TURN_TIMEOUT_MS) finishTurn(now);
        }
        updateHud();
      } else if (phase === 'settling') {
        if (now >= state.nextTurnAt) advanceTurn();
      }
    }

    render(now);
    requestAnimationFrame(tick);
  }

  // ---------------- Desenho ----------------
  // Ponto de puxão do elástico: segue a posição REAL do disco, mas só depois
  // que ele de fato cruzou pra trás da linha — antes disso o elástico fica
  // reto, sem sair "buscando" o disco.
  function slingPullPoint(side, entry) {
    if (!entry) return side.anchorMid;
    const pos = entry.body.position;
    const behind = side.backwardSign === 1 ? pos.y > side.anchorY : pos.y < side.anchorY;
    return behind ? { x: pos.x, y: pos.y } : side.anchorMid;
  }

  function render(now) {
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    ctx.clearRect(0, 0, totalW, totalH);
    GameRender.drawWoodFrame(ctx, totalW, totalH);

    ctx.save();
    ctx.translate(BOARD.railThickness, BOARD.railThickness);

    GameRender.drawRails(ctx);
    GameRender.drawPlaySurface(ctx);
    GameRender.drawTarget(ctx);
    GameRender.drawLogo(ctx, BOARD.width - 46, BOARD.height - 46, 0.4, 'rgba(107,66,38,0.28)');

    const active = state && state.active;
    const turn = state && phase !== 'start' && phase !== 'roundEnd' ? currentPlayer() : null;

    // Tremor de tensão: praticamente nulo em repouso, cresce com o quanto o
    // elástico está esticado (curva quadrática). É só visual — o tiro usa a
    // posição real do corpo, não a desenhada.
    let jitterX = 0;
    let jitterY = 0;
    if (active && (state.dragging || state.aiState)) {
      const side = SIDES[active.player];
      const pos = active.body.position;
      // Tensão = a mesma profundidade que define a força do tiro, pra que o
      // tremor seja um sinal honesto de quanta força está carregada.
      const depth = Math.max(0, (pos.y - side.anchorY) * side.backwardSign);
      const tension = Math.min(1, depth / PHYSICS.maxPullDistance);
      const t = now / 1000;
      const amp = tension * tension * 6;
      jitterX = (Math.sin(t * 5 * Math.PI * 2) * 0.6 + Math.sin(t * 8.3 * Math.PI * 2 + 2.1) * 0.4) * amp;
      jitterY = (Math.sin(t * 4.4 * Math.PI * 2 + 0.7) * 0.6 + Math.sin(t * 7.1 * Math.PI * 2 + 4) * 0.4) * amp;
    }

    // Os dois elásticos ficam sempre visíveis, esticados de ponta a ponta —
    // o do jogador da vez na cor dele, o outro em corda escura.
    for (const key of Object.keys(SIDES)) {
      const side = SIDES[key];
      const mine = active && active.player === key ? active : null;
      const pull = slingPullPoint(side, mine);
      const color = key === turn
        ? (key === PLAYERS.RED ? COLORS.red : COLORS.blue)
        : COLORS.elasticCord;
      GameRender.drawSling(ctx, side.anchorL, side.anchorR, pull.x + (mine ? jitterX : 0), pull.y + (mine ? jitterY : 0), color);
    }

    if (state) {
      for (const d of state.discs) {
        const pos = d.body.position;
        const isActive = d === state.active;
        GameRender.drawPiece(
          ctx,
          pos.x + (isActive ? jitterX : 0),
          pos.y + (isActive ? jitterY : 0),
          d.player,
          isActive && state.dragging
        );
      }

      if (active && phase === 'aiming') {
        const pos = active.body.position;
        GameRender.drawAimHint(ctx, pos.x, pos.y, now / 1000);
        if (state.dragging) {
          const side = SIDES[active.player];
          const shot = computeShot(state.dragStart, side, pos.x, pos.y);
          if (shot) GameRender.drawThrowIndicator(ctx, pos.x, pos.y, shot.dirX, shot.dirY, shot.ratio);
        }
      }

      if (turn && phase === 'aiming') {
        const text = isAiTurn() ? 'MÁQUINA MIRANDO' : `VEZ DO ${playerLabel(turn)}`;
        GameRender.drawTurnBanner(ctx, text, turn, turn === PLAYERS.RED ? COLORS.red : COLORS.blue);
      }
    }

    ctx.restore();
  }

  // ---------------- Setup ----------------
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
    const displayWidth = Math.min(availWidth, availHeight * ratio);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayWidth / ratio}px`;
  }

  function init() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    GamePhysics.init();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    GameInput.attach(canvas, {
      tryGrab,
      onDrag,
      onRelease,
      onCancel
    });

    for (const btn of document.querySelectorAll('.mode-btn')) {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    }
    for (const btn of document.querySelectorAll('.diff-btn')) {
      btn.addEventListener('click', () => setDifficulty(btn.dataset.difficulty));
    }
    document.getElementById('btn-primary').addEventListener('click', startRound);
    document.getElementById('btn-restart').addEventListener('click', hardReset);

    setMode(mode);
    setDifficulty(difficulty);
    updateHud();
    updateHint();
    updateOverlay();
    requestAnimationFrame(tick);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Game.init);
