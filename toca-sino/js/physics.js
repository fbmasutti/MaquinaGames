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

  function buildDome() {
    const segs = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a1 = Math.PI - (Math.PI * i) / N;
      const a2 = Math.PI - (Math.PI * (i + 1)) / N;
      const x1 = BOARD.fieldCenterX + Math.cos(a1) * BOARD.domeRadius;
      const y1 = BOARD.domeBaseY - Math.sin(a1) * BOARD.domeRadius;
      const x2 = BOARD.fieldCenterX + Math.cos(a2) * BOARD.domeRadius;
      const y2 = BOARD.domeBaseY - Math.sin(a2) * BOARD.domeRadius;
      segs.push(wallSegment(x1, y1, x2, y2));
    }
    return segs;
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
        density: 0.004,
        label: 'flipper',
        inertia: Infinity, // não deixa colisão com a bola girar o flipper sozinho
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

    // Parede esquerda do campo
    statics.push(wallSegment(BOARD.fieldLeft, BOARD.domeBaseY, BOARD.fieldLeft, BOARD.height + 40));
    // Divisória campo/canal (com vão logo abaixo da cúpula pra bola entrar)
    statics.push(wallSegment(BOARD.fieldRight, BOARD.domeBaseY + 24, BOARD.fieldRight, BOARD.height + 40));
    // Parede externa do canal do lançador
    statics.push(wallSegment(BOARD.fieldRightOuter, BOARD.wall, BOARD.fieldRightOuter, BOARD.height + 40));

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

  // O flipper tem massa (pra transferir impulso de verdade pra bola na
  // colisão), mas isso significa que a gravidade cria um torque de pêndulo
  // nele — sem correção, essa gravidade briga com o ângulo alvo e o flipper
  // nunca se estabiliza. Em vez de só setar angularVelocity e deixar o motor
  // de física integrar (onde a gravidade entra na disputa), a cada passo
  // calculamos o próximo ângulo diretamente e setamos ângulo + velocidade
  // condizente — cinemático de verdade, a gravidade não tem chance de atuar.
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
      const vel = dtSeconds > 0
        ? { x: (newCenter.x - oldCenter.x) / dtSeconds, y: (newCenter.y - oldCenter.y) / dtSeconds }
        : { x: 0, y: 0 };
      const angVel = dtSeconds > 0 ? (next - current) / dtSeconds : 0;

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
