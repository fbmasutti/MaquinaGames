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
  // Posição de repouso do disco — sem estilingue (ver input.js: o
  // lançamento agora é por gesto de arremesso, não puxar/soltar um
  // elástico), então não há mais âncoras fixas, só o ponto onde o disco
  // nasce a cada tacada.
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

// Divisão da pista: amarela (longe, perto dos compartimentos) x azul
// (perto, área útil de lançamento) — ajustada pra bater com o tabuleiro
// analógico de referência, onde a área azul é bem menor que a amarela e
// fica perto do fundo. BOARD.dragMinY é IGUAL a essa divisão de propósito:
// a área azul passa a ser, visual E funcionalmente, a própria zona de onde
// dá pra pegar/lançar o disco — ver drawLaneBridge em render.js pra "ponte
// de madeira" que marca essa transição (o disco passa por baixo dela).
BOARD.laneSplitY = 1206;
BOARD.dragMinY = BOARD.laneSplitY;
BOARD.dragMaxY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;
// Margem de tolerância pro toque inicial (grabZoneY*) além da faixa de
// arrasto — pega no celular era difícil (precisava acertar bem perto do
// disco). Agora QUALQUER toque dentro dessa faixa larga (toda a largura
// em X, essa faixa em Y) já pega o disco e o teleporta pro ponto tocado —
// simula melhor a versão analógica, onde dá pra posicionar o disco em
// qualquer X, com a mesma força, inclusive perto do fundo do tabuleiro.
BOARD.grabZoneMargin = 40;
BOARD.grabZoneYMin = BOARD.dragMinY - BOARD.grabZoneMargin;
BOARD.grabZoneYMax = BOARD.dragMaxY + BOARD.grabZoneMargin;

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
  // Superfície bem lisa de propósito — sintonia fina: várias rodadas de
  // ajuste fino já passaram por aqui, ver histórico dos valores abaixo.
  // frictionAir subiu um pouco (0.008→0.01) a pedido — "arrasto da mesa"
  // ligeiramente maior, o disco livre (sem colidir) continua deslizando
  // bem, só não tão "sobre o gelo".
  frictionAir: 0.01,
  // pieceRestitution controla o CARÁTER da transferência, não quanta
  // energia sobra no total (descoberto testando: pra duas massas iguais,
  // a soma das velocidades depois do choque é quase invariante com
  // restitution sozinho — conservação de momento; o que muda é COMO essa
  // velocidade se distribui entre os dois discos). Restitution alto =
  // troca "seca", o disco que bateu quase para e o outro sai com quase
  // tudo (bem elástico); restitution baixo = os dois saem meio grudados,
  // numa velocidade parecida. 0.75 dá uma transferência "um pouco menos
  // perfeitamente elástica" como pedido, sem ficar exagerado. IMPORTANTE:
  // o Matter.js usa o MENOR restitution entre os dois corpos de uma
  // colisão — então isso não afeta a batida contra o trilho (sempre vale
  // railRestitution).
  pieceRestitution: 0.75,
  railRestitution: 0.28,
  // Dissipação de energia de verdade no choque disco-disco (ver
  // collisionStart/afterUpdate em physics.js) — representa a diferença
  // entre atrito estático e dinâmico do tabuleiro real: o disco parado
  // precisa "vencer" o atrito estático antes de sair andando, e isso
  // dissipa uma fração da energia — nem tudo vira movimento, mesmo numa
  // colisão elástica. ARMADILHA descoberta testando: aplicar esse
  // amortecimento com Body.setVelocity DENTRO do evento 'collisionStart'
  // (como a primeira versão fazia) faz o resolver do Matter.js perder
  // quase toda a energia da colisão de qualquer forma, MESMO com fator 1
  // (matematicamente um no-op) — por isso agora é aplicado em
  // 'afterUpdate', depois do resolver já ter processado o bounce normal.
  // 0.9 aqui dá uma perda de energia real e perceptível (~15%) sem
  // exagerar — testado e confirmado com medição direta de velocidade
  // antes/depois do choque.
  pieceCollisionDamping: 0.9,
  density: 0.02,
  // Disco "realmente parado": limiar de velocidade (subido de 0.08 pra
  // 0.3 — o valor antigo era tão baixo que, com o atrito de ar já bem
  // reduzido, o disco levava vários segundos só pra cruzar essa linha,
  // mesmo já visualmente parado, atrasando a liberação da próxima tacada)
  // + um teto de segurança em quadros (ver MAX_FLIGHT_FRAMES em game.js)
  // que força o assentamento mesmo se a velocidade nunca cruzar o limiar
  // (cauda de decaimento longa demais).
  settleVelocityThreshold: 0.3,
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
