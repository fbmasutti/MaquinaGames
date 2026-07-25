// Setup do mundo Matter.js: tabuleiro top-down, sem gravidade, atrito de ar baixo.

const GamePhysics = (function () {
  const { Engine, World, Bodies, Body, Composite } = Matter;

  let engine, world;
  const pieceBodies = new Map(); // body.id -> { player, id }

  function init() {
    engine = Engine.create();
    world = engine.world;
    world.gravity.x = 0;
    world.gravity.y = 0;

    const rails = [
      // trilho esquerdo
      Bodies.rectangle(
        -BOARD.railThickness / 2,
        BOARD.height / 2,
        BOARD.railThickness,
        BOARD.height + BOARD.railThickness * 2,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      ),
      // trilho direito
      Bodies.rectangle(
        BOARD.width + BOARD.railThickness / 2,
        BOARD.height / 2,
        BOARD.railThickness,
        BOARD.height + BOARD.railThickness * 2,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      ),
      // trilho superior (atrás do alvo) — a peça é sempre presa ao tabuleiro,
      // um tiro forte demais apenas rebate de volta em vez de sair
      Bodies.rectangle(
        BOARD.width / 2,
        -BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      ),
      // trilho inferior (atrás da linha de lançamento)
      Bodies.rectangle(
        BOARD.width / 2,
        BOARD.height + BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      )
    ];

    Composite.add(world, rails);

    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const isRailHit =
          (bodyA.label === 'piece' && bodyB.label === 'rail') ||
          (bodyA.label === 'rail' && bodyB.label === 'piece');
        const isPieceHit = bodyA.label === 'piece' && bodyB.label === 'piece';
        if (!isRailHit && !isPieceHit) continue;
        const speed = Math.hypot(
          bodyA.velocity.x - bodyB.velocity.x,
          bodyA.velocity.y - bodyB.velocity.y
        );
        if (speed < 1.5) continue;
        if (isPieceHit) {
          GameAudio.playClack(Math.min(1, speed / 45));
        } else {
          GameAudio.playKnock(Math.min(1, speed / 45));
        }
      }
    });

    return { engine, world };
  }

  function createPiece(x, y, player, id) {
    const body = Bodies.circle(x, y, BOARD.pieceRadius, {
      restitution: PHYSICS.pieceRestitution,
      friction: 0,
      frictionAir: PHYSICS.frictionAir,
      frictionStatic: 0,
      density: PHYSICS.density,
      label: 'piece'
    });
    pieceBodies.set(body.id, { player, id });
    Composite.add(world, body);
    return body;
  }

  function removePiece(body) {
    pieceBodies.delete(body.id);
    Composite.remove(world, body);
  }

  function isOutOfBounds(body) {
    const p = body.position;
    const margin = BOARD.pieceRadius;
    return (
      p.x < -margin ||
      p.x > BOARD.width + margin ||
      p.y < -margin ||
      p.y > BOARD.height + margin
    );
  }

  function isSettled(body) {
    const v = body.velocity;
    return Math.hypot(v.x, v.y) < PHYSICS.settleVelocityThreshold;
  }

  function update(delta) {
    Engine.update(engine, delta);
  }

  function getMeta(body) {
    return pieceBodies.get(body.id);
  }

  return {
    init,
    createPiece,
    removePiece,
    isOutOfBounds,
    isSettled,
    update,
    getMeta,
    getWorld: () => world
  };
})();
