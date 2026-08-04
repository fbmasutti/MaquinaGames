// Máquina de estado do jogo: níveis, fluxo contínuo de discos, IA e loop
// principal — Passe-Trappe.
//
// Sem posse fixa de disco (igual à versão analógica, onde os discos não
// têm cor por jogador): o que importa é só de que ZONA do tabuleiro
// (ZONES.PLAYER embaixo, ZONES.AI em cima) um disco está agora. O jogador
// pode pegar QUALQUER disco parado do seu lado, a máquina atira QUALQUER
// disco parado do dela — não existe fila nem "disco ativo único".
// Vencer = esvaziar o próprio lado (todos os discos do outro lado).

const Game = (function () {
  const RULES_HIDDEN_KEY = 'passetrappe:rulesHidden';
  // Aumentado de 380ms — mesmo com o alvo da puxada corrigido pra ficar
  // sempre atrás da âncora, 380ms pra ir da fila até lá E puxar mais um
  // pouco ainda lia como "pisca" instantâneo (queixa real: "parece estar
  // rápida demais"). Fica ainda abaixo do menor intervalo entre tiros de
  // qualquer nível (650ms no Nível 6), então nunca atropela o próprio
  // agendamento.
  const AI_WINDUP_MS = 600;
  const LEVEL_CLEAR_DELAY_MS = 1100;
  const COUNTDOWN_MS = 3000;
  // Puxão mínimo pra contar como intencional — medido a partir da própria
  // ÂNCORA fixa (ver resolveRelease), não do ponto de agarre: o disco
  // precisa de fato estar em contato com o elástico (cruzado pra trás da
  // linha da âncora) pra disparar, e a força do tiro é proporcional a
  // quanto além dela foi esticado — igual a um estilingue de verdade.
  const MIN_PULL = PHYSICS.maxPullDistance * 0.12;

  let canvas, ctx, dpr = 1;
  let lastTime = 0;

  let phase = 'start'; // start | countdown | playing | levelClear | levelFail | gameEnd
  let levelIdx = 0;
  let state = null; // criado por startLevel(); só existe durante countdown/playing/levelClear/levelFail

  const aiAnchorL = { x: BOARD.anchorInset, y: BOARD.aiAnchorY };
  const aiAnchorR = { x: BOARD.width - BOARD.anchorInset, y: BOARD.aiAnchorY };
  const aiAnchorMid = { x: BOARD.width / 2, y: BOARD.aiAnchorY };

  // ---------------- Zona ----------------
  function zoneOf(y) {
    if (y < BOARD.dividerTopY) return ZONES.AI;
    if (y > BOARD.dividerBottomY) return ZONES.PLAYER;
    return 'divider';
  }

  // ---------------- Discos ----------------
  // Fila de discos "em espera" alinhada à ESQUERDA, numa única coluna bem
  // compacta (não mais espalhada em 2 colunas pela altura toda da zona) —
  // a pedido: mais parecido com uma pilha de fichas encostada na lateral,
  // não um grid solto. Centralizada verticalmente na zona.
  const QUEUE_MARGIN_X = BOARD.pieceRadius + 12;
  const QUEUE_ROW_GAP = BOARD.pieceRadius * 2 + 4;

  function layoutRestPositions(zone, n) {
    const centerY = zone === ZONES.PLAYER
      ? (BOARD.dividerBottomY + BOARD.playerAnchorY) / 2
      : (BOARD.aiAnchorY + BOARD.dividerTopY) / 2;
    const startY = centerY - ((n - 1) * QUEUE_ROW_GAP) / 2;
    const positions = [];
    for (let i = 0; i < n; i++) {
      positions.push({ x: QUEUE_MARGIN_X, y: startY + i * QUEUE_ROW_GAP });
    }
    return positions;
  }

  function createDiscs(zone, n) {
    return layoutRestPositions(zone, n).map((pos) => ({
      body: GamePhysics.createPiece(pos.x, pos.y),
      lastZone: zone
    }));
  }

  // Ponto de retorno de um disco "rebelde" (saiu dos limites) — perto da
  // fila à esquerda, não no meio do corredor de tiro.
  function rebelReturnPosition(zone) {
    const y = zone === ZONES.PLAYER
      ? (BOARD.dividerBottomY + BOARD.playerAnchorY) / 2
      : (BOARD.aiAnchorY + BOARD.dividerTopY) / 2;
    return { x: QUEUE_MARGIN_X, y };
  }

  // ---------------- Estilingue compartilhado (jogador + máquina) ----------------
  // A MESMA mecânica serve pros dois lados: agarra (fica estático,
  // atravessa o próprio elástico livremente), se move livremente enquanto
  // segurado, e ao soltar o vetor de tiro é calculado NA HORA a partir da
  // ÂNCORA fixa (o elástico de verdade) vs onde está a posição REAL do
  // disco naquele instante — nunca de um valor pré-calculado independente,
  // nem do ponto onde foi agarrado. Isso garante duas coisas ao mesmo
  // tempo: (1) só dispara se o disco de fato TOCA o elástico (cruzou pra
  // trás da linha da âncora — soltar na frente dela cancela, sem exceção),
  // e (2) a força sai sempre proporcional a quanto além da âncora ele foi
  // esticado, igual a um estilingue real. A IA usa a função idêntica — só
  // decide PRA ONDE arrastar (ver advanceAi), nunca aplica velocidade
  // própria desconectada da posição.
  function grabDisc(discEntry) {
    Matter.Body.setStatic(discEntry.body, true);
    GamePhysics.setElasticPassthrough(discEntry.body, true);
    return { x: discEntry.body.position.x, y: discEntry.body.position.y };
  }

  function cancelGrab(discEntry, cancelPos) {
    Matter.Body.setPosition(discEntry.body, cancelPos);
    Matter.Body.setVelocity(discEntry.body, { x: 0, y: 0 });
    Matter.Body.setStatic(discEntry.body, false);
    GamePhysics.setElasticPassthrough(discEntry.body, false);
  }

  // Só a POTÊNCIA e a elegibilidade (precisa tocar o elástico) vêm da
  // âncora fixa — a DIREÇÃO vem majoritariamente do GESTO (de onde foi
  // agarrado até onde foi solto, invertido), com uma correção leve da
  // geometria real das duas pontas por cima. Antes a direção usava só a
  // âncora fixa (2 "molas" somadas), o que é fisicamente válido pra um
  // estilingue elástico de verdade, mas na prática deixava a mira quase
  // só função da posição X do disco: puxar reto pra trás um disco perto
  // da lateral esquerda ainda saía inclinado forte pro centro (rumo à
  // âncora), então pra acertar um vão na BORDA o jeito era posicionar o
  // disco perto do CENTRO antes de puxar — controle nada intuitivo (bug
  // real reportado). Com o gesto dominando, apontar o mouse na direção
  // inversa ao alvo aponta o disco pra lá, não importa de onde ele partiu.
  //
  // cancelPos: pra onde volta se cancelar (ponto de agarre). gestureStart:
  // referência do GESTO — pro jogador é o mesmo ponto de agarre; pra
  // máquina é a própria âncora (sem "gesto" real, então o termo do gesto
  // vira igual ao da âncora e o blend não muda nada — a mira da IA
  // continua exatamente geométrica, como já era). anchorMid: a âncora
  // fixa do PRÓPRIO lado. backwardSign: +1 quando "atrás da âncora" é y
  // CRESCENTE (jogador), -1 quando é y DECRESCENTE (máquina). Retorna
  // null se cancelou (não tocou o elástico / puxão insuficiente).
  const GESTURE_WEIGHT = 0.8;
  const ANCHOR_WEIGHT = 0.2;

  // Cálculo puro (sem efeito colateral) do vetor de tiro — usado tanto
  // pelo disparo de verdade (resolveRelease) quanto pela prévia visual
  // durante o arrasto (ver drawThrowIndicator em render()). Extrair isso
  // numa função só garante que a seta de prévia NUNCA desalinha do tiro
  // real — é literalmente a mesma conta. Retorna null se ainda não
  // dispararia (não tocou o elástico / puxão insuficiente).
  function computeShot(gestureStart, anchorMid, x, y, backwardSign) {
    const ax = anchorMid.x - x;
    const ay = anchorMid.y - y;
    const dist = Math.hypot(ax, ay);
    if (ay * backwardSign >= 0 || dist < MIN_PULL) return null;

    const gx = gestureStart.x - x;
    const gy = gestureStart.y - y;
    const gDist = Math.hypot(gx, gy) || 1;
    const aUnitX = ax / dist;
    const aUnitY = ay / dist;
    const gUnitX = gx / gDist;
    const gUnitY = gy / gDist;
    let dirX = gUnitX * GESTURE_WEIGHT + aUnitX * ANCHOR_WEIGHT;
    let dirY = gUnitY * GESTURE_WEIGHT + aUnitY * ANCHOR_WEIGHT;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    dirX /= dirLen;
    dirY /= dirLen;

    const ratio = Math.min(dist / PHYSICS.maxPullDistance, 1);
    return { dirX, dirY, ratio };
  }

  function resolveRelease(discEntry, cancelPos, gestureStart, anchorMid, x, y, backwardSign) {
    const shot = computeShot(gestureStart, anchorMid, x, y, backwardSign);
    if (!shot) {
      cancelGrab(discEntry, cancelPos);
      return null;
    }
    const speed = shot.ratio * PHYSICS.maxLaunchSpeed;
    Matter.Body.setStatic(discEntry.body, false);
    Matter.Body.setVelocity(discEntry.body, { x: shot.dirX * speed, y: shot.dirY * speed });
    GameAudio.playLaunch(shot.ratio);
    return { ratio: shot.ratio };
  }

  // Acha o disco mais próximo do toque, ainda do lado do JOGADOR (não
  // importa quem lançou originalmente, nem se está parado ou em
  // movimento — é um jogo de velocidade) — e o marca como o disco sendo
  // arrastado.
  function tryGrab(x, y) {
    if (phase !== 'playing' || !state || state.draggingDisc) return false;
    let best = null;
    let bestDist = BOARD.grabRadius;
    for (const d of state.discs) {
      if (d === (state.aiWindup && state.aiWindup.disc)) continue;
      // Pode pegar mesmo em movimento — só precisa estar do lado do
      // jogador agora (jogo de velocidade, não dá pra esperar tudo parar).
      if (zoneOf(d.body.position.y) !== ZONES.PLAYER) continue;
      const dist = Math.hypot(x - d.body.position.x, y - d.body.position.y);
      if (dist <= bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    if (!best) return false;
    state.dragStartPos = grabDisc(best);
    state.draggingDisc = best;
    return true;
  }

  function cancelDragging() {
    if (!state || !state.draggingDisc) return;
    cancelGrab(state.draggingDisc, state.dragStartPos);
    state.draggingDisc = null;
  }

  // NÃO desliga a passagem pelo próprio elástico aqui — o disco pode
  // estar atrás da própria linha e precisa atravessá-la pra sair rumo ao
  // campo central; só volta a colidir com ela depois de cruzar pra frente
  // da própria âncora (ver clearingPassthrough/processClearingPassthrough).
  function handlePointerRelease(x, y) {
    if (!state || !state.draggingDisc) return;
    const disc = state.draggingDisc;
    const start = state.dragStartPos;
    state.draggingDisc = null;
    const result = resolveRelease(disc, start, start, GameInput.anchorMid, x, y, 1);
    if (result) state.clearingPassthrough.push({ body: disc.body, side: ZONES.PLAYER });
  }

  // ---------------- IA ----------------
  function pickAiDisc() {
    const candidates = state.discs.filter(
      (d) => GamePhysics.isSettled(d.body) && zoneOf(d.body.position.y) === ZONES.AI
    );
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function scheduleAiFire() {
    state.aiNextFireAt = AiController.scheduleNextShot(LEVELS[levelIdx]);
    state.aiWindup = null;
  }

  // A máquina usa EXATAMENTE a mesma mecânica de estilingue do jogador
  // (grabDisc/resolveRelease) — a única parte própria da IA é decidir
  // QUAL disco pegar e PRA ONDE arrastá-lo (pullPos), nunca a física do
  // disparo em si. O disparo sempre lê a posição REAL do disco no
  // instante de soltar (resolveRelease, relativo à âncora fixa), igual
  // ao jogador: só sai voando se de fato tiver cruzado pra trás da linha
  // do elástico.
  function advanceAi(now) {
    if (!state.aiWindup) {
      if (now < state.aiNextFireAt - AI_WINDUP_MS) return;
      const disc = pickAiDisc();
      if (!disc) return; // nada disponível agora — tenta de novo no próximo frame
      const level = LEVELS[levelIdx];
      const restPos = { x: disc.body.position.x, y: disc.body.position.y };
      const shot = AiController.pickShot(level, state.gaps, restPos.x, restPos.y);
      // O alvo da puxada é relativo à própria ÂNCORA (não mais à posição
      // de repouso do disco, que pode estar em qualquer canto da fila,
      // longe do elástico) — garante que o disco sempre viaja até
      // cruzar pra trás da linha antes do disparo, satisfazendo o mesmo
      // requisito de "precisa tocar o elástico" que resolveRelease exige
      // agora pros dois lados. Visualmente, a máquina literalmente
      // arrasta o disco da fila até o elástico antes de puxar, em vez
      // de "lançar de qualquer ponto" (bug real reportado).
      const ratio = Math.min(shot.speed / PHYSICS.maxLaunchSpeed, 1);
      const pullDist = ratio * PHYSICS.maxPullDistance;
      const minPullY = BOARD.railThickness + BOARD.pieceRadius;
      const minX = BOARD.pieceRadius;
      const maxX = BOARD.width - BOARD.pieceRadius;
      const pullPos = {
        x: Math.max(minX, Math.min(maxX, aiAnchorMid.x - shot.dirX * pullDist)),
        y: Math.max(minPullY, aiAnchorMid.y - shot.dirY * pullDist)
      };
      const dragStartPos = grabDisc(disc);
      // fireAt é sempre "agora + duração da puxada", NUNCA o
      // state.aiNextFireAt bruto — se o quadro que inicia a puxada
      // atrasar (frame lento, aba em segundo plano etc.) e
      // aiNextFireAt já tiver ficado no passado, usar o valor bruto
      // fazia fireAt cair ANTES de startAt: a interpolação nascia com
      // t=0/negativo, o disco nunca saía do lugar e o disparo cancelava
      // na hora (distância zero < MIN_PULL) — a máquina ficava travada,
      // sem nunca atirar. Ancorar em "now" garante a puxada inteira
      // sempre, não importa o quão atrasado o quadro esteja.
      state.aiWindup = { disc, startAt: now, fireAt: now + AI_WINDUP_MS, restPos: dragStartPos, pullPos };
    }

    const w = state.aiWindup;
    if (w) {
      // Recuo com aceleração (easeInQuad): começa quase parado e ganha
      // velocidade puxando pra trás, como um gesto de mão de verdade.
      const t = Math.min(1, Math.max(0, (now - w.startAt) / (w.fireAt - w.startAt)));
      const eased = t * t;
      Matter.Body.setPosition(w.disc.body, {
        x: w.restPos.x + (w.pullPos.x - w.restPos.x) * eased,
        y: w.restPos.y + (w.pullPos.y - w.restPos.y) * eased
      });
    }

    if (state.aiWindup && now >= state.aiWindup.fireAt) {
      const w2 = state.aiWindup;
      state.aiWindup = null;
      const result = resolveRelease(w2.disc, w2.restPos, aiAnchorMid, aiAnchorMid, w2.disc.body.position.x, w2.disc.body.position.y, -1);
      if (result) state.clearingPassthrough.push({ body: w2.disc.body, side: ZONES.AI });
      scheduleAiFire();
    }
  }

  // ---------------- Fluxo de nível ----------------
  function startLevel(idx) {
    if (state) {
      for (const d of state.discs) GamePhysics.removePiece(d.body);
    }

    const level = LEVELS[idx];
    const gaps = BOARD.computeGaps(level.gapCount, level.gapWidth);
    GamePhysics.rebuildDivider(gaps);

    state = {
      gaps,
      discsPerSide: level.discsPerSide,
      dividerSegments: BOARD.computeDividerSegments(gaps),
      discs: [...createDiscs(ZONES.PLAYER, level.discsPerSide), ...createDiscs(ZONES.AI, level.discsPerSide)],
      draggingDisc: null,
      dragStartPos: null,
      aiWindup: null,
      aiNextFireAt: 0,
      // Discos recém-lançados pelo jogador que ainda estão atrás da
      // própria linha de elástico (ver launchDraggingDisc) — continuam
      // atravessando-a livremente até cruzarem pra frente dela.
      clearingPassthrough: [],
      countdownEndAt: performance.now() + COUNTDOWN_MS,
      countdownTickShown: null
    };
    // Sem scheduleAiFire() ainda — só quando a contagem acabar (ver
    // tick()), senão a máquina podia "ganhar tempo" mirando durante a
    // contagem regressiva.
    phase = 'countdown';
    updateHud();
    updateOverlay();
  }

  function levelClear() {
    phase = 'levelClear';
    GameAudio.playLevelClear();
    updateOverlay();
    setTimeout(() => {
      if (phase !== 'levelClear') return;
      const next = levelIdx + 1;
      if (next >= TOTAL_LEVELS) {
        phase = 'gameEnd';
        GameAudio.playGameEnd();
        updateOverlay();
      } else {
        levelIdx = next;
        startLevel(levelIdx);
      }
    }, LEVEL_CLEAR_DELAY_MS);
  }

  function levelFail() {
    phase = 'levelFail';
    GameAudio.playLevelFail();
    updateOverlay();
  }

  function handlePrimaryAction() {
    GameAudio.ensureCtx();
    if (phase === 'start') {
      const dontShow = document.getElementById('rules-dont-show');
      if (dontShow && dontShow.checked) localStorage.setItem(RULES_HIDDEN_KEY, '1');
      levelIdx = 0;
      startLevel(levelIdx);
    } else if (phase === 'levelFail') {
      startLevel(levelIdx);
    } else if (phase === 'gameEnd') {
      levelIdx = 0;
      startLevel(levelIdx);
    }
  }

  function hardReset() {
    GameAudio.ensureCtx();
    if (state) {
      for (const d of state.discs) GamePhysics.removePiece(d.body);
    }
    state = null;
    phase = 'start';
    levelIdx = 0;
    updateHud();
    updateOverlay();
  }

  // ---------------- HUD / overlay ----------------
  // Contagem AO VIVO de discos assentados de cada lado (não é "quantos
  // cruzaram", é literalmente "quantos estão lá agora" — sem posse fixa,
  // um disco pode ir e voltar livremente).
  function sideCounts() {
    if (!state) {
      const n = LEVELS[levelIdx].discsPerSide;
      return { player: n, ai: n, allSettled: true };
    }
    let player = 0;
    let ai = 0;
    let settledTotal = 0;
    for (const d of state.discs) {
      if (!GamePhysics.isSettled(d.body)) continue;
      const zone = zoneOf(d.body.position.y);
      if (zone === ZONES.PLAYER) { player += 1; settledTotal += 1; }
      else if (zone === ZONES.AI) { ai += 1; settledTotal += 1; }
    }
    return { player, ai, allSettled: settledTotal === state.discs.length };
  }

  function updateHud() {
    SevenSeg.render('hud-level', levelIdx + 1, 1);
    const counts = sideCounts();
    // 2 dígitos: sem posse fixa, um lado pode acumular discos do OUTRO
    // lado também (até 2x discsPerSide) — 1 dígito só truncava (ex.: 10
    // virava "0" na tela).
    SevenSeg.render('hud-player', counts.player, 2);
    SevenSeg.render('hud-ai', counts.ai, 2);
  }

  function updateOverlay() {
    const overlay = document.getElementById('overlay');
    const title = document.getElementById('overlay-title');
    const body = document.getElementById('overlay-body');
    const cta = document.getElementById('btn-primary');
    const ctaLabel = document.getElementById('btn-primary-label');
    const rulesList = document.getElementById('overlay-rules');
    const rulesCheckbox = document.getElementById('overlay-rules-checkbox');

    if (phase === 'playing' || phase === 'countdown') {
      overlay.classList.remove('visible');
      return;
    }
    overlay.classList.add('visible');
    cta.classList.toggle('cta-gameover', phase === 'levelFail' || phase === 'gameEnd');

    if (phase === 'start') {
      title.textContent = 'PASSE-TRAPPE';
      body.textContent = 'Esvazie o seu lado do tabuleiro antes que a máquina esvazie o dela';
      ctaLabel.textContent = 'Iniciar';
      cta.style.display = '';
      const showRules = localStorage.getItem(RULES_HIDDEN_KEY) !== '1';
      rulesList.style.display = showRules ? '' : 'none';
      rulesCheckbox.style.display = showRules ? '' : 'none';
    } else if (phase === 'levelClear') {
      const isLast = levelIdx + 1 >= TOTAL_LEVELS;
      title.textContent = `NÍVEL ${levelIdx + 1} LIMPO!`;
      body.textContent = isLast ? 'Preparando o resultado final…' : 'Preparando o próximo nível…';
      cta.style.display = 'none';
      rulesList.style.display = 'none';
      rulesCheckbox.style.display = 'none';
    } else if (phase === 'levelFail') {
      title.textContent = 'A MÁQUINA FOI MAIS RÁPIDA';
      body.textContent = `Nível ${levelIdx + 1} — tente de novo`;
      ctaLabel.textContent = 'Tentar de novo';
      cta.style.display = '';
      rulesList.style.display = 'none';
      rulesCheckbox.style.display = 'none';
    } else if (phase === 'gameEnd') {
      title.textContent = 'VOCÊ DOMINOU O PASSE-TRAPPE!';
      body.textContent = `Todos os ${TOTAL_LEVELS} níveis concluídos`;
      ctaLabel.textContent = 'Jogar novamente';
      cta.style.display = '';
      rulesList.style.display = 'none';
      rulesCheckbox.style.display = 'none';
    }
  }

  // Discos recém-lançados pelo jogador ainda atrás da própria linha de
  // elástico continuam atravessando-a livremente até cruzarem pra frente
  // — só então voltam a colidir com ela normalmente (senão o disco bate
  // no próprio elástico assim que sai, sem nunca chegar ao campo central).
  function processClearingPassthrough() {
    if (state.clearingPassthrough.length === 0) return;
    state.clearingPassthrough = state.clearingPassthrough.filter((entry) => {
      const cleared = entry.side === ZONES.PLAYER
        ? entry.body.position.y < BOARD.playerAnchorY - 4
        : entry.body.position.y > BOARD.aiAnchorY + 4;
      if (cleared) GamePhysics.setElasticPassthrough(entry.body, false);
      return !cleared;
    });
  }

  // ---------------- Loop ----------------
  function tick(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (phase === 'countdown') {
      const remainingMs = state.countdownEndAt - now;
      const shown = Math.max(0, Math.ceil(remainingMs / 1000));
      if (shown !== state.countdownTickShown) {
        state.countdownTickShown = shown;
        if (shown > 0) GameAudio.playCountdownTick(false);
      }
      if (remainingMs <= 0) {
        phase = 'playing';
        GameAudio.playCountdownTick(true);
        scheduleAiFire();
        updateOverlay();
      }
    } else if (phase === 'playing') {
      advanceAi(now);
      GamePhysics.update(1000 / 60);
      processClearingPassthrough();

      for (const d of state.discs) {
        if (d === state.draggingDisc || (state.aiWindup && d === state.aiWindup.disc)) continue;
        if (GamePhysics.isOutOfBounds(d.body)) {
          // "Disco rebelde": volta pro campo do lado em que estava antes
          // de sair (ver regras originais) — reposiciona em vez de
          // recriar o corpo.
          const zone = zoneOf(d.body.position.y) === ZONES.AI ? ZONES.AI : ZONES.PLAYER;
          const pos = rebelReturnPosition(zone);
          Matter.Body.setPosition(d.body, pos);
          Matter.Body.setVelocity(d.body, { x: 0, y: 0 });
          continue;
        }
        if (GamePhysics.isSettled(d.body)) {
          const zone = zoneOf(d.body.position.y);
          if (zone !== 'divider' && zone !== d.lastZone) {
            d.lastZone = zone;
            GameAudio.playPass();
            updateHud();
          }
        }
      }

      // Só decide fim de nível quando TUDO estiver assentado — evita
      // disparar cedo demais com um disco ainda no ar rumo ao lado vazio.
      const counts = sideCounts();
      if (counts.allSettled) {
        if (counts.player === 0) levelClear();
        else if (counts.ai === 0) levelFail();
      }
      updateHud();
    }

    render(now);
    requestAnimationFrame(tick);
  }

  // Ponto de "puxada" do elástico pra desenho — segue a posição REAL do
  // disco (x e y), igual ao elástico de verdade sendo puxado de um lado,
  // mas só liga a animação depois que o disco de fato TOCA o elástico
  // (cruza a linha da âncora); antes disso fica parado/reto, não sai
  // "buscando" o disco onde quer que ele esteja na fila.
  function slingPullPoint(anchorMid, disc, isPlayer) {
    if (!disc) return anchorMid;
    const pos = disc.body.position;
    const behind = isPlayer ? pos.y > anchorMid.y : pos.y < anchorMid.y;
    return behind ? { x: pos.x, y: pos.y } : anchorMid;
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

    // O elástico fica SEMPRE visível, esticado de ponta a ponta entre os
    // dois trilhos (fiel ao jogo real). Além do visual, ele também é uma
    // parede física de verdade (ver physics.js/buildElasticWalls) — discos
    // batem e ricocheteiam nela.
    const playerPull = slingPullPoint(GameInput.anchorMid, state && state.draggingDisc, true);
    GameRender.drawSling(ctx, GameInput.anchorL, GameInput.anchorR, playerPull.x, playerPull.y, COLORS.elasticCord);

    const aiPull = slingPullPoint(aiAnchorMid, state && state.aiWindup && state.aiWindup.disc, false);
    GameRender.drawSling(ctx, aiAnchorL, aiAnchorR, aiPull.x, aiPull.y, COLORS.elasticCord);

    if (state) {
      for (const d of state.discs) {
        const pos = d.body.position;
        GameRender.drawPiece(ctx, pos.x, pos.y, d === state.draggingDisc);
      }
      if (state.aiWindup) {
        const p = state.aiWindup.disc.body.position;
        GameRender.drawAimHint(ctx, p.x, p.y, now / 1000);
      }
      if (state.draggingDisc) {
        const p = state.draggingDisc.body.position;
        const shot = computeShot(state.dragStartPos, GameInput.anchorMid, p.x, p.y, 1);
        if (shot) GameRender.drawThrowIndicator(ctx, p.x, p.y, shot.dirX, shot.dirY, shot.ratio);
      }
      GameRender.drawDivider(ctx, state.dividerSegments, state.gaps);

      if (phase === 'countdown') {
        const remainingMs = Math.max(1, state.countdownEndAt - now);
        const value = Math.ceil(remainingMs / 1000);
        const progress = 1 - (remainingMs % 1000) / 1000;
        GameRender.drawCountdown(ctx, BOARD.width, BOARD.height, String(value), progress);
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
    let displayWidth = Math.min(availWidth, availHeight * ratio);
    let displayHeight = displayWidth / ratio;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }

  function init() {
    canvas = document.getElementById('board');
    ctx = canvas.getContext('2d');
    GamePhysics.init();
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    GameInput.attach(canvas, {
      tryGrab: (x, y) => tryGrab(x, y),
      onDrag: (x, y) => {
        if (!state || !state.draggingDisc) return;
        Matter.Body.setPosition(state.draggingDisc.body, { x, y });
        Matter.Body.setVelocity(state.draggingDisc.body, { x: 0, y: 0 });
      },
      onRelease: (x, y) => handlePointerRelease(x, y),
      onCancel: () => {
        if (!state || !state.draggingDisc) return;
        cancelDragging();
      }
    });

    document.getElementById('btn-restart').addEventListener('click', hardReset);
    document.getElementById('btn-primary').addEventListener('click', handlePrimaryAction);

    updateHud();
    updateOverlay();
    lastTime = performance.now();
    requestAnimationFrame(tick);
  }

  return { init };
})();

window.addEventListener('DOMContentLoaded', Game.init);
