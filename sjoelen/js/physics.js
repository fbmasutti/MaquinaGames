// Setup do mundo Matter.js: tabuleiro top-down, sem gravidade, atrito de ar
// mais alto que o Curling (pista comprida — calibrar força é parte do jogo).

const GamePhysics = (function () {
  const { Engine, World, Bodies, Body, Composite } = Matter;

  let engine, world;
  const pieceBodies = new Map(); // body.id -> { id }

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
      // trilho inferior (atrás da linha de lançamento)
      Bodies.rectangle(
        BOARD.width / 2,
        BOARD.height + BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      ),
      // parede de fundo dos compartimentos (não é um rail liso de ponta a
      // ponta como no Curling — fica bem mais acima, atrás dos 4 corredores)
      Bodies.rectangle(
        BOARD.width / 2,
        BOARD.compartmentBackY - BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      )
    ];

    // Divisores entre os 4 compartimentos — só vão até gateY; abaixo disso é
    // pista aberta, então a peça precisa estar alinhada com um corredor E
    // ter força pra atravessar o trecho livre, não só "acertar perto".
    const dividerHeight = BOARD.gateY - BOARD.compartmentBackY;
    const dividers = BOARD.dividerCenters.map((cx) => Bodies.rectangle(
      cx,
      BOARD.compartmentBackY + dividerHeight / 2,
      BOARD.dividerThickness,
      dividerHeight,
      { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
    ));

    Composite.add(world, [...rails, ...dividers]);

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

  function createPiece(x, y, id) {
    const body = Bodies.circle(x, y, BOARD.pieceRadius, {
      restitution: PHYSICS.pieceRestitution,
      friction: 0,
      frictionAir: PHYSICS.frictionAir,
      frictionStatic: 0,
      density: PHYSICS.density,
      label: 'piece'
    });
    pieceBodies.set(body.id, { id });
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

  // Um lançamento forte (até maxLaunchSpeed) pode mover a peça mais do que
  // a espessura de um trilho/divisor (22px) num único passo de física —
  // isso deixa o Matter.js "pular" a colisão (a peça atravessa a parede
  // sem detectar o choque, o famoso "tunneling"). Dividir cada quadro em
  // vários sub-passos menores mantém o deslocamento por passo bem abaixo
  // da espessura de qualquer parede, então a colisão nunca é pulada,
  // mesmo no lançamento mais forte possível.
  const SUBSTEPS = 4;
  function update(delta) {
    const subDelta = delta / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      Engine.update(engine, subDelta);
    }
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
