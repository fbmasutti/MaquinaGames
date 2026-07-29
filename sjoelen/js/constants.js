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
  // frictionAir bem baixo (era 0.05, depois 0.025) faz QUALQUER lançamento
  // deslizar bem mais longe por unidade de força — inclusive puxões fracos,
  // que agora fluem sem perder força rápido. maxLaunchSpeed subiu de 42 pra
  // 46 pra compensar (menos fricção sozinha reduziria o alcance máximo já
  // calibrado); a combinação foi validada com um loop síncrono determinístico
  // (ver __debugStep em game.js) simulando o lançamento mais forte possível
  // — testar via requestAnimationFrame numa aba automatizada em segundo
  // plano não avança de forma confiável e já deu leituras falsas antes.
  frictionAir: 0.01,
  restitution: 0.55,
  pieceRestitution: 0.4,
  railRestitution: 0.35,
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
  laneFarDark: '#c79f16'
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
