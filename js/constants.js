// Geometria do tabuleiro, cores e parâmetros de física — tudo em um lugar para fácil ajuste.

const BOARD = {
  width: 420,
  height: 1400,
  railThickness: 22,
  // linha de lançamento (perto da extremidade inferior)
  shootLineY: 1230,
  // âncoras fixas do estilingue (nos trilhos, um pouco acima da linha de lançamento)
  anchorY: 1150,
  anchorInset: 30, // distância da âncora até o trilho
  // centro do alvo (perto da extremidade superior)
  targetX: 210,
  targetY: 230,
  targetRings: [
    { radius: 190, score: 5 },
    { radius: 140, score: 10 },
    { radius: 90, score: 15 },
    { radius: 45, score: 20 }
  ],
  pieceRadius: 34
};

const PHYSICS = {
  gravity: 0,
  // Baixo atrito — a peça desliza e ricocheteia bastante antes de frear,
  // dando espaço real para exagerar na força e quicar pelo tabuleiro.
  frictionAir: 0.017,
  restitution: 0.75,
  // Restituição mais baixa — cada colisão dissipa bem mais energia (bate e
  // perde força de verdade, em vez de quicar quase elástico).
  pieceRestitution: 0.5,
  railRestitution: 0.4,
  density: 0.02,
  settleVelocityThreshold: 0.08,
  maxPullDistance: 130,
  launchPowerMultiplier: 5.6,
  // Força máxima alta o bastante para, em linha reta, ultrapassar o alvo e
  // sair do tabuleiro (peça perdida) — puxar até o fim não é "tiro seguro".
  maxLaunchSpeed: 52
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
  yellow: '#e8b923',
  yellowDark: '#a5810c',
  red: '#c0392b',
  redDark: '#7d241a',
  targetOuter: '#2d3652',
  targetMid: '#9c7a1f',
  targetInner: '#c0392b',
  targetBull: '#e8b923'
};

const PLAYERS = {
  YELLOW: 'yellow',
  RED: 'red'
};
