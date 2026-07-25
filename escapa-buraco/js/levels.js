// Progressão de níveis e pontuação — Escapa Buraco.
// Linhas mais altas = mais difíceis = valem mais pontos.

const Scoring = (function () {
  // Linha -> multiplicador de dificuldade.
  function rowMultiplier(row) {
    switch (row) {
      case 10: return 5;
      case 8: return 3;
      case 6: return 2;
      case 4: return 1.5;
      default: return 1;
    }
  }

  // Multiplicador de combo por posição na sequência.
  const COMBO_MULT = [1, 1.25, 1.5, 2, 2.5];
  function comboMultiplier(indexInSequence) {
    return COMBO_MULT[Math.min(indexInSequence, COMBO_MULT.length - 1)];
  }

  // Pontos por acertar um alvo.
  function scoreForHit(row, timeLeft, indexInSequence) {
    const base = 100 * rowMultiplier(row);
    const timeBonus = Math.max(0, Math.round(timeLeft)) * 5 * rowMultiplier(row);
    return Math.round((base + timeBonus) * comboMultiplier(indexInSequence));
  }

  return { rowMultiplier, comboMultiplier, scoreForHit };
})();

const LEVELS = (function () {
  function pick(row, slot) {
    const rowHoles = HOLES_BY_ROW[row] ?? [];
    const h = rowHoles[Math.min(slot, rowHoles.length - 1)] ?? HOLES[0];
    return h.id;
  }

  return [
    { sequence: [pick(2, 0)], timeSeconds: 45, label: "Linha 2" },
    { sequence: [pick(2, 4)], timeSeconds: 42, label: "Linha 2" },
    { sequence: [pick(4, 1)], timeSeconds: 40, label: "Linha 4" },
    { sequence: [pick(4, 4)], timeSeconds: 38, label: "Linha 4" },
    { sequence: [pick(6, 2)], timeSeconds: 35, label: "Linha 6" },
    { sequence: [pick(6, 3), pick(8, 4)], timeSeconds: 60, label: "Combo x2" },
    { sequence: [pick(8, 1), pick(8, 4)], timeSeconds: 55, label: "Combo x2" },
    { sequence: [pick(6, 2), pick(8, 3), pick(8, 5)], timeSeconds: 80, label: "Combo x3" },
    { sequence: [pick(8, 1), pick(8, 4), pick(10, 0)], timeSeconds: 80, label: "Combo x3" },
    {
      sequence: [pick(6, 3), pick(8, 2), pick(8, 5), pick(10, 0)],
      timeSeconds: 100,
      label: "Combo x4 — Final",
    },
  ];
})();

const TOTAL_LEVELS = LEVELS.length;

// Bônus de tempo (segundos) ao acertar um alvo intermediário.
const CHECKPOINT_TIME_BONUS = 10;
