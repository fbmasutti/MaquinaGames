// Cérebro da "máquina" — isolado de propósito num módulo próprio, sem
// nenhuma referência a DOM/estado de jogo, pra poder ser trocado por input
// de um segundo jogador humano (modo P1 vs P2) mais tarde sem mexer no
// resto do código.

const AiController = (function () {
  // Quando a máquina deve atirar o próximo disco, a partir de agora.
  function scheduleNextShot(levelConfig) {
    const [minMs, maxMs] = levelConfig.aiFireMs;
    return performance.now() + minMs + Math.random() * (maxMs - minMs);
  }

  // Escolhe um vão (aleatório entre os disponíveis no nível), mira no
  // centro dele com um desvio aleatório que encolhe conforme aiAccuracy
  // sobe, e retorna a direção + velocidade do tiro a partir da posição de
  // repouso da máquina (fromX/fromY = âncora da máquina, ver
  // BOARD.aiAnchorY em constants.js).
  function pickShot(levelConfig, gaps, fromX, fromY) {
    const gap = gaps[Math.floor(Math.random() * gaps.length)];
    const gapCenter = (gap.x0 + gap.x1) / 2;
    const gapWidth = gap.x1 - gap.x0;
    const jitter = (1 - levelConfig.aiAccuracy) * gapWidth;
    const targetX = gapCenter + (Math.random() * 2 - 1) * (jitter / 2);
    const targetY = BOARD.dividerY;

    const dx = targetX - fromX;
    const dy = targetY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    const [minSpeedFrac, maxSpeedFrac] = levelConfig.aiSpeed;
    const speedFrac = minSpeedFrac + Math.random() * (maxSpeedFrac - minSpeedFrac);
    const speed = speedFrac * PHYSICS.maxLaunchSpeed;

    return { dirX, dirY, speed };
  }

  return { scheduleNextShot, pickShot };
})();
