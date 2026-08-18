// Geometria do tabuleiro, cores e parâmetros de física — 2P Shuffleboard.
//
// A mesa da foto de referência: comprida, com trilhos nos quatro lados, um
// elástico de duas âncoras em CADA ponta (mecânica do Passe-Trappe) e um
// alvo de anéis bem no MEIO (pontuação do Curling de Mesa). Cada jogador
// ocupa uma ponta e joga em turnos, um disco por vez, tentando parar seus
// discos o mais perto possível do centro — ou tirar de lá os do adversário.

const BOARD = {
  width: 420,
  height: 1200,
  railThickness: 22,
  pieceRadius: 30,
  discsPerPlayer: 5,
  // Elástico preso na borda do tabuleiro (encostado nos trilhos laterais),
  // ocupando o plano horizontal inteiro — igual à foto e ao Passe-Trappe.
  anchorInset: 0,
  // Distância livre ATRÁS da âncora, pra puxar o elástico. Ao contrário do
  // Passe-Trappe (onde era propositalmente apertada, 65 pra um puxão de 50),
  // aqui ela cabe o puxão máximo INTEIRO (maxPullDistance + pieceRadius):
  // num jogo de precisão a força máxima precisa ser de fato alcançável, não
  // cortada pelo clamp do trilho de trás. E é generosa de propósito — o
  // tabuleiro aparece na tela com ~55% do tamanho lógico, então um curso
  // curto de puxão viraria poucos pixels de dedo, com controle grosseiro
  // demais pra um jogo que se decide por centímetros.
  anchorBackRoom: 150,
  // Raio de captura do disco da vez. Bem generoso de propósito: só existe UM
  // disco agarrável por vez, então não há risco de pegar o errado, e o
  // tabuleiro aparece a menos da metade do tamanho lógico no celular (o
  // disco fica com ~28px de tela). Como o arrasto é relativo (ver input.js),
  // tocar longe do centro não desloca o disco — só começa o gesto.
  grabRadius: 30 * 3.5
};

// Alvo exatamente no centro geométrico da mesa — os dois jogadores têm a
// mesma distância de tiro.
BOARD.targetX = BOARD.width / 2;
BOARD.targetY = BOARD.height / 2;
BOARD.targetRings = [
  { radius: 190, score: 5 },
  { radius: 140, score: 10 },
  { radius: 90, score: 15 },
  { radius: 45, score: 20 }
];

// Faixa creme central da foto (o painel claro onde os anéis são impressos),
// com uma folga além do anel externo.
BOARD.panelY0 = BOARD.targetY - 215;
BOARD.panelY1 = BOARD.targetY + 215;

// Âncoras dos dois estilingues — mesmo padrão de playerAnchorY/aiAnchorY do
// Passe-Trappe, agora simétricas (nenhum lado é "o da máquina": no modo
// hot-seat as duas pontas são humanas).
BOARD.p1AnchorY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius - BOARD.anchorBackRoom;
BOARD.p2AnchorY = BOARD.railThickness + BOARD.pieceRadius + BOARD.anchorBackRoom;

// Linha vermelha de lançamento à frente de cada elástico (as duas linhas
// vermelhas da foto) — puramente decorativa, sem efeito na física.
BOARD.foulLineOffset = 62;

const PHYSICS = {
  gravity: 0,
  frictionAir: 0.03,
  pieceRestitution: 0.5,
  railRestitution: 0.35,
  // O elástico é uma parede física de verdade (ver physics.js) — discos
  // rebatidos batem nele e voltam pro campo, em vez de ficarem encalhados
  // atrás da linha de tiro.
  elasticRestitution: 0.5,
  density: 0.02,
  // Um pouco mais apertado que o do Passe-Trappe (0.5): lá o placar de
  // velocidade não podia esperar a "cauda" lenta do amortecimento; aqui o
  // turno só passa quando TUDO parou, e um disco ainda rolando devagar pro
  // centro muda a pontuação — vale esperar mais um pouco pra ser justo.
  settleVelocityThreshold: 0.35,
  maxPullDistance: 120,
  // MEDIDOS dentro do jogo rodando, não estimados nem calculados à parte:
  // uma série de arremessos reais a partir da âncora, com puxões de 20 a 120,
  // anotando onde cada disco PAROU. O ajuste na faixa útil (v de 8 a 23) é
  //
  //   distância a partir da âncora ≈ 26.9 * v + 35.9
  //
  // Vale insistir no "dentro do jogo": a primeira calibração foi feita num
  // mundo isolado, medindo o percurso livre do disco, e deu ~33px por
  // unidade de velocidade — 20% a mais. A diferença é que o disco não parte
  // da âncora, e sim do ponto PUXADO, atrás dela; medir o arremesso inteiro
  // (puxar → soltar → parar) embute isso e é exatamente o que a IA precisa
  // saber pra mirar. Com o número errado ela erraria sempre pro mesmo lado.
  //
  // Aviso: mudar frictionAir, SUBSTEPS, maxPullDistance ou a posição das
  // âncoras invalida os dois números — medir de novo.
  //
  // maxLaunchSpeed 23 saiu dessa medição, não de tentativa e erro:
  //   - puxão máximo percorre ~654px e para bem antes dos 796px entre as
  //     duas âncoras (força total não invade a linha do adversário);
  //   - o tiro que para no centro (398px da âncora) precisa de v≈13.5, ou
  //     seja ~59% do curso do puxão — o ponto ótimo cai no meio do gesto,
  //     com margem de sobra pros dois lados, em vez de espremido na ponta.
  maxLaunchSpeed: 23,
  travelPerSpeed: 26.9,
  travelIntercept: 35.9
};

// Velocidade de lançamento pra parar (aproximadamente) a uma dada distância
// — inversa da reta medida acima. É o que deixa a IA calcular força de
// verdade em vez de sortear (ver ai.js), e ignora colisões no caminho: um
// disco no meio do percurso sempre encurta o resultado.
PHYSICS.speedForDistance = function speedForDistance(distance) {
  const v = (distance - PHYSICS.travelIntercept) / PHYSICS.travelPerSpeed;
  return Math.max(0, Math.min(PHYSICS.maxLaunchSpeed, v));
};

const COLORS = {
  // Moldura / gabinete (madeira escura, igual ao resto da série)
  woodLight: '#c8965a',
  woodMid: '#a9713f',
  woodDark: '#6b4226',
  // Superfície de jogo: madeira BEM mais clara que a moldura, com veio no
  // sentido do comprimento — as duas pontas da mesa na foto.
  surfaceWoodLight: '#e0bd8e',
  surfaceWoodMid: '#cfa471',
  // Painel central impresso (o creme esverdeado da foto)
  panelCream: '#e9eddb',
  panelCreamDark: '#dbe0c9',
  cream: '#f0e6d2',
  creamDark: '#e2d3b0',
  navy: '#2d3652',
  brass: '#d4af37',
  brassDark: '#9c7a1f',
  lineRed: '#c0392b',
  elasticCord: '#241a12',
  // Discos: madeira com miolo colorido — vermelho e azul, como na foto.
  discWood: '#c99a63',
  discWoodDark: '#7a5230',
  red: '#c0392b',
  redDark: '#7d241a',
  blue: '#2b4c9b',
  blueDark: '#172c5e'
};

const PLAYERS = {
  RED: 'red',
  BLUE: 'blue'
};

// Quem joga de qual ponta. backwardSign: +1 quando "atrás da âncora" é y
// CRESCENTE (jogador de baixo), -1 quando é y DECRESCENTE (o de cima) —
// mesmo parâmetro que computeShot já recebia no Passe-Trappe.
const SIDES = {
  [PLAYERS.RED]: { anchorY: BOARD.p1AnchorY, backwardSign: 1, label: 'VERMELHO' },
  [PLAYERS.BLUE]: { anchorY: BOARD.p2AnchorY, backwardSign: -1, label: 'AZUL' }
};

for (const key of Object.keys(SIDES)) {
  const side = SIDES[key];
  side.anchorL = { x: BOARD.anchorInset, y: side.anchorY };
  side.anchorR = { x: BOARD.width - BOARD.anchorInset, y: side.anchorY };
  side.anchorMid = { x: BOARD.width / 2, y: side.anchorY };
  // A linha vermelha fica ADIANTE da âncora (rumo ao centro).
  side.foulLineY = side.anchorY - side.backwardSign * BOARD.foulLineOffset;
}
