// Geometria do tabuleiro, cores e parâmetros de física — Sjoelen.
//
// Mesma estrutura do Curling de Mesa (pista sem gravidade, peça lançada por
// estilingue de dois pontos) — só a pista é bem mais alongada (sjoelbak
// oficial é 200x40cm, proporção ~5:1) e o alvo no topo não é um bullseye:
// são 4 compartimentos numerados, e a peça precisa de alinhamento horizontal
// E força suficiente pra atravessar o corredor até lá, não só acertar perto
// do centro como no Curling.

const BOARD = {
  width: 420,
  height: 1650,
  railThickness: 22,
  // Linha de lançamento e posição de repouso do disco — sem estilingue (ver
  // input.js: o lançamento agora é por gesto de arremesso, não puxar/soltar
  // um elástico), então não há mais âncoras fixas, só o ponto onde o disco
  // nasce a cada tacada.
  shootLineY: 1480,
  restY: 1440,
  // Reduzido de 28 pra dar mais folga entre discos nos compartimentos —
  // com até 12 discos por turno (e agora que tacadas fortes podem voltar
  // quicando), o tabuleiro congestionava rápido com o raio antigo.
  pieceRadius: 22,

  // Compartimentos: parede de fundo em compartmentBackY, corredores descem
  // até gateY — abaixo disso é pista aberta, sem parede nenhuma (a peça
  // precisa estar alinhada com um corredor E ter velocidade pra entrar).
  // compartmentBackY em 0 encosta as casas no topo do tabuleiro — a "parede
  // de fundo" (ver physics.js/render.js) já ocupa essa faixa, então fica
  // rente à moldura, sem vão de pista vazia acima dos números.
  compartmentBackY: 0,
  gateY: 260,
  dividerThickness: 14,
  // valores da esquerda pra direita — detalhe autêntico do sjoelbak oficial
  // (não é 1,2,3,4 em ordem; é assim mesmo no jogo real)
  slotOrder: [2, 3, 4, 1]
};

// Zona de arrasto/wind-up do arremesso (ver input.js): até onde o disco
// pode ser puxado antes da soltura. dragMinY é o limite "pra frente", mais
// perto dos compartimentos; dragMaxY é o limite "pra trás", perto do
// trilho de baixo. Vive em BOARD (não só dentro de input.js) porque
// render.js também usa pra desenhar a linha que marca esse limite.
BOARD.dragMinY = BOARD.restY - 260;
BOARD.dragMaxY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;

// Bordas x de cada compartimento, derivadas de BOARD (não hardcoded) —
// physics.js usa pra posicionar os divisores, render.js pra desenhar/rotular,
// game.js pra classificar onde uma peça parou.
BOARD.slots = (() => {
  const n = BOARD.slotOrder.length;
  const slotWidth = (BOARD.width - BOARD.dividerThickness * (n - 1)) / n;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const xMin = i * (slotWidth + BOARD.dividerThickness);
    const xMax = xMin + slotWidth;
    slots.push({
      value: BOARD.slotOrder[i],
      xMin,
      xMax,
      centerX: (xMin + xMax) / 2
    });
  }
  return slots;
})();
// Centro x de cada divisor interno (entre compartimentos consecutivos) —
// usado só pra criar as paredes em physics.js.
BOARD.dividerCenters = BOARD.slots.slice(0, -1).map((s, i) => (s.xMax + BOARD.slots[i + 1].xMin) / 2);

const PHYSICS = {
  gravity: 0,
  // Superfície BEM lisa de propósito — reproduz a característica real do
  // sjoelbak físico: um lançamento forte tem energia de sobra pra atravessar
  // o compartimento inteiro, bater na parede de fundo e voltar quicando até
  // a área azul (perto do jogador), igual ao tabuleiro de madeira real.
  // frictionAir — reduzido pra 0.006, depois ajustado ligeiramente pra
  // cima (0.008) a pedido: "quase bom", só um pouco mais de fricção. Menos
  // amortecimento DESLIZANDO no tabuleiro (o disco livre, sem colidir com
  // nada, mantém a força por mais tempo/distância) — separado de propósito
  // da dissipação em colisões entre discos (ver pieceCollisionDamping).
  frictionAir: 0.008,
  // IMPORTANTE (descoberto testando): o Matter.js usa o MENOR restitution
  // entre os dois corpos de uma colisão, não o maior — então baixar
  // pieceRestitution abaixo de railRestitution também amortecia a batida
  // disco-CONTRA-PAREDE (o disco vira o corpo "mole" do par), o que não
  // era o pedido (o pedido falava só de impacto ENTRE discos, não contra
  // parede). Por isso pieceRestitution fica >= railRestitution aqui — pra
  // colisão com trilho/parede continuar valendo o railRestitution de
  // sempre — e a dissipação EXTRA especificamente disco-disco é aplicada
  // à parte, na colisão (ver pieceCollisionDamping e collisionStart em
  // physics.js), não mexendo neste valor base.
  pieceRestitution: 0.3,
  railRestitution: 0.28,
  // Amortecimento adicional aplicado só no impacto disco-disco (ver
  // collisionStart em physics.js): multiplica a velocidade dos dois discos
  // no instante do choque, ANTES do Matter.js resolver o próprio bounce.
  // Descoberta testando: o PRÓPRIO resolver do Matter.js já é bem lossy
  // nessa colisão (com pieceRestitution=0.3, uma tacada de disco-contra-
  // disco já retém só ~24% da velocidade combinada, SEM nenhum
  // amortecimento extra daqui) — então esse fator tem pouca margem real
  // pra "apertar" mais (0.55 → ~13% de retenção, 0.75 → ~18%). Como ficou
  // forte demais em 0.55/0.75, subido bem perto de 1 (praticamente
  // desativado, só um toque leve por cima do natural do motor).
  pieceCollisionDamping: 0.9,
  density: 0.02,
  // Disco "realmente parado" — a pedido explícito, o jogo espera cruzar
  // ESTE limiar (baixo, preciso) antes de atualizar o placar e liberar a
  // próxima tacada, mesmo que isso demore alguns segundos num lançamento
  // forte (o rastro de decaimento com o atrito baixo é longo).
  settleVelocityThreshold: 0.08,
  maxLaunchSpeed: 46,
  // Arremesso por gesto (ver input.js): a velocidade do lançamento vem da
  // velocidade real do ponteiro no instante da soltura (últimos
  // flickWindowMs de movimento), não de uma distância de puxão até um ponto
  // fixo. flickSpeedScale converte px/ms de gesto em px/passo-de-física do
  // disco — calibrado pra um "flick" rápido e curto (tipo um peteleco de
  // pulso) já chegar perto do máximo, sem precisar de um arrasto longo.
  flickWindowMs: 120,
  flickSpeedScale: 14,
  // Abaixo disso o gesto é curto/lento demais pra ser uma tacada de
  // verdade — o disco volta pro ponto de repouso (mesmo espírito do
  // MIN_PULL antigo do estilingue).
  minFlickSpeed: 3
};

const COLORS = {
  woodLight: '#c8965a',
  woodMid: '#a9713f',
  woodDark: '#6b4226',
  cream: '#f0e6d2',
  creamDark: '#e2d3b0',
  navy: '#2d3652',
  navyLight: '#425076',
  brass: '#d4af37',
  brassDark: '#9c7a1f',
  yellow: '#e8b923',
  yellowDark: '#a5810c',
  // faixa da pista perto dos compartimentos — inspirada no tabuleiro físico
  // (metade azul perto do jogador, metade amarela perto do alvo)
  laneNear: '#3a5a86',
  laneNearDark: '#2d4568',
  laneFar: '#e8b923',
  laneFarDark: '#c79f16',
  // Piso de cada casinha numerada — separa visualmente as 4 casas do resto
  // da faixa amarela da pista.
  compartmentFloor: '#E65B1D'
};

const PLAYERS = {
  P1: 'p1',
  P2: 'p2'
};

const RULES = {
  pucksPerTurn: 12,
  roundsPerTurn: 3,
  setBonus: 20,
  // Desativada temporariamente a pedido — discos que erram o compartimento
  // agora só ficam na pista aberta até o fim do turno, sem repescagem em
  // rodadas 2/3 (ver endRound() em game.js). RULES.roundsPerTurn continua
  // aqui pra ativar de volta depois trocando esta flag.
  repescagemEnabled: false
};
