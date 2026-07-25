// Física da bola sobre a barra basculante — Escapa Buraco.

const Physics = (function () {
  function initState() {
    return {
      barLeftY: BOARD.barMaxY,
      barRightY: BOARD.barMaxY,
      ballS: BOARD.width / 2, // posição horizontal do centro da bola (px)
      ballV: 0, // velocidade ao longo da barra (px/s), positivo = direita
    };
  }

  function barYAt(state, x) {
    const t = (x - BOARD.barX1) / (BOARD.barX2 - BOARD.barX1);
    return state.barLeftY + (state.barRightY - state.barLeftY) * t;
  }

  // Eventos possíveis por passo: { type: 'hole', hole } | { type: 'bounce', side }
  function stepPhysics(state, dt) {
    const dy = state.barRightY - state.barLeftY;
    const dx = BOARD.barX2 - BOARD.barX1;
    const sinTheta = dy / Math.hypot(dx, dy);

    state.ballV += BOARD.gravity * sinTheta * dt;
    state.ballV *= Math.max(0, 1 - BOARD.friction * dt);
    if (state.ballV > BOARD.maxBallSpeed) state.ballV = BOARD.maxBallSpeed;
    else if (state.ballV < -BOARD.maxBallSpeed) state.ballV = -BOARD.maxBallSpeed;
    state.ballS += state.ballV * dt;

    let event = null;

    // Bate e volta nas pontas da barra (batentes), em vez de cair.
    const minX = BOARD.barX1 + BOARD.ballRadius;
    const maxX = BOARD.barX2 - BOARD.ballRadius;
    if (state.ballS < minX) {
      state.ballS = minX;
      if (state.ballV < -BOARD.bounceMinSpeed) event = { type: "bounce", side: "left" };
      state.ballV = -state.ballV * BOARD.bounceDamping;
    } else if (state.ballS > maxX) {
      state.ballS = maxX;
      if (state.ballV > BOARD.bounceMinSpeed) event = { type: "bounce", side: "right" };
      state.ballV = -state.ballV * BOARD.bounceDamping;
    }

    // Detecção de buraco: a bola sobrepõe horizontalmente um buraco e a
    // SUPERFÍCIE onde ela se apoia (topo da barra, não a linha central usada
    // pela física) está na altura da abertura ou abaixo dela.
    if (!event) {
      const surfaceY = barYAt(state, state.ballS) - BOARD.barThickness / 2;
      for (const h of HOLES) {
        const dxh = state.ballS - h.x;
        if (Math.abs(dxh) > h.r - 2) continue;
        if (surfaceY > h.y - 6 && surfaceY < h.y + h.r + 4) {
          event = { type: "hole", hole: h };
          break;
        }
      }
    }

    return event;
  }

  function moveBarEnd(state, end, dir, dt) {
    if (dir === 0) return;
    const delta = dir * BOARD.barSpeed * dt;
    if (end === "left") {
      state.barLeftY = clamp(state.barLeftY + delta, BOARD.barMinY, BOARD.barMaxY);
    } else {
      state.barRightY = clamp(state.barRightY + delta, BOARD.barMinY, BOARD.barMaxY);
    }
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  return { initState, barYAt, stepPhysics, moveBarEnd };
})();
