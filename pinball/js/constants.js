// Parâmetros de jogo — Pinball.
//
// A geometria do campo (paredes, guias, pinos, sino) vem inteira do vetor em
// playfield-path.js — physics.js e render.js leem as MESMAS formas dali.
// Aqui só ficam os números que não existem no vetor: raio da bola, ajuste
// fino dos flippers, posição do lançador, e as regras para separar "parede
// de verdade" de "parafuso decorativo" ao classificar as formas do SVG.

const BOARD = {
  width: PLAYFIELD_SVG_W,
  height: PLAYFIELD_SVG_H,

  ballRadius: 14,

  // Pivôs dos flippers — presos exatamente nos dois furos redondos que o
  // próprio vetor desenha no fundo das calhas laterais (medidos na arte:
  // ver findHoles em physics.js). O playfield3.svg não desenha mais
  // flippers/portinhola/elásticos — é tudo código agora.
  // Pedido explícito (rodada seguinte): 20% mais curtos, 50% mais grossos.
  // AVISO — esses dois furos ficam 353px afastados; com comprimento 178 a
  // boca entre as pontas ficava ~2px (bem fechada). Encurtando 20% (→142)
  // ela volta a abrir bastante (~100px, mais de 3x o diâmetro da bola) — o
  // mesmo problema de dreno-fácil documentado antes. Aplicado do jeito
  // pedido mesmo assim; se ficar frustrante em jogo, dá pra reabrir a
  // conversa sobre um pino/guia central ou reaproximar os pivôs.
  flipperPivots: {
    left: { x: 241.5, y: 1276.5 },
    right: { x: 594.5, y: 1276.5 },
  },
  flipperLength: 142,
  flipperThickness: 39,
  flipperRestDeg: 28, // repouso: aponta para baixo/para dentro
  flipperSweepDeg: 32, // sobe e para
  flipperSweepSpeed: 14, // rad/s subindo
  flipperReturnSpeed: 7, // rad/s voltando

  // Lançador: fundo do canal direito. Ligeiramente à esquerda do centro do
  // anel-guia perto do topo da calha (ver LAUNCH_GATE) — assim o contato
  // bola-guia desvia a bola pra ESQUERDA, saindo pelo vão aberto rumo ao
  // campo principal, e não de volta pra dentro da calha estreita.
  launcherX: 792,
  launcherRestY: 1300,
  launcherTravel: 158,
  launcherMinLaunchSpeed: 30,
  launcherMaxLaunchSpeed: 42,
  launcherChargeRate: 1.4,

  drainY: PLAYFIELD_SVG_H + 90,
  ballsPerGame: 3,
};

// A mola desenhada por código fica alguns pixels à esquerda/acima da posição
// "crua" do lançador, um pouco menor que o canal — só um ajuste visual (não
// mexe na física da bola).
const SPRING_VISUAL_OFFSET = { x: -6, y: -14 };
const SPRING_VISUAL_SCALE = 0.92;

// A calha do lançador, no vetor, é um tubo fechado — a bola bate lá em cima
// e voltava sem nunca escapar pro campo principal. Esta caixa exclui os
// segmentos de parede amostrados do vetor NESSA região específica — a bola
// sobe reta pelo tubo (sem colidir com nada aí dentro) até encontrar a
// curva de verdade mais acima, que já desvia ela pro campo sozinha.
// x0 era 650 (bem largo) e sem querer também tirava a física de uma aba/guia
// grande e legítima do vetor (x~650-767, a "forma que apoia a portinhola"
// que o usuário notou sem física nem borda — na real não é da portinhola,
// é a guia da pista direita, mas ficava dentro dessa caixa). O tubo em si só
// precisa da faixa mais estreita perto da parede externa (x>770) — a
// deflexão de verdade que joga a bola pro campo acontece bem mais acima
// (y<465, fora dessa caixa), então estreitar o x0 não afeta o lançamento.
const LAUNCH_GATE = { x0: 770, x1: 822, y0: 465, y1: 950 };

// A trava que fecha a calha (ver updateGate/buildGateWall em physics.js) só
// pode aparecer depois que a bola JÁ deixou o tubo de vez — antes ela ficava
// amarrada a LAUNCH_GATE.x0+60, mas quando x0 foi estreitado (650→770) essa
// margem (830) passou a cobrir o próprio launcherX (792): a trava nascia
// sobre o caminho de subida da bola, no primeiro update() após o disparo, e
// o lançamento reto virava um desvio prematuro. Valor próprio, sem depender
// de LAUNCH_GATE.x0.
const GATE_CLOSE_X = 700;

// "Portinhola" da calha do lançador: no pinball de verdade essa peça é uma
// aba de metal que abre pra deixar a bola sair rumo ao campo e fecha
// sozinha pra ela não voltar pro tubo. playfield3.svg não desenha mais essa
// aba (o usuário removeu manualmente) — é toda desenhada por código em
// render.js, na mesma posição/ângulo aproximados de onde ficava antes.
const LAUNCHER_DOOR = {
  x1: 745, y1: 600, // dobradiça — extremidade presa, lado do campo
  x2: 835, y2: 515, // ponta livre — lado da parede externa do tubo
  thickness: 24,
};

// A "forquilha" desenhada no vetor sob o sino é um sorriso de paredes quase
// planas — sem inclinação real, a bola cai lá depois de tocar o sino e
// simplesmente PARA, presa (só o anti-stall tira ela dali depois de vários
// segundos). Esta caixa exclui as paredes amostradas do vetor nessa região;
// BELL_FUNNEL abaixo desenha uma calha inclinada de verdade no lugar, que
// devolve a bola pro campo principal em vez de segurá-la.
const BELL_FUNNEL_MASK = { x0: 358, x1: 494, y0: 395, y1: 470 };
const BELL_FUNNEL = (() => {
  const cx = 425.7, apexY = 400;
  const spread = 78, dropY = 458;
  return [
    { x1: cx, y1: apexY, x2: cx - spread, y2: dropY },
    { x1: cx, y1: apexY, x2: cx + spread, y2: dropY },
  ];
})();

// A "forquilha" central é a escadinha de duas travessas sob o sino (medida
// na arte: dois trilhos verticais em x≈404-411 e x≈437-444, só 26px de vão
// entre eles — MENOS que o diâmetro da bola (28px). Confirmado por
// simulação: uma bola subindo bem no centro nunca alcança as travessas de
// verdade — ela esbarra primeiro na PONTA de baixo dos trilhos, bem mais
// embaixo (y≈660-670), e é ali que precisa ser pega. Por isso o sensor é uma
// faixa única, alta o bastante pra cobrir desde essa ponta de baixo até as
// travessas lá em cima, e um pouco mais larga que os trilhos.
const FORQUILHA_RUNGS = [
  { x: 424, y: 570, w: 80, h: 230 },
];
// Topo dos trilhos (onde a escada termina, perto do sino) — a bola é
// reposicionada aqui no tiro certeiro, já livre do vão estreito. Precisa
// ficar ACIMA do ápice da forquilha do sino (BELL_FUNNEL, ápice em y=400) —
// senão a bola reaparece DENTRO do V da calha e bate nela na mesma hora, em
// vez de subir livre até o sino.
const RAMP_EXIT_Y = 385;

const SLING_CX = PLAYFIELD_SVG_W / 2;
// O playfield3.svg não desenha mais as "asas" acima dos flippers (o usuário
// removeu os rebatedores manualmente) — posição escolhida à mão, um segmento
// curto logo acima de cada flipper, espelhado em torno do eixo do campo.
// Subidos no eixo Y e alongados ~15% (pedido explícito), esticando a partir
// do próprio centro do segmento pra manter a inclinação.
const PINBALL_SLINGS = (() => {
  const Lp = BOARD.flipperPivots.left;
  // Subidos de novo — "muito próximos dos flippers" no teste anterior.
  const raise = 70; // 58 → 70, "um pouco mais alto" (pedido explícito)
  const growth = 1.15;
  // "apart": desloca o segmento inteiro pra LONGE do centro (o espelho faz o
  // mesmo pro lado direito) — abre o vão entre os dois elásticos, que
  // reportado ficava "no caminho" da bola vindo do meio do campo.
  const apart = 14;
  const rawSpec = [[Lp.x - 6 - apart, Lp.y - 132 - raise], [Lp.x + 58 - apart, Lp.y - 18 - raise]];
  const rawMx = (rawSpec[0][0] + rawSpec[1][0]) / 2;
  const rawMy = (rawSpec[0][1] + rawSpec[1][1]) / 2;
  const spec = rawSpec.map(([x, y]) => [
    rawMx + (x - rawMx) * growth,
    rawMy + (y - rawMy) * growth,
  ]);
  const mirrorPt = ([x, y]) => [2 * SLING_CX - x, y];
  const withNormal = (pts) => {
    const [[x1, y1], [x2, y2]] = pts;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    let nx = dy / len;
    let ny = -dx / len;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    // A normal deve apontar pro miolo do campo (em direção ao centro/acima).
    if ((SLING_CX - mx) * nx + (Lp.y - 300 - my) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x1, y1, x2, y2, nx, ny };
  };
  return [withNormal(spec), withNormal(spec.map(mirrorPt))];
})();

// Os dois "pinos" de pontuação — não têm mais forma própria no vetor
// (viraram buracos redondos no compound path só, ver findHoles em
// physics.js); estas coordenadas (medidas na arte) dizem quais dos vários
// buracos redondos parecidos são de fato os pinos, e não um parafuso
// decorativo qualquer do mesmo tamanho. Furo real hoje em y=567 (Playfield
// 5.svg, mais um ajuste do usuário pra baixo). Uma tentativa de descer só
// por código (patch visual: apagar o furo antigo, redesenhar um novo alguns
// px abaixo) não ficou boa o bastante — revertida. Qualquer ajuste de
// posição agora exige outro redesenho no SVG (mesma limitação dos bumpers).
const POST_HOLE_POSITIONS = [
  { x: 282.5, y: 567 },
  { x: 565, y: 567 },
];

// Furos redondos que viram BUMPER DE ELÁSTICO (empurram a bola pra longe do
// próprio centro, tipo "jet bumper" de pinball de verdade) em vez de só
// ricochete passivo. Rodada de correção: os pontos anteriores incluíam por
// engano as PONTAS dos arcos decorativos (furo redondo no fim de cada arco,
// não um bumper de verdade) — revisado à mão contra a arte real:
// 1. o bumper mais alto de todos, sozinho no eixo central, acima do sino;
// 2. o par logo abaixo do sino (não era a ideia original, mas foi mantido —
//    só o contorno fica mais justo, ver ELASTIC_BUMPER_TIGHT_POSITIONS);
// 3. os 8 soltos abaixo dos arcos superiores (4 de cada lado) — SEM contar
//    as pontas dos próprios arcos;
// 4. o pino perto da calha do flipper direito.
const ELASTIC_BUMPER_POSITIONS = [
  // O mais alto de todos, centralizado, entre os dois arcos internos.
  { x: 426, y: 152.5 },
  // Par logo abaixo do sino.
  { x: 377, y: 413 },
  { x: 472, y: 413 },
  // 8 bumpers soltos abaixo dos arcos — 4 à esquerda, 4 à direita. Estas
  // coordenadas só CASAM com o furo redondo real da arte (tolerância de 12px
  // em findHoles/buildPlayfieldFromVector) — o corpo de colisão de verdade
  // nasce no centro do furo, não neste ponto, então não dá pra "mover" o
  // bumper só editando aqui (tentado uma vez: sumiu com a física dos 4
  // furos, porque a classificação por proximidade parou de casar). O par
  // mais externo (perto das asas laterais) que prendia a bola é resolvido à
  // parte, no kick (ver ELASTIC_BUMPER_KICK_BOOST em vez de reposicionar —
  // pedido explícito pra NÃO mexer na posição destes, só nos pinos).
  { x: 151.5, y: 487 },
  { x: 169, y: 530.5 },
  { x: 238.5, y: 506 },
  { x: 327, y: 506 },
  { x: 521, y: 506 },
  { x: 609, y: 506 },
  { x: 679, y: 530 },
  { x: 699, y: 487 },
  // Pino perto da calha do flipper direito — o ponto certo é o mais acima e
  // à direita dos dois candidatos (o outro era de um furo vizinho, errado).
  { x: 720, y: 1192.5 },
];

// Do grupo acima, o par logo abaixo do sino pede um contorno mais justo (o
// usuário aceitou mantê-los como bumper, mas não eram a ideia original) —
// usado só pra escolher uma largura de traço menor em drawElasticBumperBorders.
const ELASTIC_BUMPER_TIGHT_POSITIONS = [
  { x: 377, y: 413 },
  { x: 472, y: 413 },
];

// Par mais externo de cada lado (perto das asas laterais) — reportado
// prendendo a bola contra a asa. Não dá pra reposicionar o furo (ver nota
// acima), então o remédio é um kick mais forte só nestes dois, pra bola
// escapar do canto formado entre o bumper e a asa em vez de ficar
// pingando com pouca energia ali. Pedido explícito: NÃO reposicionar estes
// — uma tentativa de deslocar por código foi revertida.
const ELASTIC_BUMPER_KICK_BOOST = [
  { x: 151.5, y: 487 },
  { x: 169, y: 530.5 },
  { x: 699, y: 487 },
  { x: 679, y: 530 },
];

// Regras para classificar os buracos redondos do vetor (sino, pinos) sem
// depender de índices fixos de forma (o playfield3.svg não tem mais formas
// de topo separadas pra eles — ver findHoles em physics.js).
const SHAPE_RULES = {
  screwMaxSize: 17, // abaixo disso é parafuso/rebite, não colide
  circleTolerance: 0.22, // |largura-altura| / maior lado, pra considerar "redondo"
  bellMinSize: 60,
  bellMaxCy: 500,
};

const PHYSICS = {
  gravity: 1.05,
  frictionAir: 0.004,
  ballRestitution: 0.34,
  ballFriction: 0.02,
  ballDensity: 0.02,
  maxBallSpeed: 58,

  wallRestitution: 0.32,
  // Fina: o contorno amostrado já representa a linha real do vetor — uma
  // parede grossa demais "come" a largura útil dos canais estreitos (foi o
  // que travava o lançador: gap real ~39px, com espessura 20 sobrava só 19).
  wallThickness: 6,
  contourSpacing: 24, // amostragem do contorno das formas grandes do vetor
  contourJumpFactor: 3, // salto maior que isso = novo subpath (sem parede)

  postRestitution: 0.88,
  bellRestitution: 0.72,
  // O par de bumpers logo abaixo do sino fica quase embaixo dele — uma bola
  // caindo do sino pode aterrissar num deles e ser empurrada de volta pra
  // cima, direto no sino de novo (mesma geometria do "eco" dos elásticos,
  // ver elasticKickJitter). Cooldown mais largo (320→650) não impede o
  // ricochete físico, mas trava a pontuação repetida enquanto ele dura.
  bellCooldown: 650,
  flipperRestitution: 0.18,
  flipperKick: 0.9,

  slingThickness: 28,
  slingRestitution: 0.85,
  // Mesmo problema do "eco" dos bumpers de elástico (ver elasticKickJitter)
  // também acontecia aqui — a boca aberta entre os flippers deixa a bola
  // atravessar livre de um elástico lateral pro outro, e como cada um só
  // devolve pela normal FIXA, o ricochete simétrico virava um loop preso
  // (674 toques num teste, quase sem nunca cair). Mesmo remédio: kick mais
  // forte + variação aleatória no ângulo do empurrão.
  slingKick: 15,
  slingKickJitter: 0.28,
  slingMinSpeed: 2,
  slingCooldown: 130,

  // Bumpers de elástico (arcos ao redor do sino, par da calha esquerda, pino
  // da direita) — "jet bumper" clássico: no contato, empurra a bola pra
  // longe do PRÓPRIO centro (direção calculada por bumper, não fixa).
  // Reportado: às vezes a bola fica pulando de um bumper pro vizinho
  // indefinidamente (ricocheteia com energia parecida na direção oposta,
  // um "eco" que nunca escapa do grupo). Kick bem mais forte (9→16) resolve
  // a maior parte — a bola sai da vizinhança do grupo em vez de só trocar
  // de bumper — e um pouco de espalhamento aleatório no ângulo do empurrão
  // (elasticKickJitter, ver physics.js) impede o "eco" perfeito que mantinha
  // o loop simétrico.
  elasticRestitution: 0.82,
  elasticKick: 16,
  // 0.3→0.4: o par abaixo do sino precisa de mais espalhamento que o resto
  // do grupo pra não devolver a bola quase reto de volta ao sino toda vez
  // (ver bellCooldown, mesmo problema de loop bumper↔sino).
  elasticKickJitter: 0.4, // radianos de variação aleatória na direção do kick
  // 1.5→0.2: com o piso alto, uma bola que já perdeu energia (vários
  // ricochetes num canto apertado, tipo perto das asas) parava de receber
  // o "chute" ao ficar lenta — sobrava só o ricochete passivo (restitution),
  // fraco demais pra escapar de um bolso fechado. Ela ficava "presa",
  // reportado várias vezes. Piso quase zero: o bumper sempre empurra, por
  // mais devagar que a bola esteja — o cooldown (140ms) já evita disparo
  // absurdo demais.
  elasticMinSpeed: 0.2,
  elasticCooldown: 140,

  // Rampa da forquilha: só dispara quando a bola bate numa travessa vinda de
  // baixo, subindo quase reto — |vx|/velocidade precisa ficar abaixo de
  // rampAngleTolerance (quanto menor, mais exige um tiro certeiro e vertical
  // em vez de um raspão de lado).
  rampMinSpeed: 6,
  rampAngleTolerance: 0.35,
  rampShotSpeed: 24,
  rampCooldown: 400,
};

const COLORS = {
  // Creme igual ao logo/título da série (shared/theme.css --cream).
  field: '#f0e6d2',
  fieldEdge: '#e2d3b0',
  art: '#111664',
  cabinet: '#1c130c',
  woodLight: '#e7c99a',
  woodMid: '#c9a469',
  woodDark: '#8a6a3a',
  brass: '#d4af37',
  // Elástico dos rebatedores laterais: madeira clara, amarelo-alaranjada.
  slingLight: '#f3b25e',
  slingMid: '#e8922e',
  slingDark: '#b56a1a',
};
