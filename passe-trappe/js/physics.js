// Setup do mundo Matter.js: tabuleiro top-down, sem gravidade, atrito de ar
// baixo — mesma base do Curling de Mesa (ver curling-de-mesa/js/physics.js).
// A peça nova é a divisória central com vãos: diferente dos trilhos
// externos (fixos, criados uma vez em init()), ela precisa ser RECRIADA a
// cada troca de nível, já que gapCount/gapWidth mudam por nível.

const GamePhysics = (function () {
  const { Engine, Bodies, Body, Composite } = Matter;

  // Categoria de colisão exclusiva do elástico (ver buildElasticWalls) —
  // por padrão TODO corpo colide com ela (máscara cheia), então só o disco
  // sendo puxado no momento precisa de uma máscara sem esse bit
  // (setElasticPassthrough), pra atravessar reto durante o puxão.
  const CATEGORY_ELASTIC = 0x0002;
  const FULL_MASK = 0xFFFFFFFF;

  let engine, world;
  let dividerBodies = [];

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
      // trilho superior (atrás da máquina)
      Bodies.rectangle(
        BOARD.width / 2,
        -BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      ),
      // trilho inferior (atrás do jogador)
      Bodies.rectangle(
        BOARD.width / 2,
        BOARD.height + BOARD.railThickness / 2,
        BOARD.width + BOARD.railThickness * 2,
        BOARD.railThickness,
        { isStatic: true, restitution: PHYSICS.railRestitution, label: 'rail' }
      )
    ];

    Composite.add(world, rails);
    Composite.add(world, buildElasticWalls());

    const isWall = (label) => label === 'rail' || label === 'divider' || label === 'elastic';
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

  // Parede física do elástico — fixa a vida toda do jogo (não muda por
  // nível, ao contrário da divisória), uma por lado. Discos batem e
  // ricocheteiam nela; só o disco sendo puxado no momento (via
  // setElasticPassthrough) atravessa pra ser posicionado atrás da linha.
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
      Bodies.rectangle(BOARD.width / 2, BOARD.playerAnchorY, span, thickness, opts),
      Bodies.rectangle(BOARD.width / 2, BOARD.aiAnchorY, span, thickness, opts)
    ];
  }

  // Liga/desliga a passagem de UM disco específico pela parede do
  // elástico — chamado ao pegar/soltar (jogador) ou ao iniciar/disparar a
  // mira (máquina).
  function setElasticPassthrough(body, enabled) {
    body.collisionFilter.mask = enabled ? (FULL_MASK & ~CATEGORY_ELASTIC) : FULL_MASK;
  }

  // Recria a divisória central a partir dos vãos do nível atual (ver
  // BOARD.computeGaps/computeDividerSegments em constants.js — MESMA
  // geometria que render.js usa pra desenhar, nunca duas fontes de verdade).
  function rebuildDivider(gaps) {
    if (dividerBodies.length) {
      Composite.remove(world, dividerBodies);
      dividerBodies = [];
    }
    const segments = BOARD.computeDividerSegments(gaps);
    dividerBodies = segments.map((seg) => {
      const w = seg.x1 - seg.x0;
      return Bodies.rectangle(
        seg.x0 + w / 2,
        BOARD.dividerY,
        w,
        BOARD.dividerThickness,
        { isStatic: true, restitution: PHYSICS.dividerRestitution, label: 'divider' }
      );
    });
    Composite.add(world, dividerBodies);
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

  // Sub-passos em vez de uma chamada única — um disco a maxLaunchSpeed
  // (até 50px por quadro) contra um trilho fino (22px) ou o elástico (6px)
  // é um caso clássico de "tunelamento": rápido demais pra o Matter.js
  // detectar a colisão num único passo grande, o disco pula direto pra
  // fora do tabuleiro (bug real reportado: "lançamentos jogaram o disco
  // diretamente para fora do canvas"). Rodar o mesmo delta total em passos
  // menores mantém a velocidade/sensação do jogo idêntica, só que o motor
  // checa colisão com mais frequência — o disco não consegue mais
  // atravessar uma parede fina de uma vez.
  const SUBSTEPS = 4;
  function update(delta) {
    const subDelta = delta / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      Engine.update(engine, subDelta);
    }
  }

  return {
    init,
    rebuildDivider,
    createPiece,
    removePiece,
    isOutOfBounds,
    isSettled,
    setElasticPassthrough,
    update,
    getWorld: () => world
  };
})();
