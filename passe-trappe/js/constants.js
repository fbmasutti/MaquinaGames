// Geometria do tabuleiro, cores e parâmetros de física — Passe-Trappe.
//
// Tabuleiro vertical dividido ao meio por uma divisória com vãos (a
// "trappe"): jogador embaixo, máquina em cima, cada um atira discos com um
// estilingue de 2 âncoras (mesma mecânica do Curling de Mesa) tentando
// passar os PRÓPRIOS discos pro lado do outro. Diferente dos outros jogos
// da série, aqui não há "um disco ativo por vez" — é um jogo de
// velocidade, vários discos podem estar em voo/repousando ao mesmo tempo.

const BOARD = {
  width: 420,
  zoneHeight: 500, // altura de cada metade (jogador embaixo, máquina em cima)
  dividerThickness: 30,
  railThickness: 22,
  pieceRadius: 24,
  // discsPerSide NÃO mora mais aqui — varia por nível (ver LEVELS em
  // levels.js: começa em 8, sobe pra 10 só no nível final).
  // Elástico preso bem na borda do tabuleiro (encostado nos trilhos
  // laterais), ocupando o plano horizontal inteiro — como pedido, igual à
  // foto de referência, em vez de recuado da lateral.
  anchorInset: 0,
  // Raio de captura do estilingue (também usado por game.js pra achar o
  // disco mais próximo do toque, já que agora QUALQUER disco em repouso
  // do próprio lado pode ser pego, não só um único "ativo").
  grabRadius: 24 * 1.8,
  // Distância livre atrás da âncora, pra puxar o elástico — precisa ser um
  // pouco maior que PHYSICS.maxPullDistance (senão o disco esbarra no
  // trilho de trás antes da força máxima), mas propositalmente pequena:
  // o elástico fica perto da borda pra sobrar mais campo central aberto.
  anchorBackRoom: 65,
  // Deslocamento da fileira de discos "em espera" em relação à âncora —
  // pra DENTRO do campo central (não atrás da âncora, onde agora o
  // elástico é uma parede física de verdade).
  restRowOffset: 55
};

BOARD.height = BOARD.zoneHeight * 2 + BOARD.dividerThickness;
BOARD.dividerY = BOARD.height / 2;
BOARD.dividerTopY = BOARD.dividerY - BOARD.dividerThickness / 2;
BOARD.dividerBottomY = BOARD.dividerY + BOARD.dividerThickness / 2;

// Âncoras do estilingue do jogador (perto da borda inferior) e da máquina
// (espelhadas, perto da borda superior) — mesmo padrão de anchorL/anchorR/
// anchorMid do Curling de Mesa (ver input.js), agora com folga real atrás
// pra puxar (ver anchorBackRoom acima).
BOARD.playerAnchorY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius - BOARD.anchorBackRoom;
BOARD.aiAnchorY = BOARD.railThickness + BOARD.pieceRadius + BOARD.anchorBackRoom;

// Vãos da divisória — ÚNICA fonte de verdade pra física (physics.js) E
// desenho (render.js), nunca hardcoded duas vezes (lição aplicada do
// Pinball: physics/render sempre lendo a MESMA geometria, nunca duas
// versões que podem desalinhar).
//
// gapCount 2: vãos nas duas pontas, encostados nos trilhos laterais —
// reproduz a foto de referência do Gallep (a barra tem um entalhe onde
// encontra cada trilho). gapCount 1: vão único centralizado, mais difícil.
BOARD.computeGaps = function computeGaps(gapCount, gapWidth) {
  if (gapCount === 2) {
    return [
      { x0: 0, x1: gapWidth },
      { x0: BOARD.width - gapWidth, x1: BOARD.width }
    ];
  }
  const center = BOARD.width / 2;
  return [{ x0: center - gapWidth / 2, x1: center + gapWidth / 2 }];
};

// Segmentos SÓLIDOS da divisória (complemento dos vãos) — physics.js vira
// cada um num Bodies.rectangle, render.js desenha cada um como madeira.
BOARD.computeDividerSegments = function computeDividerSegments(gaps) {
  const sorted = [...gaps].sort((a, b) => a.x0 - b.x0);
  const segments = [];
  let cursor = 0;
  for (const g of sorted) {
    if (g.x0 > cursor) segments.push({ x0: cursor, x1: g.x0 });
    cursor = Math.max(cursor, g.x1);
  }
  if (cursor < BOARD.width) segments.push({ x0: cursor, x1: BOARD.width });
  return segments;
};

const PHYSICS = {
  gravity: 0,
  // Amortecimento maior a pedido — os discos precisam parar de verdade
  // mais rápido, não ficar deslizando/quicando por um bom tempo.
  frictionAir: 0.03,
  pieceRestitution: 0.55,
  railRestitution: 0.35,
  dividerRestitution: 0.5,
  // O elástico agora é uma parede física de verdade (ver
  // physics.js/buildElasticWalls) — os discos batem nela e ricocheteiam,
  // só o disco sendo puxado no momento atravessa (ver
  // setElasticPassthrough).
  elasticRestitution: 0.5,
  density: 0.02,
  // Mais alto do que pareceria necessário de propósito: com o atrito do
  // ar atual, a velocidade decai exponencialmente e a "cauda" final (de
  // ~1 até perto de 0) demora desproporcionalmente mais que o resto —
  // tempo que o disco já está visualmente parado, mas o placar/fim de
  // nível continua esperando (queixa real: "o tempo pra determinar o
  // vencedor... está um pouco longo"). Um limiar maior classifica como
  // "parado" bem mais cedo, sem mudar nada da física durante o voo (só
  // esse corte é mais generoso).
  settleVelocityThreshold: 0.5,
  // Reduzido junto com anchorBackRoom — o elástico ficou mais perto da
  // borda, então o puxão máximo também encolhe pra caber com folga real
  // (ver comentário de anchorBackRoom em BOARD acima).
  maxPullDistance: 50,
  launchPowerMultiplier: 5.6,
  maxLaunchSpeed: 50
};

const COLORS = {
  woodLight: '#c8965a',
  woodMid: '#a9713f',
  woodDark: '#6b4226',
  cream: '#f0e6d2',
  creamDark: '#e2d3b0',
  navy: '#2d3652',
  brass: '#d4af37',
  brassDark: '#9c7a1f',
  // Disco único — SEM distinção de cor entre "meu disco" e "disco da
  // máquina": na versão analógica não existe essa diferença, porque não há
  // posse fixa, só importa de que lado do tabuleiro o disco está agora.
  // Tom de madeira mais claro a pedido (era quase preto, difícil de ler
  // contra o fundo escuro do gabinete).
  discWood: '#b9834c',
  discWoodDark: '#7a5230',
  // Destaque do disco agarrado pelo jogador (clicado) — tom bem mais claro
  // que o disco normal, no lugar do elástico "ir até ele" (ver drawSling).
  discWoodHighlight: '#e6b57c',
  // Cordão do elástico — igual dos dois lados (na foto de referência os
  // dois cordões são o mesmo barbante escuro, sem cor por jogador).
  elasticCord: '#241a12',
  // Superfície de jogo azul pastel — diferencial visual deste jogo em
  // relação ao creme usado em Curling/Sjoelen.
  surfaceBlue: '#bfe0ec',
  surfaceBlueDark: '#9cc9da'
};

// Não são mais "donos" de disco (nenhum disco pertence permanentemente a
// ninguém) — são só os identificadores das duas ZONAS do tabuleiro,
// usados pra saber de que lado um disco está agora e quem pode pegá-lo.
const ZONES = {
  PLAYER: 'player',
  AI: 'ai'
};
