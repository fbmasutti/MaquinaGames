// Progressão de níveis — Passe-Trappe.
// Cada nível fica mais difícil em dois eixos, como pedido: a máquina
// responde mais rápido e mira melhor (aiFireMs cai, aiAccuracy sobe), e os
// vãos da divisória ficam mais estreitos (gapWidth cai, gapCount cai de 2
// pra 1 a partir do nível 4).
//
// aiAccuracy controla o desvio aleatório do ponto mirado em torno do
// centro do vão escolhido: jitter = (1 - aiAccuracy) * gapWidth. aiSpeed é
// uma fração de PHYSICS.maxLaunchSpeed. discsPerSide fixo em 4 (a pedido).
// Valores de partida — ajustáveis por playtesting, como o resto da série.
const LEVELS = [
  { label: 'Nível 1', discsPerSide: 4, gapCount: 2, gapWidth: 70, aiFireMs: [1800, 2600], aiAccuracy: 0.35, aiSpeed: [0.55, 0.70] },
  { label: 'Nível 2', discsPerSide: 4, gapCount: 2, gapWidth: 60, aiFireMs: [1500, 2200], aiAccuracy: 0.50, aiSpeed: [0.60, 0.75] },
  { label: 'Nível 3', discsPerSide: 4, gapCount: 2, gapWidth: 50, aiFireMs: [1200, 1800], aiAccuracy: 0.65, aiSpeed: [0.65, 0.80] },
  { label: 'Nível 4', discsPerSide: 4, gapCount: 1, gapWidth: 60, aiFireMs: [1000, 1500], aiAccuracy: 0.75, aiSpeed: [0.70, 0.85] },
  { label: 'Nível 5', discsPerSide: 4, gapCount: 1, gapWidth: 46, aiFireMs: [800, 1200], aiAccuracy: 0.85, aiSpeed: [0.75, 0.90] },
  { label: 'Nível 6 — Final', discsPerSide: 4, gapCount: 1, gapWidth: 38, aiFireMs: [650, 1000], aiAccuracy: 0.95, aiSpeed: [0.80, 1.00] }
];

const TOTAL_LEVELS = LEVELS.length;
