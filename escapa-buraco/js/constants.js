// Geometria do tabuleiro e buracos — Escapa Buraco.
// Coordenadas em pixels de canvas. Origem no canto superior esquerdo.

const BOARD = {
  width: 520,
  height: 680,
  // Retângulo interno do playfield (onde os buracos vivem)
  playLeft: 60,
  playRight: 460,
  playTop: 40,
  playBottom: 550,
  // Limites físicos da barra (faixa vertical de cada ponta)
  barMinY: 50,
  barMaxY: 620,
  // Vão horizontal da barra — casa com os trilhos
  barX1: 40,
  barX2: 480,
  railWidth: 6,
  ballRadius: 14.4, // +20%
  holeRadius: 19,
  barThickness: 20,
  barSpeed: 220, // px/s por ponta
  gravity: 1500, // px/s^2 de aceleração ao longo da barra
  friction: 0.9, // por segundo
  maxBallSpeed: 520, // px/s
  // Bola quica nas pontas da barra em vez de cair.
  bounceDamping: 0.55,
  bounceMinSpeed: 15, // abaixo disso, só encosta sem tocar SFX
};

// Linhas de cima para baixo. Linha 10 (topo) é o buraco-alvo único original.
// Abaixo, clusters densos nas linhas 8, 6, 4, 2 — os buracos das pontas ficam
// afastados do trilho por uma distância igual à própria largura do trilho.
const HOLES = (() => {
  const railGap = BOARD.railWidth / 2 + BOARD.railWidth;
  const L = BOARD.barX1 + railGap + BOARD.holeRadius;
  const R = BOARD.barX2 - railGap - BOARD.holeRadius;
  const span = R - L;
  const cluster = (n, jitter) =>
    Array.from({ length: n }, (_, i) => L + (span * i) / (n - 1) + (jitter[i] ?? 0));

  const ROWS = [
    { row: 10, y: 84, xs: [BOARD.width / 2] },
    { row: 8, y: 168, xs: cluster(7, [0, -3, 3, -3, 3, -3, 0]) },
    { row: 6, y: 256, xs: cluster(7, [0, 3, -4, 4, -4, 3, 0]) },
    { row: 4, y: 352, xs: cluster(7, [0, -3, 2, -2, 2, -3, 0]) },
    { row: 2, y: 444, xs: cluster(7, [0, 2, -3, 3, -3, 2, 0]) },
  ];

  const holes = [];
  let id = 0;
  for (const r of ROWS) {
    for (const x of r.xs) {
      holes.push({ id: id++, x, y: r.y, r: BOARD.holeRadius, row: r.row });
    }
  }
  return holes;
})();

const HOLES_BY_ROW = HOLES.reduce((acc, h) => {
  (acc[h.row] ||= []).push(h);
  return acc;
}, {});
