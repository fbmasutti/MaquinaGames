// Setup do mundo Matter.js: tabuleiro top-down, sem gravidade — mesma base
// do Passe-Trappe (ver passe-trappe/js/physics.js), MENOS a divisória
// central (aqui o meio da mesa é campo aberto, é onde fica o alvo) e com as
// duas paredes de elástico fixas a vida toda (não mudam por nível).

const GamePhysics = (function () {
  const { Engine, Bodies, Composite } = Matter;

  // Categoria de colisão exclusiva do elástico — por padrão TODO corpo
  // colide com ela, então só o disco sendo puxado no momento precisa de uma
  // máscara sem esse bit (setElasticPassthrough), pra atravessar durante o
  // puxão e na saída do tiro.
  const CATEGORY_ELASTIC = 0x0002;
  const FULL_MASK = 0xFFFFFFFF;

  let engine, world;

  function init() {
    engine = Engine.create();
    world = engine.world;
    world.gravity.x = 0;
    world.gravity.y = 0;

    const railOpts = { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' };
    const rails = [
      // trilho esquerdo
      Bodies.rectangle(
        -BOARD.railThickness / 2, BOARD.height / 2,
        BOARD.railThickness, BOARD.height + BOARD.railThickness * 2, railOpts
      ),
      // trilho direito
      Bodies.rectangle(
        BOARD.width + BOARD.railThickness / 2, BOARD.height / 2,
        BOARD.railThickness, BOARD.height + BOARD.railThickness * 2, railOpts
      ),
      // trilho de cima (atrás do jogador azul)
      Bodies.rectangle(
        BOARD.width / 2, -BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2, BOARD.railThickness, railOpts
      ),
      // trilho de baixo (atrás do jogador vermelho)
      Bodies.rectangle(
        BOARD.width / 2, BOARD.height + BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2, BOARD.railThickness, railOpts
      )
    ];

    Composite.add(world, rails);
    Composite.add(world, buildElasticWalls());

    const isWall = (label) => label === 'rail' || label === 'elastic';
    Matter.Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        const isWallHit =
          (bodyA.label === 'piece' && isWall(bodyB.label)) ||
          (isWall(bodyA.label) && bodyB.label === 'piece');
        const isPieceHit = bodyA.label === 'piece' && bodyB.label === 'piece';
        if (!isWallHit && !isPieceHit) continue;
        const speed = Math.hypot(
          bodyA.velocity.x - bodyB.velocity.x,
          bodyA.velocity.y - bodyB.velocity.y
        );
        if (speed < 1.2) continue;
        // Normalizado pela velocidade máxima REAL deste jogo (bem menor que
        // a do Passe-Trappe) — senão todo impacto soaria fraquinho.
        const intensity = Math.min(1, speed / (PHYSICS.maxLaunchSpeed * 0.9));
        if (isPieceHit) GameAudio.playClack(intensity);
        else GameAudio.playKnock(intensity);
      }
    });

    return { engine, world };
  }

  // Parede física do elástico, uma por ponta. Discos rebatidos batem nela e
  // voltam pro campo; só o disco sendo puxado/recém-lançado atravessa (ver
  // setElasticPassthrough).
  function buildElasticWalls() {
    const thickness = 6;
    const span = BOARD.width - BOARD.anchorInset * 2;
    const opts = {
      isStatic: true,
      restitution: PHYSICS.elasticRestitution,
      label: 'elastic',
      collisionFilter: { category: CATEGORY_ELASTIC, mask: FULL_MASK }
    };
    return [
      Bodies.rectangle(BOARD.width / 2, BOARD.p1AnchorY, span, thickness, opts),
      Bodies.rectangle(BOARD.width / 2, BOARD.p2AnchorY, span, thickness, opts)
    ];
  }

  function setElasticPassthrough(body, enabled) {
    body.collisionFilter.mask = enabled ? (FULL_MASK & ~CATEGORY_ELASTIC) : FULL_MASK;
  }

  function createPiece(x, y) {
    const body = Bodies.circle(x, y, BOARD.pieceRadius, {
      restitution: PHYSICS.pieceRestitution,
      friction: 0,
      frictionAir: PHYSICS.frictionAir,
      frictionStatic: 0,
      density: PHYSICS.density,
      label: 'piece'
    });
    Composite.add(world, body);
    return body;
  }

  function removePiece(body) {
    Composite.remove(world, body);
  }

  function isOutOfBounds(body) {
    const p = body.position;
    const margin = BOARD.pieceRadius;
    return (
      p.x < -margin || p.x > BOARD.width + margin ||
      p.y < -margin || p.y > BOARD.height + margin
    );
  }

  function isSettled(body) {
    const v = body.velocity;
    return Math.hypot(v.x, v.y) < PHYSICS.settleVelocityThreshold;
  }

  // Sub-passos em vez de uma chamada única — lição do Passe-Trappe: um disco
  // rápido contra uma parede fina (o elástico tem 6px) é um caso clássico de
  // tunelamento, o disco pula direto pro outro lado. ATENÇÃO: o Matter
  // aplica frictionAir uma vez por Engine.update, então mudar SUBSTEPS muda
  // o amortecimento efetivo — e portanto PHYSICS.travelPerSpeed, que precisa
  // ser recalibrado junto (ver constants.js).
  const SUBSTEPS = 4;
  function update(delta) {
    const subDelta = delta / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      Engine.update(engine, subDelta);
    }
  }

  return {
    init,
    createPiece,
    removePiece,
    isOutOfBounds,
    isSettled,
    setElasticPassthrough,
    update,
    getWorld: () => world
  };
})();
