// Desenho do tabuleiro — Toca o Sino.

const GameRender = (function () {
  function drawField(ctx) {
    const W = BOARD.width;
    const H = BOARD.height;

    // Fundo do campo — verde-menta, como na referência física.
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, COLORS.field);
    grad.addColorStop(1, COLORS.fieldDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Cúpula — contorno azul acompanhando a parede física.
    ctx.save();
    ctx.strokeStyle = COLORS.rail;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(BOARD.fieldCenterX, BOARD.domeBaseY, BOARD.domeRadius, Math.PI, 0, false);
    ctx.stroke();
    ctx.restore();
  }

  function drawWallLine(ctx, x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = COLORS.rail;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawWalls(ctx) {
    drawWallLine(ctx, BOARD.fieldLeft, BOARD.domeBaseY, BOARD.fieldLeft, BOARD.height + 40);
    drawWallLine(ctx, BOARD.fieldRight, BOARD.domeBaseY + 24, BOARD.fieldRight, BOARD.height + 40);
    drawWallLine(ctx, BOARD.fieldRightOuter, BOARD.wall, BOARD.fieldRightOuter, BOARD.height + 40);

    const lc = BOARD.laneCap;
    drawWallLine(ctx, lc.x1, lc.y1, lc.x2, lc.y2);

    for (const s of BOARD.slingshots) {
      drawWallLine(ctx, s.x1, s.y1, s.x2, s.y2);
    }

    // canal do lançador — leve sombreado pra diferenciar do campo principal
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(BOARD.fieldRight, BOARD.domeBaseY + 24, BOARD.laneWidth, BOARD.height + 40 - (BOARD.domeBaseY + 24));
    ctx.restore();
  }

  function drawRamp(ctx) {
    const r = BOARD.ramp;
    drawWallLine(ctx, r.peakX - r.halfSpan, r.peakY + r.drop, r.peakX, r.peakY);
    drawWallLine(ctx, r.peakX, r.peakY, r.peakX + r.halfSpan, r.peakY + r.drop);
  }

  function drawBell(ctx, rung) {
    const b = BOARD.bell;
    ctx.save();
    if (rung > 0) {
      ctx.shadowColor = 'rgba(255, 236, 160, 0.95)';
      ctx.shadowBlur = 26 * rung;
    }
    const grad = ctx.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, 2, b.x, b.y, b.r);
    grad.addColorStop(0, '#fdfdfd');
    grad.addColorStop(0.45, '#cfd6da');
    grad.addColorStop(0.8, '#8b969c');
    grad.addColorStop(1, '#565f64');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,30,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawBumper(ctx, b) {
    ctx.save();
    const grad = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 1, b.x, b.y, b.r);
    grad.addColorStop(0, '#3a5fd0');
    grad.addColorStop(0.7, COLORS.rail);
    grad.addColorStop(1, COLORS.railDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 210, 90, 0.9)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFlipper(ctx, pivot, angle, length, thickness) {
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);
    const r = thickness / 2;
    const grad = ctx.createLinearGradient(0, -r, 0, r);
    grad.addColorStop(0, COLORS.woodLight);
    grad.addColorStop(0.5, COLORS.woodMid);
    grad.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(length - r, -r);
    ctx.arc(length - r, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(0, r);
    ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // pino do pivô
    ctx.fillStyle = 'rgba(40,24,8,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBall(ctx, x, y) {
    const r = BOARD.ballRadius;
    const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#c3c9cc');
    g.addColorStop(1, '#565f64');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawLauncherMeter(ctx, charge) {
    if (charge <= 0) return;
    const x = BOARD.launcherX;
    const barW = 10;
    const barH = 120;
    const baseY = BOARD.launcherRestY + 30;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x - barW / 2, baseY - barH, barW, barH);
    const fillH = barH * charge;
    const grad = ctx.createLinearGradient(0, baseY - fillH, 0, baseY);
    grad.addColorStop(0, '#e8536a');
    grad.addColorStop(1, '#f0b923');
    ctx.fillStyle = grad;
    ctx.fillRect(x - barW / 2, baseY - fillH, barW, fillH);
    ctx.restore();
  }

  return {
    drawField,
    drawWalls,
    drawRamp,
    drawBell,
    drawBumper,
    drawFlipper,
    drawBall,
    drawLauncherMeter,
  };
})();
