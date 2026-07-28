// Mundo Matter.js — Pinball.
//
// A física é derivada do MESMO path do vetor que o render desenha (ver
// playfield-path.js): cada uma das ~53 formas do SVG é classificada como
// parafuso decorativo (ignorado), pino/sino (círculo) ou parede (contorno
// amostrado). Nada é redesenhado à mão — por isso não há risco de uma peça
// de física ficar sobreposta a outra ou desalinhada da arte.

const GamePhysics = (function () {
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  let engine, world;
  let ball = null;
  let ballHeld = true;
  let staticBodyCount = 0;
  let stallFrames = 0;
  let stallAnchor = null;
  let forceDrain = false;
  let bellInfo = null;
  let elasticBumperInfo = [];
  const flippers = {};

  let onBellHit = null;
  let onPostHit = null;
  let onWallHit = null;
  let onSlingHit = null;
  let onElasticHit = null;
  let onRampHit = null;
  let lastSlingAt = -Infinity;
  let lastBellHitAt = -Infinity;
  let lastPostHitAt = -Infinity;
  let lastElasticAt = -Infinity;
  let lastRampAt = -Infinity;

  // "Portinhola" da calha do lançador: no pinball de verdade essa peça é uma
  // aba de metal que abre pra deixar a bola sair rumo ao campo e fecha
  // sozinha pra ela não voltar pro tubo. Aqui simulamos isso adicionando uma
  // parede fina só DEPOIS que a bola já cruzou pro campo — antes disso a
  // "porta" fica aberta (sem parede nenhuma) pra não bloquear a saída.
  let gateWall = null;
  let gateClosed = false;
  // Ângulo animado da portinhola: em vez de só alternar entre dois estados
  // fixos, mira um alvo (0 = deitada/fechando o vão, 1 = quase de perfil) e
  // persegue esse alvo com inércia própria — mais responsiva a colisões
  // reais da bola do que um binário preso ao estado geral do jogo.
  // Um Body.setVelocity chamado de dentro do handler de colisão é
  // sobrescrito pelo próprio resolvedor de física do Matter naquele mesmo
  // passo (ele já calculou a resposta da colisão real com a parede antes do
  // handler rodar, e aplica por cima). O tiro da rampa por isso só marca um
  // pedido aqui; a velocidade de verdade é setada no INÍCIO do próximo
  // update(), antes do Engine.update rodar — um passo tarde, mas fora do
  // alcance do resolvedor.
  let pendingRampShot = null;
  let doorOpenness = 0;
  let doorTargetOpenness = 0;

  // -------- Extração de formas do vetor --------
  function makeHiddenSvg() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(PLAYFIELD_SVG_W));
    svg.setAttribute('height', String(PLAYFIELD_SVG_H));
    svg.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(svg);
    const path = document.createElementNS(NS, 'path');
    svg.appendChild(path);
    return { svg, path };
  }

  function toBoard(p) {
    const K = PLAYFIELD_PATH_SCALE;
    return PLAYFIELD_FLIP_Y
      ? { x: K * p.x, y: PLAYFIELD_SVG_H - K * p.y }
      : { x: K * p.x, y: K * p.y };
  }

  function shapeBBox(pathEl) {
    const b = pathEl.getBBox();
    const K = PLAYFIELD_PATH_SCALE;
    const x0 = K * b.x;
    const x1 = K * (b.x + b.width);
    let y0 = K * b.y;
    let y1 = K * (b.y + b.height);
    if (PLAYFIELD_FLIP_Y) {
      const flip = (y) => PLAYFIELD_SVG_H - y;
      [y0, y1] = [flip(y1), flip(y0)];
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // Amostra o contorno inteiro da forma (pode ter vários subpaths/buracos —
  // um salto grande entre pontos consecutivos indica troca de subpath, então
  // simplesmente não fechamos parede ali).
  function contourWalls(pathEl) {
    const totalRaw = pathEl.getTotalLength();
    const totalBoard = totalRaw * PLAYFIELD_PATH_SCALE;
    const n = Math.max(12, Math.ceil(totalBoard / PHYSICS.contourSpacing));
    const maxJump = PHYSICS.contourSpacing * PHYSICS.contourJumpFactor;
    const bodies = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p = toBoard(pathEl.getPointAtLength((totalRaw * i) / n));
      if (prev) {
        const dx = p.x - prev.x;
        const dy = p.y - prev.y;
        const len = Math.hypot(dx, dy);
        if (len > 0.6 && len < maxJump) {
          bodies.push(Bodies.rectangle(
            (prev.x + p.x) / 2,
            (prev.y + p.y) / 2,
            len + PHYSICS.wallThickness * 0.5,
            PHYSICS.wallThickness,
            {
              isStatic: true,
              angle: Math.atan2(dy, dx),
              restitution: PHYSICS.wallRestitution,
              friction: 0.05,
              label: 'wall',
            }
          ));
        }
      }
      prev = p;
    }
    return bodies;
  }

  // playfield3.svg (versão limpa pelo usuário) não tem mais formas de topo
  // separadas pro sino/pinos/furos — o desenho inteiro virou um compound
  // path só, com esses elementos como BURACOS (contorno interno) dentro
  // dele, não subformas próprias. Em vez de classificar por bbox de forma,
  // renderiza a arte inteira num canvas e faz duas passagens: (1) preenche
  // o fundo por flood-fill a partir da borda pra marcar o que é realmente
  // "fora"; (2) qualquer pixel não-preenchido que NÃO foi alcançado por
  // esse flood-fill é um buraco fechado (sino, pino, furo de pivô, parafuso
  // decorativo) — cada componente conectado vira um item com bbox própria.
  function findHoles() {
    const w = Math.ceil(PLAYFIELD_SVG_W);
    const h = Math.ceil(PLAYFIELD_SVG_H);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const cctx = canvas.getContext('2d');
    cctx.fillStyle = '#000';
    // Cada um dos PLAYFIELD_PATHS precisa do seu PRÓPRIO fill() — concatenar
    // tudo num Path2D só quebra a paridade de enrolamento de cada forma
    // (testado: os 43 furos redondos viram 17). Ver nota em playfield-path.js.
    for (const d of PLAYFIELD_PATHS) cctx.fill(new Path2D(d));
    const data = cctx.getImageData(0, 0, w, h).data;
    const isArt = (x, y) => data[(y * w + x) * 4 + 3] > 100;

    const state = new Uint8Array(w * h); // 0=unvisited, 1=art, 2=outside bg, 3=hole
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push([x, 0], [x, h - 1]); }
    for (let y = 0; y < h; y++) { stack.push([0, y], [w - 1, y]); }
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const idx = y * w + x;
      if (state[idx]) continue;
      if (isArt(x, y)) { state[idx] = 1; continue; }
      state[idx] = 2;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    const holes = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (state[idx]) continue;
        if (isArt(x, y)) { state[idx] = 1; continue; }
        let minX = x, maxX = x, minY = y, maxY = y, count = 0;
        const st = [[x, y]];
        state[idx] = 3;
        while (st.length) {
          const [cx, cy] = st.pop();
          count++;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
          for (const [nx, ny] of nb) {
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nidx = ny * w + nx;
            if (state[nidx]) continue;
            if (isArt(nx, ny)) { state[nidx] = 1; continue; }
            state[nidx] = 3;
            st.push([nx, ny]);
          }
        }
        if (count > 4) {
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          holes.push({ cx, cy, w: maxX - minX + 1, h: maxY - minY + 1, count });
        }
      }
    }
    return holes;
  }

  // A partir do centro de um buraco redondo, anda pra fora em várias
  // direções até sair de volta pro fundo — mede o raio do ANEL sólido ao
  // redor do buraco (sino e pinos são desenhados como anéis grossos, não
  // discos cheios; o buraco em si é só o miolo oco).
  function measureRingOuterRadius(cx, cy, innerR) {
    const w = Math.ceil(PLAYFIELD_SVG_W);
    const h = Math.ceil(PLAYFIELD_SVG_H);
    if (!measureRingOuterRadius.ctx) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = '#000';
      for (const d of PLAYFIELD_PATHS) cctx.fill(new Path2D(d));
      measureRingOuterRadius.ctx = cctx;
      measureRingOuterRadius.data = cctx.getImageData(0, 0, w, h).data;
    }
    const data = measureRingOuterRadius.data;
    const isArt = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return false;
      return data[(y * w + x) * 4 + 3] > 100;
    };
    let sum = 0;
    const dirs = 16;
    for (let a = 0; a < dirs; a++) {
      const t = (a / dirs) * Math.PI * 2;
      const dx = Math.cos(t), dy = Math.sin(t);
      let r = innerR + 2;
      while (r < innerR + 120 && isArt(Math.round(cx + dx * r), Math.round(cy + dy * r))) r++;
      sum += r;
    }
    return sum / dirs;
  }

  function buildPlayfieldFromVector() {
    elasticBumperInfo = [];
    const { svg, path } = makeHiddenSvg();

    // Paredes: contorno amostrado de cada um dos PLAYFIELD_PATHS (a estrutura
    // principal + os furos redondos que o usuário separou em Playfield 4.svg),
    // pulando só parafusos minúsculos. Isso também traça um anel de parede
    // fina ao redor de cada buraco redondo (sino, pinos, bumpers)
    // automaticamente — os círculos abaixo são só pra ter um corpo com o
    // LABEL certo (bell/post/elastic) pra pontuação, a colisão em si já
    // funciona com esses anéis de parede.
    const bodies = [];
    PLAYFIELD_PATHS.forEach((d) => {
      path.setAttribute('d', d);
      const bb = shapeBBox(path);
      const maxDim = Math.max(bb.w, bb.h);
      if (maxDim < SHAPE_RULES.screwMaxSize) return;
      bodies.push(...contourWalls(path));
    });
    svg.remove();

    // Sino e pinos: identificados pelos BURACOS redondos na arte (ver
    // findHoles), não mais por forma de topo — a versão limpa do vetor não
    // tem mais formas separadas pra eles.
    const holes = findHoles();
    for (const hh of holes) {
      const size = Math.max(hh.w, hh.h);
      const roundish = Math.abs(hh.w - hh.h) <= SHAPE_RULES.circleTolerance * size;
      if (!roundish) continue;
      const innerR = size / 2;
      if (size >= SHAPE_RULES.bellMinSize * 0.5 && hh.cy < SHAPE_RULES.bellMaxCy) {
        const outerR = measureRingOuterRadius(hh.cx, hh.cy, innerR);
        if (outerR >= SHAPE_RULES.bellMinSize / 2) {
          bellInfo = { x: hh.cx, y: hh.cy, r: outerR };
          bodies.push(Bodies.circle(hh.cx, hh.cy, outerR, {
            isStatic: true,
            restitution: PHYSICS.bellRestitution,
            label: 'bell',
          }));
        }
      } else if (POST_HOLE_POSITIONS.some((p) => Math.hypot(p.x - hh.cx, p.y - hh.cy) < 12)) {
        const outerR = measureRingOuterRadius(hh.cx, hh.cy, innerR);
        bodies.push(Bodies.circle(hh.cx, hh.cy, outerR, {
          isStatic: true,
          restitution: PHYSICS.postRestitution,
          label: 'post',
        }));
      } else if (ELASTIC_BUMPER_POSITIONS.some((p) => Math.hypot(p.x - hh.cx, p.y - hh.cy) < 12)) {
        const outerR = measureRingOuterRadius(hh.cx, hh.cy, innerR);
        elasticBumperInfo.push({ x: hh.cx, y: hh.cy, r: outerR });
        bodies.push(Bodies.circle(hh.cx, hh.cy, outerR, {
          isStatic: true,
          restitution: PHYSICS.elasticRestitution,
          label: 'elastic',
        }));
      }
    }

    return bodies.filter((b) => {
      if (b.label !== 'wall') return true;
      const p = b.position;
      const inGate = p.x > LAUNCH_GATE.x0 && p.x < LAUNCH_GATE.x1
        && p.y > LAUNCH_GATE.y0 && p.y < LAUNCH_GATE.y1;
      const inFunnel = p.x > BELL_FUNNEL_MASK.x0 && p.x < BELL_FUNNEL_MASK.x1
        && p.y > BELL_FUNNEL_MASK.y0 && p.y < BELL_FUNNEL_MASK.y1;
      // O contorno amostrado do vetor também traça um anel de parede fino em
      // volta do buraco do sino (mesma ideia dos pinos/elásticos). Os
      // segmentos retangulares desse anel têm espessura própria, então as
      // QUINAS deles ficam um pouco mais longe do centro do que o círculo
      // 'bell' explícito (raio medido) — a bola batia nessas quinas primeiro
      // e nunca chegava perto o bastante do círculo de verdade pra pontuar.
      // Como o círculo 'bell' já cobre a colisão sozinho, tira esse anel
      // redundante especificamente.
      const inBellRing = bellInfo
        && Math.hypot(p.x - bellInfo.x, p.y - bellInfo.y) < bellInfo.r + 10;
      return !inGate && !inFunnel && !inBellRing;
    });
  }

  // Calha inclinada de verdade sob o sino — a "forquilha" do vetor tem fundo
  // quase plano e prende a bola (ver BELL_FUNNEL_MASK); estas duas paredes em
  // V têm inclinação suficiente pra gravidade escoar a bola pro campo depois
  // do ding, em vez dela ficar parada esperando o anti-stall.
  function buildBellFunnel() {
    return BELL_FUNNEL.map((s) => Bodies.rectangle(
      (s.x1 + s.x2) / 2,
      (s.y1 + s.y2) / 2,
      Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + PHYSICS.wallThickness,
      PHYSICS.wallThickness,
      {
        isStatic: true,
        angle: Math.atan2(s.y2 - s.y1, s.x2 - s.x1),
        restitution: PHYSICS.wallRestitution,
        friction: 0.02,
        label: 'wall',
      }
    ));
  }

  // -------- Flippers --------
  // Cinemáticos: a cada passo calculamos ângulo E centro a partir do pivô
  // fixo. Sem Constraint — `Body.setAngle` gira em torno do centro do corpo,
  // não do pivô, e as duas coisas juntas brigam (o flipper dispara sozinho).
  // Corpo estático movido à mão: como dinâmico ele seria integrado pelo
  // motor de física e brigaria com nosso controle; e `inertia: Infinity`
  // nas opções corrompe o corpo (vértices explodem, ele para de colidir).
  function flipperAngles(side) {
    const rest = BOARD.flipperRestDeg * Math.PI / 180;
    const sweep = BOARD.flipperSweepDeg * Math.PI / 180;
    return side === 'left'
      ? { rest, active: rest - sweep }
      : { rest: Math.PI - rest, active: Math.PI - rest + sweep };
  }

  function buildFlipper(side) {
    const pivot = BOARD.flipperPivots[side];
    const angles = flipperAngles(side);
    const half = BOARD.flipperLength / 2;

    const body = Bodies.rectangle(
      pivot.x + Math.cos(angles.rest) * half,
      pivot.y + Math.sin(angles.rest) * half,
      BOARD.flipperLength,
      BOARD.flipperThickness,
      {
        isStatic: true,
        angle: angles.rest,
        friction: 0.05,
        restitution: PHYSICS.flipperRestitution,
        label: 'flipper',
      }
    );

    flippers[side] = {
      body,
      pivot,
      restAngle: angles.rest,
      activeAngle: angles.active,
      angle: angles.rest,
      omegaStep: 0,
      active: false,
    };
    return body;
  }

  // Rede de segurança fora do campo: as paredes reais vêm do contorno
  // amostrado do vetor (finas, pra não engolir canais estreitos) e podem
  // deixar a bola vazar por tunneling em lançamentos rápidos. Estas paredes
  // grossas ficam por fora de toda a geometria do vetor, então nunca
  // atrapalham o jogo — só existem pra bola nunca escapar pro infinito.
  // O lado de baixo fica aberto (é o dreno, detectado por posição em drainY).
  function buildBoundaryWalls() {
    const t = 40;
    const w = BOARD.width;
    const h = BOARD.height;
    const opts = { isStatic: true, restitution: PHYSICS.wallRestitution, label: 'boundary' };
    return [
      Bodies.rectangle(-t / 2, h / 2, t, h * 2, opts),
      Bodies.rectangle(w + t / 2, h / 2, t, h * 2, opts),
      Bodies.rectangle(w / 2, -t / 2, w * 2, t, opts),
    ];
  }

  // Trava a passagem de volta pro tubo: uma parede fina vertical bem na
  // "porta" da calha (dentro de LAUNCH_GATE, perto do lado do tubo).
  function buildGateWall() {
    const x = LAUNCH_GATE.x1 - 20;
    const yMid = (LAUNCH_GATE.y0 + LAUNCH_GATE.y1) / 2;
    return Bodies.rectangle(x, yMid, 8, LAUNCH_GATE.y1 - LAUNCH_GATE.y0, {
      isStatic: true,
      restitution: PHYSICS.wallRestitution,
      label: 'wall',
    });
  }

  // A portinhola agora reage à posição real da bola quadro a quadro (perto
  // dela = abre na hora), em vez de só pular entre dois estados fixos — o
  // desenho continua girando a partir do mesmo ponto (x1,y1, o lado
  // esquerdo/de campo do segmento, ver drawLauncherDoor) mas com uma
  // resposta rápida e um pouco de inércia própria, pra parecer empurrada
  // pela bola e não um interruptor.
  const DOOR_MID_X = (LAUNCHER_DOOR.x1 + LAUNCHER_DOOR.x2) / 2;
  const DOOR_MID_Y = (LAUNCHER_DOOR.y1 + LAUNCHER_DOOR.y2) / 2;

  // A portinhola visual reage à proximidade da bola — abre quando ela está
  // perto, fecha de novo assim que ela se afasta — MAS só enquanto o portão
  // físico ainda não fechou pra valer (!gateClosed). Antes reagia a QUALQUER
  // passagem perto dali, inclusive muito depois do lançamento (a bola volta
  // a rolar perto da boca do tubo durante o jogo normal e a portinhola
  // reabria sem sentido nenhum, já que a parede real não deixa ela voltar
  // pro tubo mesmo). Depois de gateClosed, fica travada na posição de
  // repouso até a PRÓXIMA bola (resetGate em spawnBall zera gateClosed).
  function updateDoor() {
    if (ball && !gateClosed) {
      const near = Math.hypot(ball.position.x - DOOR_MID_X, ball.position.y - DOOR_MID_Y) < 95;
      doorTargetOpenness = near ? 1 : 0.05;
    } else {
      doorTargetOpenness = 0.05;
    }
    const rate = doorTargetOpenness > doorOpenness ? 0.65 : 0.22;
    doorOpenness += (doorTargetOpenness - doorOpenness) * rate;
  }

  function updateGate() {
    if (gateClosed || !ball) return;
    // Só fecha quando a bola já está claramente dentro do campo principal,
    // longe o bastante da calha — assim nunca trava a bola no próprio
    // lançamento, só impede o retorno depois que ela já passou. Usa
    // GATE_CLOSE_X (fixo, não LAUNCH_GATE.x0+60): esse limite já cobriu por
    // engano o próprio launcherX quando x0 foi estreitado, fazendo a trava
    // nascer em cima do caminho de subida da bola.
    if (ball.position.x < GATE_CLOSE_X) {
      gateClosed = true;
      gateWall = buildGateWall();
      Composite.add(world, gateWall);
    }
  }

  function resetGate() {
    if (gateWall) {
      Composite.remove(world, gateWall);
      gateWall = null;
    }
    gateClosed = false;
  }

  function stepFlippers(dt) {
    for (const side of ['left', 'right']) {
      const f = flippers[side];
      if (!f) continue;
      const target = f.active ? f.activeAngle : f.restAngle;
      const speed = f.active ? BOARD.flipperSweepSpeed : BOARD.flipperReturnSpeed;
      const maxStep = speed * dt;
      const diff = target - f.angle;
      const next = Math.abs(diff) <= maxStep ? target : f.angle + Math.sign(diff) * maxStep;

      const half = BOARD.flipperLength / 2;
      const center = {
        x: f.pivot.x + Math.cos(next) * half,
        y: f.pivot.y + Math.sin(next) * half,
      };
      Body.setPosition(f.body, center);
      Body.setAngle(f.body, next);
      f.omegaStep = next - f.angle;
      f.angle = next;
    }
  }

  // -------- Setup --------
  function init() {
    engine = Engine.create();
    world = engine.world;
    world.gravity.x = 0;
    world.gravity.y = PHYSICS.gravity;
    // Cada init() cria um Engine novo, cujo relógio interno (engine.timing)
    // volta pra perto de zero — mas esses "last*At" guardavam o timestamp do
    // engine ANTERIOR (potencialmente bem maior). Sem resetar, `now -
    // lastXAt` fica negativo pra sempre e nenhum cooldown libera de novo
    // (só afeta reinicializar o motor no mesmo carregamento de página, como
    // em teste manual — em jogo normal init() roda uma vez só — mas vale
    // deixar correto).
    lastSlingAt = -Infinity;
    lastBellHitAt = -Infinity;
    lastPostHitAt = -Infinity;
    lastElasticAt = -Infinity;
    lastRampAt = -Infinity;

    const statics = buildPlayfieldFromVector();
    staticBodyCount = statics.length;
    Composite.add(world, statics);
    Composite.add(world, buildBoundaryWalls());
    Composite.add(world, buildBellFunnel());
    Composite.add(world, [buildFlipper('left'), buildFlipper('right')]);

    const slingBodies = PINBALL_SLINGS.map((s, i) => Bodies.rectangle(
      (s.x1 + s.x2) / 2,
      (s.y1 + s.y2) / 2,
      Math.hypot(s.x2 - s.x1, s.y2 - s.y1) + PHYSICS.slingThickness,
      PHYSICS.slingThickness,
      {
        isStatic: true,
        angle: Math.atan2(s.y2 - s.y1, s.x2 - s.x1),
        restitution: PHYSICS.slingRestitution,
        label: 'sling',
        plugin: { slingIndex: i },
      }
    ));
    Composite.add(world, slingBodies);

    // Travessas da forquilha central: sensores (não bloqueiam sozinhos — a
    // parede real já vem do contorno do vetor, ver contourWalls) que só
    // detectam quando a bola passa por ali subindo quase reto, pra disparar
    // o tiro guiado até o sino (ver rampShot no handler de colisão).
    const rungBodies = FORQUILHA_RUNGS.map((r) => Bodies.rectangle(r.x, r.y, r.w, r.h, {
      isStatic: true,
      isSensor: true,
      label: 'rung',
    }));
    Composite.add(world, rungBodies);

    // Corpo estático não transfere o próprio movimento para a bola, então o
    // "tapa" do flipper é aplicado à mão: velocidade tangencial no ponto de
    // contato (ω × r), perpendicular ao braço.
    const kickFromFlipper = (flipperBody) => {
      if (!ball) return;
      const side = flipperBody === flippers.left.body ? 'left' : 'right';
      const f = flippers[side];
      if (!f || Math.abs(f.omegaStep) < 1e-4) return;
      const r = Math.hypot(ball.position.x - f.pivot.x, ball.position.y - f.pivot.y);
      const k = PHYSICS.flipperKick;
      Body.setVelocity(ball, {
        x: ball.velocity.x + f.omegaStep * -Math.sin(f.angle) * r * k,
        y: ball.velocity.y + f.omegaStep * Math.cos(f.angle) * r * k,
      });
    };

    const onPairs = (event) => {
      const now = engine.timing.timestamp;
      for (const pair of event.pairs) {
        const labels = [pair.bodyA.label, pair.bodyB.label];
        if (!labels.includes('ball')) continue;
        if (labels.includes('flipper')) {
          kickFromFlipper(pair.bodyA.label === 'flipper' ? pair.bodyA : pair.bodyB);
        } else if (labels.includes('sling')) {
          const sb = pair.bodyA.label === 'sling' ? pair.bodyA : pair.bodyB;
          const s = PINBALL_SLINGS[sb.plugin.slingIndex];
          const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
          if (s && speed > PHYSICS.slingMinSpeed && now - lastSlingAt > PHYSICS.slingCooldown) {
            lastSlingAt = now;
            const baseAngle = Math.atan2(s.ny, s.nx);
            const angle = baseAngle + (Math.random() * 2 - 1) * PHYSICS.slingKickJitter;
            Body.setVelocity(ball, {
              x: ball.velocity.x + Math.cos(angle) * PHYSICS.slingKick,
              y: ball.velocity.y + Math.sin(angle) * PHYSICS.slingKick,
            });
            onSlingHit && onSlingHit();
          }
        } else if (labels.includes('bell')) {
          if (now - lastBellHitAt > PHYSICS.bellCooldown) {
            lastBellHitAt = now;
            onBellHit && onBellHit();
          }
        } else if (labels.includes('post')) {
          if (now - lastPostHitAt > 110) {
            lastPostHitAt = now;
            onPostHit && onPostHit();
          }
        } else if (labels.includes('elastic')) {
          // "Jet bumper": empurra a bola pra longe do PRÓPRIO centro do
          // bumper (direção calculada a cada toque, não uma normal fixa),
          // como os bumpers redondos de um pinball de verdade.
          const eb = pair.bodyA.label === 'elastic' ? pair.bodyA : pair.bodyB;
          const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
          if (now - lastElasticAt > PHYSICS.elasticCooldown && speed > PHYSICS.elasticMinSpeed) {
            const dx = ball.position.x - eb.position.x;
            const dy = ball.position.y - eb.position.y;
            const dist = Math.hypot(dx, dy) || 1;
            lastElasticAt = now;
            // Um pouco de ângulo aleatório no empurrão — sem isso, dois
            // bumpers próximos podem trocar a bola num "eco" simétrico que
            // nunca escapa da vizinhança (bola pulando de um pro outro
            // indefinidamente, reportado pelo usuário).
            const baseAngle = Math.atan2(dy, dx);
            const angle = baseAngle + (Math.random() * 2 - 1) * PHYSICS.elasticKickJitter;
            // O par mais externo de cada lado (perto das asas laterais)
            // prendia a bola no canto entre o bumper e a asa — kick mais
            // forte só ali, pra ela escapar com energia de sobra.
            const boosted = ELASTIC_BUMPER_KICK_BOOST.some(
              (p) => Math.hypot(p.x - eb.position.x, p.y - eb.position.y) < 12
            );
            const kick = PHYSICS.elasticKick * (boosted ? 1.4 : 1);
            Body.setVelocity(ball, {
              x: ball.velocity.x + Math.cos(angle) * kick,
              y: ball.velocity.y + Math.sin(angle) * kick,
            });
            onElasticHit && onElasticHit({ x: eb.position.x, y: eb.position.y });
          }
        } else if (labels.includes('rung')) {
          // Rampa da forquilha: só "acerta" quando a bola sobe quase reta
          // (ângulo perto de 90° com a horizontal) — um raspão de lado
          // (|vx| grande) não conta, só passa direto como parede normal.
          const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
          const sideways = speed > 0 ? Math.abs(ball.velocity.x) / speed : 1;
          const movingUp = ball.velocity.y < 0;
          if (movingUp && speed > PHYSICS.rampMinSpeed && sideways < PHYSICS.rampAngleTolerance
            && now - lastRampAt > PHYSICS.rampCooldown) {
            lastRampAt = now;
            pendingRampShot = { targetX: bellInfo ? bellInfo.x : ball.position.x };
            onRampHit && onRampHit();
          }
        } else if (labels.includes('wall')) {
          const b = pair.bodyA.label === 'ball' ? pair.bodyA : pair.bodyB;
          const speed = Math.hypot(b.velocity.x, b.velocity.y);
          if (speed > 9) onWallHit && onWallHit(Math.min(1, speed / 28));
        }
      }
    };

    // 'collisionActive' também, porque a bola costuma já estar encostada no
    // flipper quando o jogador aciona — nesse caso 'collisionStart' nunca
    // dispara e o tapa nunca sairia.
    Events.on(engine, 'collisionStart', onPairs);
    Events.on(engine, 'collisionActive', onPairs);

    return { engine, world };
  }

  // -------- Bola --------
  function spawnBall() {
    if (ball) Composite.remove(world, ball);
    ball = Bodies.circle(BOARD.launcherX, BOARD.launcherRestY, BOARD.ballRadius, {
      restitution: PHYSICS.ballRestitution,
      friction: PHYSICS.ballFriction,
      frictionAir: PHYSICS.frictionAir,
      density: PHYSICS.ballDensity,
      label: 'ball',
    });
    ballHeld = true;
    stallFrames = 0;
    forceDrain = false;
    resetGate();
    Composite.add(world, ball);
    return ball;
  }

  function holdBall() {
    if (!ball || !ballHeld) return;
    Body.setPosition(ball, { x: BOARD.launcherX, y: BOARD.launcherRestY });
    Body.setVelocity(ball, { x: 0, y: 0 });
    Body.setAngularVelocity(ball, 0);
  }

  function launchBall(power) {
    if (!ball) return;
    ballHeld = false;
    const speed = BOARD.launcherMinLaunchSpeed
      + power * (BOARD.launcherMaxLaunchSpeed - BOARD.launcherMinLaunchSpeed);
    Body.setVelocity(ball, { x: 0, y: -speed });
  }

  function clampBallSpeed() {
    if (!ball) return;
    const v = ball.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > PHYSICS.maxBallSpeed) {
      const k = PHYSICS.maxBallSpeed / s;
      Body.setVelocity(ball, { x: v.x * k, y: v.y * k });
    }
  }

  // Uma bola pode ficar entalada num canto sem sair do lugar — em pinball de
  // verdade o jogador dá um tranco na mesa. Mas uma bola QUIETA no fundo de
  // um flipper, só repousando sob a gravidade, não é travamento — reportado:
  // "quando parada... a bolinha salta sozinha, desrespeitando a física". A
  // checagem por posição sozinha vai disparar mesmo numa bola só descansando
  // devagar; por isso agora também exige velocidade baixa (bola realmente
  // parada, não rolando devagar) e um tempo bem maior antes do primeiro
  // tranco, pra não interromper um repouso legítimo.
  function antiStall() {
    if (!ball || ballHeld || forceDrain) {
      stallFrames = 0;
      stallAnchor = null;
      return;
    }
    if (!stallAnchor) {
      stallAnchor = { x: ball.position.x, y: ball.position.y };
      stallFrames = 0;
      return;
    }
    const moved = Math.hypot(ball.position.x - stallAnchor.x, ball.position.y - stallAnchor.y);
    if (moved > 60) {
      stallAnchor = { x: ball.position.x, y: ball.position.y };
      stallFrames = 0;
      return;
    }
    stallFrames++;
    const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
    // Testado à mão: uma bola perfeitamente centrada num furo decorativo
    // (anel quase do tamanho da própria bola, ver os dois furos perto do
    // pivô esquerdo) fica numa poça simétrica onde só velocidade não escapa
    // — os primeiros dois trancos (empurrão lateral fraco) esbarravam de
    // volta na mesma parede e ela voltava pro centro exato em menos de um
    // segundo, sem sair do lugar em 15s de teste. Intervalo mais curto
    // (240→150) tenta mais cedo, e o tranco agora também REPOSICIONA a bola
    // pra fora do raio típico de um furo (não só dá velocidade) — mesma
    // lógica que já resolvia a forquilha, generalizada pra qualquer poça
    // apertada, não só aquela.
    if (stallFrames % 150 === 0 && speed < 0.6) {
      const r = FORQUILHA_RUNGS[0];
      const inForquilha = ball.position.x > r.x - r.w / 2 && ball.position.x < r.x + r.w / 2
        && ball.position.y > r.y - r.h / 2 && ball.position.y < r.y + r.h / 2;
      if (inForquilha) {
        // Bola vinda do sino, presa no vão entre os trilhos (26px, menor que
        // o diâmetro dela) — um empurrão lateral genérico não adianta, ela
        // esbarra nos mesmos trilhos de novo. Desce ela reto pra baixo da
        // ponta dos trilhos, livre do vão, e deixa cair pro campo normal.
        Body.setPosition(ball, { x: r.x, y: r.y + r.h / 2 + 20 });
        Body.setVelocity(ball, { x: 0, y: 4 });
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        // 40px cobre o raio externo de qualquer furo decorativo/bumper
        // conhecido (todos ≤ ~31) com folga — garante sair da poça de
        // verdade, não só ganhar velocidade dentro dela.
        Body.setPosition(ball, {
          x: ball.position.x + dx * 40,
          y: ball.position.y + dy * 40 - 15,
        });
        Body.setVelocity(ball, { x: dx * 6, y: dy * 6 - 3 });
      }
    }
    if (stallFrames > 900) forceDrain = true;
  }

  function isDrained() {
    return !!ball && (forceDrain || ball.position.y > BOARD.drainY);
  }

  function setFlipperActive(side, active) {
    const f = flippers[side];
    if (f) f.active = active;
  }

  // Plunge fraco: a bola não vence a calha e desce de volta pela canaleta.
  // Quando ela repousa no fundo, o lançador rearma sozinho.
  function maybeRearmLauncher() {
    if (!ball || ballHeld) return;
    const p = ball.position;
    if (p.x < BOARD.launcherX - 60 || p.y < BOARD.launcherRestY - 90) return;
    if (Math.hypot(ball.velocity.x, ball.velocity.y) > 1.4) return;
    ballHeld = true;
  }

  // Em velocidade máxima de lançamento a bola anda mais que a espessura fina
  // das paredes (6px) num único passo de física, e pode atravessar direto
  // (tunneling) — sobretudo perto de cantos, onde vários segmentos finos se
  // encontram em ângulos diferentes. Rodar o motor em sub-passos menores
  // reduz o deslocamento por passo e resolve a colisão antes que isso ocorra.
  const PHYSICS_SUBSTEPS = 4;

  function update(delta) {
    if (ballHeld) holdBall();
    stepFlippers(delta / 1000);
    clampBallSpeed();
    const sub = delta / PHYSICS_SUBSTEPS;
    for (let i = 0; i < PHYSICS_SUBSTEPS; i++) {
      Engine.update(engine, sub);
      // Aplicado ENTRE substeps (depois que o resolvedor já terminou de
      // reagir à colisão real que disparou o pedido, antes do próximo
      // substep começar) — só assim a velocidade nova sobrevive.
      if (pendingRampShot && ball) {
        const { targetX } = pendingRampShot;
        pendingRampShot = null;
        // Os dois trilhos da forquilha ficam só 26px afastados — MENOS que
        // o diâmetro da bola (28px). Um empurrão de velocidade sozinho não
        // basta: ela sobe uns px e esbarra de novo no primeiro trilho que
        // encostar, igual bateu pra disparar isso. Uma rampa de verdade
        // carregaria a bola por FORA desse vão estreito — então reposiciona
        // ela direto acima dos trilhos (RAMP_EXIT_Y, medido na arte como o
        // topo da escada) antes de mandar pro sino.
        Body.setPosition(ball, { x: targetX, y: RAMP_EXIT_Y });
        Body.setVelocity(ball, { x: 0, y: -PHYSICS.rampShotSpeed });
      }
    }
    maybeRearmLauncher();
    antiStall();
    updateGate();
    updateDoor();
  }

  function getFlipperInfo(side) {
    const f = flippers[side];
    return f ? { pivot: f.pivot, angle: f.angle } : { pivot: { x: 0, y: 0 }, angle: 0 };
  }

  return {
    init,
    spawnBall,
    launchBall,
    isDrained,
    setFlipperActive,
    getFlipperInfo,
    update,
    getBall: () => ball,
    isBallHeld: () => ballHeld,
    getStaticBodyCount: () => staticBodyCount,
    getBellInfo: () => bellInfo,
    getElasticBumpers: () => elasticBumperInfo,
    isGateClosed: () => gateClosed,
    getDoorOpenness: () => doorOpenness,
    __world: () => world,
    setOnBellHit: (fn) => { onBellHit = fn; },
    setOnPostHit: (fn) => { onPostHit = fn; },
    setOnWallHit: (fn) => { onWallHit = fn; },
    setOnSlingHit: (fn) => { onSlingHit = fn; },
    setOnElasticHit: (fn) => { onElasticHit = fn; },
    setOnRampHit: (fn) => { onRampHit = fn; },
  };
})();
