// Desenho em canvas: tabuleiro de madeira, alvo, trilhos, peças, estilingue e logotipo.

const GameRender = (function () {
  let woodPattern = null;

  function buildWoodPattern() {
    const size = 256;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const c = off.getContext('2d');
    const grad = c.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, COLORS.woodMid);
    grad.addColorStop(0.5, COLORS.woodLight);
    grad.addColorStop(1, COLORS.woodMid);
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);

    // veios de madeira: linhas onduladas horizontais semi-transparentes
    c.strokeStyle = 'rgba(70,40,15,0.18)';
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * size + (Math.random() - 0.5) * 6;
      c.lineWidth = 0.6 + Math.random() * 1.6;
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) {
        c.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
      }
      c.stroke();
    }
    woodPattern = off;
  }

  function drawWoodFrame(ctx, canvasW, canvasH) {
    if (!woodPattern) buildWoodPattern();
    const pattern = ctx.createPattern(woodPattern, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, canvasW, canvasH);
    // vinheta escura nas bordas para dar profundidade de gabinete
    const vg = ctx.createRadialGradient(
      canvasW / 2, canvasH / 2, Math.min(canvasW, canvasH) * 0.3,
      canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) * 0.75
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  function drawPlaySurface(ctx) {
    ctx.save();
    ctx.fillStyle = COLORS.cream;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    // linhas tracejadas laterais (estilo shuffleboard) a cada 1/6 do comprimento
    ctx.strokeStyle = 'rgba(107,66,38,0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    for (let i = 1; i < 8; i++) {
      const y = (BOARD.height / 8) * i;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(BOARD.width - 14, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // linha de lançamento
    ctx.strokeStyle = 'rgba(45,54,82,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, BOARD.shootLineY);
    ctx.lineTo(BOARD.width - 20, BOARD.shootLineY);
    ctx.stroke();

    ctx.restore();
  }

  function drawTarget(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 20px "Special Elite", "Courier New", monospace';

    const rings = BOARD.targetRings; // outer -> inner, [5,10,15,20]
    const ringColors = [COLORS.targetOuter, COLORS.targetMid, COLORS.targetInner, COLORS.targetBull];

    for (let i = 0; i < rings.length; i++) {
      ctx.beginPath();
      ctx.arc(BOARD.targetX, BOARD.targetY, rings[i].radius, 0, Math.PI * 2);
      ctx.strokeStyle = ringColors[i];
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // rótulos de pontuação ao longo do eixo vertical inferior de cada anel
    ctx.fillStyle = 'rgba(45,54,82,0.7)';
    for (let i = 0; i < rings.length; i++) {
      const labelY = BOARD.targetY + rings[i].radius - 16;
      ctx.fillText(String(rings[i].score), BOARD.targetX, labelY);
    }

    ctx.restore();
  }

  function drawRails(ctx) {
    ctx.save();
    ctx.fillStyle = COLORS.woodDark;
    ctx.fillRect(-BOARD.railThickness, -BOARD.railThickness, BOARD.railThickness, BOARD.height + BOARD.railThickness * 2);
    ctx.fillRect(BOARD.width, -BOARD.railThickness, BOARD.railThickness, BOARD.height + BOARD.railThickness * 2);
    ctx.fillRect(-BOARD.railThickness, -BOARD.railThickness, BOARD.width + BOARD.railThickness * 2, BOARD.railThickness);
    ctx.fillRect(-BOARD.railThickness, BOARD.height, BOARD.width + BOARD.railThickness * 2, BOARD.railThickness);
    // friso de brilho no topo dos trilhos
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-BOARD.railThickness + 1, -BOARD.railThickness + 1, BOARD.railThickness - 2, BOARD.height + BOARD.railThickness * 2 - 2);
    ctx.restore();
  }

  function drawPiece(ctx, x, y, angle, player) {
    const r = BOARD.pieceRadius;
    const rimColor = player === PLAYERS.YELLOW ? COLORS.yellow : COLORS.red;
    const rimDark = player === PLAYERS.YELLOW ? COLORS.yellowDark : COLORS.redDark;

    ctx.save();
    ctx.translate(x, y);

    // sombra
    ctx.beginPath();
    ctx.ellipse(2, 4, r * 0.98, r * 0.98, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // disco de madeira (aro externo)
    const rimGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    rimGrad.addColorStop(0, COLORS.woodLight);
    rimGrad.addColorStop(1, COLORS.woodDark);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.woodDark;
    ctx.stroke();

    // anel colorido do jogador
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    const ringGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.05, 0, 0, r * 0.7);
    ringGrad.addColorStop(0, rimColor);
    ringGrad.addColorStop(1, rimDark);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    // esfera metálica central
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    const metalGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.12, r * 0.02, 0, 0, r * 0.32);
    metalGrad.addColorStop(0, '#f5f5f5');
    metalGrad.addColorStop(0.4, '#b8bcc4');
    metalGrad.addColorStop(1, '#5a5f68');
    ctx.fillStyle = metalGrad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();

    // brilho especular
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.14, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.restore();
  }

  function drawSling(ctx, anchorL, anchorR, pieceX, pieceY) {
    ctx.save();
    ctx.strokeStyle = COLORS.red;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(anchorL.x, anchorL.y);
    ctx.lineTo(pieceX, pieceY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(anchorR.x, anchorR.y);
    ctx.lineTo(pieceX, pieceY);
    ctx.stroke();

    // âncoras (parafusos de latão)
    [anchorL, anchorR].forEach((a) => {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 6, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(a.x - 2, a.y - 2, 1, a.x, a.y, 6);
      g.addColorStop(0, '#f3dd8a');
      g.addColorStop(1, COLORS.brassDark);
      ctx.fillStyle = g;
      ctx.fill();
    });
    ctx.restore();
  }

  function drawLogo(ctx, x, y, scale, color) {
    // Logotipo "Máquina Tudo": anel tipo Saturno sobre um pequeno corpo com saliências laterais.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';

    // círculo externo
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.clip();

    // arcos concêntricos (domo)
    [26, 19, 12].forEach((r) => {
      ctx.beginPath();
      ctx.arc(0, -2, r, Math.PI, 0);
      ctx.stroke();
    });
    // núcleo central
    ctx.beginPath();
    ctx.arc(0, -2, 7, 0, Math.PI * 2);
    ctx.fill();

    // anel horizontal (estilo Saturno)
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 6, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.stroke();

    // corpo inferior com saliências
    ctx.beginPath();
    ctx.moveTo(-20, 10);
    ctx.quadraticCurveTo(-26, 20, -18, 24);
    ctx.quadraticCurveTo(-10, 16, 0, 18);
    ctx.quadraticCurveTo(10, 16, 18, 24);
    ctx.quadraticCurveTo(26, 20, 20, 10);
    ctx.quadraticCurveTo(0, 16, -20, 10);
    ctx.closePath();
    ctx.fill();

    // saliência central inferior (pezinho)
    ctx.beginPath();
    ctx.arc(0, 26, 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  return {
    buildWoodPattern,
    drawWoodFrame,
    drawPlaySurface,
    drawTarget,
    drawRails,
    drawPiece,
    drawSling,
    drawLogo
  };
})();
