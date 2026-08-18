// Cérebro da máquina — sem nenhuma referência a DOM ou ao estado do jogo
// (mesma disciplina do passe-trappe/js/ai.js), pra poder ser testado e
// ajustado isolado. Ele NÃO executa o tiro: só decide direção e força; quem
// arrasta o disco e solta o elástico é o game.js, pela MESMA função de
// disparo do jogador humano.
//
// Diferença central pra IA do Passe-Trappe: lá bastava mirar num vão com
// força qualquer; aqui o disco precisa PARAR num ponto, então a força sai de
// PHYSICS.speedForDistance (a constante calibrada com a física real), não de
// uma faixa aleatória.

const AiController = (function () {
  const DIFFICULTIES = {
    easy: { accuracy: 0.55, speedError: 0.15, attackChance: 0.15, thinkMs: [750, 1150] },
    medium: { accuracy: 0.80, speedError: 0.08, attackChance: 0.45, thinkMs: [600, 950] },
    hard: { accuracy: 0.94, speedError: 0.035, attackChance: 0.75, thinkMs: [500, 850] }
  };

  // Erro angular máximo (rad) de uma máquina de precisão zero — a
  // dificuldade escala este valor por (1 - accuracy).
  const MAX_ANGLE_ERROR = 0.20;
  // Folga desejada entre a linha de tiro e o centro de um disco no caminho:
  // dois raios (os dois discos se tocando) mais uma margem.
  const CLEAR_RADIUS = BOARD.pieceRadius * 2 + 6;
  const OUTER_RADIUS = BOARD.targetRings[0].radius;

  function thinkDelay(difficultyKey) {
    const [minMs, maxMs] = (DIFFICULTIES[difficultyKey] || DIFFICULTIES.medium).thinkMs;
    return minMs + Math.random() * (maxMs - minMs);
  }

  function distToCenter(body) {
    return Math.hypot(body.position.x - BOARD.targetX, body.position.y - BOARD.targetY);
  }

  // Melhor (menor) distância ao centro entre os discos de um jogador.
  function bestOf(discs, player) {
    let best = null;
    for (const d of discs) {
      if (d.player !== player || d.pending) continue;
      const dist = distToCenter(d.body);
      if (!best || dist < best.dist) best = { disc: d, dist };
    }
    return best;
  }

  // Menor distância entre os centros dos discos do caminho e o segmento
  // âncora→alvo: quanto MAIOR, mais limpa é a linha de tiro. Só conta o que
  // está entre os dois pontos (t em [0,1]), não o que ficou pra trás.
  function pathClearance(from, to, discs, ignoreBody) {
    const vx = to.x - from.x;
    const vy = to.y - from.y;
    const len2 = vx * vx + vy * vy || 1;
    let min = Infinity;
    for (const d of discs) {
      if (d.body === ignoreBody || d.pending) continue;
      const px = d.body.position.x - from.x;
      const py = d.body.position.y - from.y;
      const t = (px * vx + py * vy) / len2;
      if (t <= 0.02 || t >= 0.98) continue;
      const dist = Math.hypot(px - vx * t, py - vy * t);
      if (dist < min) min = dist;
    }
    return min;
  }

  // Escolhe o ponto de mira e a força a partir de `from` — a posição REAL do
  // disco que vai ser arremessado, não uma referência fixa do tabuleiro.
  // Dois tipos de tiro:
  //   - aproximação: parar o mais perto possível do centro;
  //   - ataque: bater no melhor disco do adversário pra tirá-lo do alvo,
  //     com força pra atravessar (não pra parar ali).
  function pickShot(options) {
    const { difficulty, discs, me, opponent, from, myRemaining } = options;
    const level = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;

    const mine = bestOf(discs, me);
    const theirs = bestOf(discs, opponent);

    // Ataca quando o adversário está de fato levando ponto e à frente — e,
    // no último disco, sem outra chance, ataca com bem mais vontade.
    const threatened = theirs && theirs.dist < OUTER_RADIUS && (!mine || theirs.dist < mine.dist);
    const desperate = myRemaining <= 1 && threatened;
    const attack = threatened && (desperate || Math.random() < level.attackChance);

    let aim;
    let speed;
    let kind;

    if (attack) {
      const target = theirs.disc.body.position;
      aim = { x: target.x, y: target.y };
      // Força pra CHEGAR com energia: mira uma distância bem maior que a
      // real, então o disco ainda está rápido quando encontra o alvo.
      const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
      speed = PHYSICS.speedForDistance(dist * 1.85);
      kind = 'attack';
    } else {
      // Aproximação: tenta o centro e, se a linha estiver entupida, desvia
      // lateralmente — melhor encostar de raspão que bater no disco da
      // frente e parar longe.
      const candidates = [0, -34, 34, -68, 68, -102, 102];
      let best = null;
      for (const offset of candidates) {
        const point = { x: BOARD.targetX + offset, y: BOARD.targetY };
        const clearance = pathClearance(from, point, discs, null);
        if (!best || clearance > best.clearance + 1) best = { point, clearance, offset };
        if (clearance >= CLEAR_RADIUS) { best = { point, clearance, offset }; break; }
      }
      aim = best.point;
      const dist = Math.hypot(aim.x - from.x, aim.y - from.y);
      speed = PHYSICS.speedForDistance(dist);
      kind = 'draw';
    }

    // Erro humano: ângulo e força, os dois encolhendo com a dificuldade.
    let angle = Math.atan2(aim.y - from.y, aim.x - from.x);
    angle += (Math.random() * 2 - 1) * MAX_ANGLE_ERROR * (1 - level.accuracy);
    speed *= 1 + (Math.random() * 2 - 1) * level.speedError;
    speed = Math.max(PHYSICS.maxLaunchSpeed * 0.15, Math.min(PHYSICS.maxLaunchSpeed, speed));

    return { dirX: Math.cos(angle), dirY: Math.sin(angle), speed, kind };
  }

  return { pickShot, thinkDelay, DIFFICULTIES };
})();
