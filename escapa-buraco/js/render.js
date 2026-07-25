// Desenho do tabuleiro — Escapa Buraco.

const Render = (function () {
  let grainPattern = null;

  function getVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function drawGrain(ctx, w, h) {
    if (!grainPattern) {
      const off = document.createElement("canvas");
      off.width = 120;
      off.height = 120;
      const octx = off.getContext("2d");
      if (octx) {
        octx.fillStyle = "rgba(0,0,0,0)";
        octx.fillRect(0, 0, 120, 120);
        for (let i = 0; i < 220; i++) {
          octx.fillStyle = `rgba(120, 80, 40, ${Math.random() * 0.05})`;
          octx.fillRect(Math.random() * 120, Math.random() * 120, 1, 1 + Math.random() * 2);
        }
        grainPattern = ctx.createPattern(off, "repeat");
      }
    }
    if (grainPattern) {
      ctx.fillStyle = grainPattern;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawShelves(ctx, w) {
    const shelves = [126, 212, 304, 398, 497];
    const shelfX = BOARD.playLeft - 20;
    const shelfW = w - shelfX * 2;
    for (const y of shelves) {
      ctx.fillStyle = "rgba(120, 80, 40, 0.18)";
      ctx.fillRect(shelfX, y - 1, shelfW, 1);
      ctx.fillStyle = "rgba(60, 32, 12, 0.35)";
      ctx.fillRect(shelfX, y, shelfW, 1);
    }
  }

  // Números das linhas — fora da barra/trilhos, na margem do playfield,
  // para nunca se sobrepor ao eixo de subida da barra nem aos buracos.
  function drawRowLabels(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(50, 28, 10, 0.8)";
    ctx.font = `700 16px ${getVar("--font-display", "'Bagel Fat One', cursive")}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(255, 245, 225, 0.5)";
    ctx.shadowBlur = 1;
    const labels = [
      { row: 10, y: 84 },
      { row: 8, y: 168 },
      { row: 6, y: 256 },
      { row: 4, y: 352 },
      { row: 2, y: 444 },
    ];
    const labelLeftX = BOARD.barX1 - 16;
    const labelRightX = BOARD.barX2 + 16;
    for (const l of labels) {
      ctx.fillText(String(l.row), labelLeftX, l.y);
      ctx.fillText(String(l.row), labelRightX, l.y);
    }
    ctx.restore();
  }

  function drawRail(ctx, x, y, w, h) {
    ctx.save();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(20, 12, 6, 1)");
    g.addColorStop(0.5, "rgba(70, 44, 22, 1)");
    g.addColorStop(1, "rgba(20, 12, 6, 1)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = "rgba(220, 180, 130, 0.25)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + 4);
    ctx.lineTo(x + w / 2, y + h - 4);
    ctx.stroke();

    const capH = 9;
    const capX = x - 3;
    const capW = w + 6;
    for (const cy of [y - capH, y + h]) {
      const cg = ctx.createLinearGradient(0, cy, 0, cy + capH);
      cg.addColorStop(0, "#e8cf82");
      cg.addColorStop(0.5, "#cda85a");
      cg.addColorStop(1, "#8a6a2e");
      ctx.fillStyle = cg;
      ctx.fillRect(capX, cy, capW, capH);
      ctx.strokeStyle = "rgba(30, 18, 6, 0.75)";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(capX + 0.5, cy + 0.5, capW - 1, capH - 1);
      const sx = x + w / 2;
      const sy = cy + capH / 2;
      ctx.fillStyle = "rgba(40, 24, 8, 0.9)";
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(15, 8, 3, 0.9)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx - 1.4, sy);
      ctx.lineTo(sx + 1.4, sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHole(ctx, h, isTarget) {
    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.beginPath();
    ctx.arc(h.x, h.y + 2, h.r + 2.5, 0, Math.PI * 2);
    ctx.fill();

    const grad = ctx.createRadialGradient(h.x, h.y - h.r * 0.4, 1, h.x, h.y + 2, h.r);
    grad.addColorStop(0, "rgba(30, 20, 30, 1)");
    grad.addColorStop(0.55, "rgba(8, 6, 12, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 1)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r - 0.5, 0, Math.PI * 2);
    ctx.clip();
    const innerShade = ctx.createLinearGradient(0, h.y - h.r, 0, h.y - h.r + 8);
    innerShade.addColorStop(0, "rgba(0,0,0,0.8)");
    innerShade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = innerShade;
    ctx.fillRect(h.x - h.r, h.y - h.r, h.r * 2, 10);
    ctx.restore();

    ctx.strokeStyle = "rgba(15, 8, 3, 0.95)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r + 1.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(220, 180, 130, 0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r - 0.5, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.r + 0.6, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();

    if (isTarget) {
      const t = (Date.now() % 1200) / 1200;
      const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);

      ctx.save();
      ctx.shadowColor = "rgba(240, 80, 40, 0.9)";
      ctx.shadowBlur = 14 + pulse * 10;
      ctx.strokeStyle = `rgba(240, 80, 40, ${0.55 + pulse * 0.4})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + 5 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = `rgba(240, 200, 110, ${0.5 + pulse * 0.4})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + 3 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 215, 130, 1)";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + 1.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(255, 220, 140, ${0.7 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // A barra é desenhada um pouco além dos trilhos (OVERHANG) para que os
  // parafusos — colocados exatamente em x=0 e x=len, ou seja, em cima do
  // eixo de cada trilho — fiquem com material sobrando nas pontas, como um
  // eixo de metal de verdade, em vez de parar exatamente no parafuso.
  const BAR_OVERHANG = 12;

  function drawBar(ctx, leftY, rightY) {
    ctx.save();
    const x1 = BOARD.barX1;
    const x2 = BOARD.barX2;
    const th = BOARD.barThickness;
    const dx = x2 - x1;
    const dy = rightY - leftY;
    const len = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    ctx.translate(x1, leftY);
    ctx.rotate(angle);

    const X0 = -BAR_OVERHANG;
    const X1 = len + BAR_OVERHANG;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
    const r = th / 2;
    const off = 4;
    ctx.beginPath();
    ctx.moveTo(X0 + r, -th / 2 + off);
    ctx.lineTo(X1 - r, -th / 2 + off);
    ctx.arc(X1 - r, off, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(X0 + r, th / 2 + off);
    ctx.arc(X0 + r, off, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.filter = "blur(2px)";
    ctx.fill();
    ctx.restore();

    const grad = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
    grad.addColorStop(0, "#c9995f");
    grad.addColorStop(0.25, "#a4713f");
    grad.addColorStop(0.65, "#6b4226");
    grad.addColorStop(1, "#2c1a10");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(X0 + r, -th / 2);
    ctx.lineTo(X1 - r, -th / 2);
    ctx.arc(X1 - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(X0 + r, th / 2);
    ctx.arc(X0 + r, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(20, 10, 4, 0.22)";
    ctx.lineWidth = 0.7;
    const grainYs = [-th / 2 + 4, -1, th / 2 - 5];
    for (let gi = 0; gi < grainYs.length; gi++) {
      const yy = grainYs[gi];
      const amp = 0.7 + gi * 0.3;
      ctx.beginPath();
      ctx.moveTo(X0 + 6, yy);
      for (let x = X0 + 6; x <= X1 - 6; x += 12) {
        const wobble = Math.sin((x + gi * 30) * 0.05) * amp;
        ctx.lineTo(x, yy + wobble);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 220, 170, 0.28)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(X0 + 6, -th / 2 + 1.5);
    ctx.lineTo(X1 - 6, -th / 2 + 1.5);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X0 + 6, th / 2 - 0.6);
    ctx.lineTo(X1 - 6, th / 2 - 0.6);
    ctx.stroke();

    // Parafusos exatamente sobre o eixo de cada trilho (x=0 e x=len).
    for (const sx of [0, len]) {
      ctx.fillStyle = "rgba(10, 5, 2, 0.75)";
      ctx.beginPath();
      ctx.arc(sx, 0, 7.5, 0, Math.PI * 2);
      ctx.fill();
      const rg = ctx.createRadialGradient(sx - 2, -2, 0.5, sx, 0, 7);
      rg.addColorStop(0, "#eddca0");
      rg.addColorStop(0.6, "#cda85a");
      rg.addColorStop(1, "#7a5c28");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(sx, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(30, 18, 6, 0.85)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.strokeStyle = "rgba(15, 8, 3, 0.9)";
      ctx.lineWidth = 1.3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx - 4, -0.2);
      ctx.lineTo(sx + 4, 0.2);
      ctx.moveTo(sx - 0.2, -4);
      ctx.lineTo(sx + 0.2, 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 240, 200, 0.55)";
      ctx.beginPath();
      ctx.arc(sx - 2, -2, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Marca a posição de repouso/inicial da barra — um pequeno entalhe de
  // latão nos trilhos, na altura de BOARD.barMaxY.
  function drawHomeMarker(ctx, railW) {
    ctx.save();
    const y = BOARD.barMaxY;
    const rails = [BOARD.barX1 - railW / 2, BOARD.barX2 - railW / 2];
    ctx.fillStyle = "rgba(255, 219, 140, 0.95)";
    for (const x of rails) {
      ctx.beginPath();
      ctx.moveTo(x - 7, y);
      ctx.lineTo(x - 1, y - 3.2);
      ctx.lineTo(x - 1, y + 3.2);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + railW + 7, y);
      ctx.lineTo(x + railW + 1, y - 3.2);
      ctx.lineTo(x + railW + 1, y + 3.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // O "buraco de rato": uma abertura em arco na base do gabinete por onde a
  // bola some ao cair em qualquer buraco (ela desce invisível por dentro da
  // máquina) e reaparece quando a barra desce para buscá-la.
  function drawCasinha(ctx) {
    const cx = BOARD.width / 2;
    const holeW = 46;
    const holeH = 30;
    const baseY = BOARD.height - 6;
    const topY = baseY - holeH;
    const r = holeW / 2;

    ctx.save();

    // Moldura clara ao redor da abertura, encaixada no chão do gabinete.
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.beginPath();
    ctx.moveTo(cx - r - 6, baseY + 3);
    ctx.lineTo(cx - r - 6, topY + r + 4);
    ctx.arc(cx, topY + r + 4, r + 6, Math.PI, 0);
    ctx.lineTo(cx + r + 6, baseY + 3);
    ctx.closePath();
    ctx.fill();

    // O vão escuro em arco — o buraco de rato propriamente dito.
    const grad = ctx.createLinearGradient(0, topY, 0, baseY);
    grad.addColorStop(0, "rgba(2, 1, 1, 0.97)");
    grad.addColorStop(1, "rgba(25, 14, 8, 0.9)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - r, baseY);
    ctx.lineTo(cx - r, topY + r);
    ctx.arc(cx, topY + r, r, Math.PI, 0);
    ctx.lineTo(cx + r, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(10, 5, 2, 0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  function drawBall(ctx, x, y) {
    const r = BOARD.ballRadius;
    const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 2, x, y, r);
    g.addColorStop(0, "#f5f5f5");
    g.addColorStop(0.5, "#bcbcbc");
    g.addColorStop(1, "#4a4a4a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // params: { state, targetHoleId, showTarget, showBall, flash }
  function draw(ctx, params) {
    const { state, targetHoleId, showTarget, showBall, flash } = params;
    const W = BOARD.width;
    const H = BOARD.height;

    ctx.fillStyle = getVar("--cream", "#f0e6d2");
    ctx.fillRect(0, 0, W, H);
    drawGrain(ctx, W, H);
    drawShelves(ctx, W);
    drawRowLabels(ctx);

    const railW = BOARD.railWidth;
    const railTop = BOARD.barMinY - 20;
    const railBottom = BOARD.barMaxY + 30;
    drawRail(ctx, BOARD.barX1 - railW / 2, railTop, railW, railBottom - railTop);
    drawRail(ctx, BOARD.barX2 - railW / 2, railTop, railW, railBottom - railTop);
    drawHomeMarker(ctx, railW);

    for (const h of HOLES) {
      drawHole(ctx, h, showTarget && h.id === targetHoleId);
    }

    drawCasinha(ctx);
    drawBar(ctx, state.barLeftY, state.barRightY);

    if (showBall) {
      const bx = state.ballS;
      // O centro da bola fica um raio acima da SUPERFÍCIE da barra (borda
      // superior, a metade da espessura acima da linha central usada pela
      // física) — não acima da linha central, senão a bola afunda na barra.
      const by = Physics.barYAt(state, bx) - BOARD.barThickness / 2 - BOARD.ballRadius;
      drawBall(ctx, bx, by);
    }

    const vgrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
    vgrad.addColorStop(0, "rgba(0,0,0,0)");
    vgrad.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = vgrad;
    ctx.fillRect(0, 0, W, H);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 230, 120, ${flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return { draw };
})();
