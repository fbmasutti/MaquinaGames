// Setup do mundo Matter.js — Toca o Sino.

const GamePhysics = (function () {
  const { Engine, World, Bodies, Body, Composite, Constraint, Events } = Matter;

  let engine, world;
  let ball = null;
  let ballHeld = true;
  const flippers = {}; // side -> { body, constraint, pivot, restAngle, activeAngle, active }
  let onBellHit = null;
  let onBumperHit = null;
  let onWallHit = null;
  let lastBellHitAt = -Infinity;
  let lastBumperHitAt = -Infinity;

  function wallSegment(x1, y1, x2, y2, extraOpts) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, len, 6, Object.assign({
      isStatic: true,
      angle,
      restitution: PHYSICS.wallRestitution,
      friction: 0.05,
      label: 'wall',
    }, extraOpts || {}));
  }

  // Aproxima um arco de círculo por N segmentos retos. Convenção: ângulo 0 =
  // direita, π/2 = cima (y cresce pra baixo no canvas, por isso o -sin).
  function buildArc(cx, cy, r, fromAngle, toAngle, N, extraOpts) {
    const segs = [];
    for (let i = 0; i < N; i++) {
      const a1 = fromAngle + ((toAngle - fromAngle) * i) / N;
      const a2 = fromAngle + ((toAngle - fromAngle) * (i + 1)) / N;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy - Math.sin(a1) * r;
      const x2 = cx + Math.cos(a2) * r;
      const y2 = cy - Math.sin(a2) * r;
      segs.push(wallSegment(x1, y1, x2, y2, extraOpts));
    }
    return segs;
  }

  function buildDome() {
    return buildArc(BOARD.fieldCenterX, BOARD.domeBaseY, BOARD.domeRadius, Math.PI, 0, 14);
  }

  // O flipper é totalmente cinemático: nós mesmos calculamos a posição do
  // centro e o ângulo a cada passo (função de pivô fixo + comprimento), em
  // vez de usar uma Constraint. Uma Constraint junto com Body.setAngle não
  // combina: setAngle gira o corpo em torno do PRÓPRIO centro, não do pivô,
  // então a Constraint vê uma "violação" a cada passo e aplica uma correção
  // forte — o flipper broxava disparado. Sem Constraint, sem briga.
  function buildFlipper(side) {
    const sign = side === 'left' ? 1 : -1;
    const pivotX = BOARD.fieldCenterX - sign * BOARD.flipperGap;
    const pivotY = BOARD.flipperPivotY;
    const length = BOARD.flipperLength;
    const restAngle = side === 'left' ? BOARD.flipperRestAngle : Math.PI - BOARD.flipperRestAngle;
    const activeAngle = side === 'left' ? BOARD.flipperActiveAngle : Math.PI - BOARD.flipperActiveAngle;

    const body = Bodies.rectangle(
      pivotX + Math.cos(restAngle) * length / 2,
      pivotY + Math.sin(restAngle) * length / 2,
      length,
      BOARD.flipperThickness,
      {
        angle: restAngle,
        friction: 0.02,
        restitution: 0.15,
        label: 'flipper',
        // isStatic: o corpo é movido por teleporte (setPosition/setAngle) a
        // cada passo em stepFlippers, nunca pela integração normal do motor.
        // Um corpo dinâmico reintegra posição/ângulo a partir de velocity
        // logo em seguida ao nosso teleporte (Engine.update chama Body.update
        // pra todo corpo não-estático), o que soma o movimento uma segunda
        // vez e faz o flipper girar bem além do alvo antes de "estalar" de
        // volta — isso que parecia um batedor batendo invertido. Corpos
        // estáticos não passam por essa integração, então o teleporte vale
        // como está, e a velocity que setamos ainda é usada pelo resolver de
        // colisão pra jogar a bola com o impulso certo.
        isStatic: true,
      }
    );

    flippers[side] = {
      body,
      pivot: { x: pivotX, y: pivotY },
      length,
      restAngle,
      activeAngle,
      active: false,
      currentAngle: restAngle,
    };
    return [body];
  }

  function init() {
    engine = Engine.create();
    world = engine.world;
    world.gravity.x = 0;
    world.gravity.y = PHYSICS.gravity;

    const statics = [];

    statics.push(...buildDome());

    // Rampa que liga o topo do canal do lançador à cúpula (ver constants.js).
    // Restitution mais alta que uma parede comum pra bola nunca perder
    // energia suficiente pra ficar presa nesse canto em tiros fortes.
    const lc = BOARD.laneCap;
    statics.push(wallSegment(lc.x1, lc.y1, lc.x2, lc.y2, { restitution: PHYSICS.slingshotRestitution }));

    // Parede esquerda do campo
    statics.push(wallSegment(BOARD.fieldLeft, BOARD.domeBaseY, BOARD.fieldLeft, BOARD.height + 40));
    // Divisória campo/canal (com vão logo abaixo da cúpula pra bola entrar)
    statics.push(wallSegment(BOARD.fieldRight, BOARD.domeBaseY + 24, BOARD.fieldRight, BOARD.height + 40));
    // Parede externa do canal do lançador
    statics.push(wallSegment(BOARD.fieldRightOuter, BOARD.wall, BOARD.fieldRightOuter, BOARD.height + 40));

    // Slingshots — guiam a bola da parede externa até o pivô do flipper,
    // acompanhando a borda em vez de deixá-la cair no vão entre eles.
    for (const s of BOARD.slingshots) {
      statics.push(wallSegment(s.x1, s.y1, s.x2, s.y2, { restitution: PHYSICS.slingshotRestitution }));
    }

    // Rampa em forquilha abaixo do sino — recebe a bola, guia até o sino, e
    // depois devolve ao campo por um dos lados.
    const r = BOARD.ramp;
    statics.push(wallSegment(r.peakX - r.halfSpan, r.peakY + r.drop, r.peakX, r.peakY, { restitution: 0.25 }));
    statics.push(wallSegment(r.peakX, r.peakY, r.peakX + r.halfSpan, r.peakY + r.drop, { restitution: 0.25 }));

    // Sino
    const bell = Bodies.circle(BOARD.bell.x, BOARD.bell.y, BOARD.bell.r, {
      isStatic: true,
      restitution: 0.6,
      label: 'bell',
    });
    statics.push(bell);

    // Bumpers
    for (const b of BOARD.bumpers) {
      statics.push(Bodies.circle(b.x, b.y, b.r, {
        isStatic: true,
        restitution: PHYSICS.bumperRestitution,
        label: 'bumper',
      }));
    }

    Composite.add(world, statics);

    const [flL] = buildFlipper('left');
    const [flR] = buildFlipper('right');
    Composite.add(world, [flL, flR]);

    Events.on(engine, 'collisionStart', (event) => {
      const now = engine.timing.timestamp;
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const labels = [bodyA.label, bodyB.label];
        if (labels.includes('bell') && labels.includes('ball')) {
          if (now - lastBellHitAt > 350) {
            lastBellHitAt = now;
            onBellHit && onBellHit();
          }
        } else if (labels.includes('bumper') && labels.includes('ball')) {
          if (now - lastBumperHitAt > 120) {
            lastBumperHitAt = now;
            onBumperHit && onBumperHit();
          }
        } else if (labels.includes('wall') && labels.includes('ball')) {
          const ballBody = bodyA.label === 'ball' ? bodyA : bodyB;
          const speed = Math.hypot(ballBody.velocity.x, ballBody.velocity.y);
          if (speed > 3) onWallHit && onWallHit(Math.min(1, speed / 20));
        }
      }
    });

    return { engine, world };
  }

  function spawnBall() {
    if (ball) Composite.remove(world, ball);
    ball = Bodies.circle(BOARD.launcherX, BOARD.launcherRestY, BOARD.ballRadius, {
      restitution: PHYSICS.restitution,
      friction: PHYSICS.ballFriction,
      frictionAir: PHYSICS.frictionAir,
      density: PHYSICS.ballDensity,
      label: 'ball',
    });
    ballHeld = true;
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
    const speed = BOARD.launcherMinLaunchSpeed + power * (BOARD.launcherMaxLaunchSpeed - BOARD.launcherMinLaunchSpeed);
    Body.setVelocity(ball, { x: 0, y: -speed });
  }

  function isDrained() {
    return !!ball && ball.position.y > BOARD.height + 60;
  }

  function setFlipperActive(side, active) {
    const f = flippers[side];
    if (f) f.active = active;
  }

  // A cada passo calculamos o próximo ângulo diretamente (função do alvo,
  // ângulo atual e velocidade angular) e setamos posição + ângulo do corpo
  // pra esse valor — cinemático de verdade, sem deixar a gravidade ou a
  // integração do motor interferir (o corpo é isStatic, então o Matter
  // nunca reintegra a posição sozinho entre um passo e outro).
  function stepFlippers(dtSeconds) {
    for (const side of ['left', 'right']) {
      const f = flippers[side];
      if (!f) continue;
      const target = f.active ? f.activeAngle : f.restAngle;
      const current = f.currentAngle;
      const speed = f.active ? BOARD.flipperAngularSpeed * 2.2 : BOARD.flipperAngularSpeed;
      const maxStep = speed * 60 * dtSeconds;
      const diff = target - current;
      const next = Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;

      const half = f.length / 2;
      const newCenter = {
        x: f.pivot.x + Math.cos(next) * half,
        y: f.pivot.y + Math.sin(next) * half,
      };
      const oldCenter = f.body.position;
      // Velocity do Matter é "distância por passo de física", não por
      // segundo — Body.update soma velocity direto na posição a cada tick
      // (sem multiplicar por delta), então o passo em si já é a velocity.
      const vel = { x: newCenter.x - oldCenter.x, y: newCenter.y - oldCenter.y };
      const angVel = next - current;

      Body.setVelocity(f.body, vel);
      Body.setAngularVelocity(f.body, angVel);
      Body.setPosition(f.body, newCenter);
      Body.setAngle(f.body, next);
      f.currentAngle = next;
    }
  }

  function update(delta) {
    if (ballHeld) holdBall();
    stepFlippers(delta / 1000);
    Engine.update(engine, delta);
  }

  function getFlipperInfo(side) {
    const f = flippers[side];
    return f ? { pivot: f.pivot, angle: f.body.angle } : { pivot: { x: 0, y: 0 }, angle: 0 };
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
    setOnBellHit: (fn) => { onBellHit = fn; },
    setOnBumperHit: (fn) => { onBumperHit = fn; },
    setOnWallHit: (fn) => { onWallHit = fn; },
  };
})();
