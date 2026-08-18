// Desenho em canvas: moldura de madeira, superfície com painel central,
// alvo de anéis, trilhos, discos, os dois estilingues e o logotipo.
//
// Moldura/trilhos/estilingue/seta de prévia vêm do Passe-Trappe quase 1:1;
// o alvo é o drawTarget do Curling de Mesa repaginado (anéis preenchidos e
// rótulos legíveis das DUAS pontas, já que aqui tem gente dos dois lados da
// mesa); a superfície é nova, seguindo a foto de referência: madeira clara
// nas pontas e um painel creme impresso no meio.

const GameRender = (function () {
  let woodPattern = null;
  let surfacePattern = null;

  // Veio horizontal, tons da moldura escura (idêntico ao dos irmãos).
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

  // Veio VERTICAL (no sentido do comprimento da mesa) e tons bem mais
  // claros — é a tábua da superfície de jogo da foto, não a moldura.
  function buildSurfacePattern() {
    const size = 256;
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const c = off.getContext('2d');
    const grad = c.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, COLORS.surfaceWoodMid);
    grad.addColorStop(0.5, COLORS.surfaceWoodLight);
    grad.addColorStop(1, COLORS.surfaceWoodMid);
    c.fillStyle = grad;
    c.fillRect(0, 0, size, size);

    c.strokeStyle = 'rgba(120,80,40,0.13)';
    for (let i = 0; i < 22; i++) {
      const x = (i / 22) * size + (Math.random() - 0.5) * 7;
      c.lineWidth = 0.5 + Math.random() * 1.3;
      c.beginPath();
      c.moveTo(x, 0);
      for (let y = 0; y <= size; y += 16) {
        c.lineTo(x + Math.sin(y * 0.05 + i) * 2.5, y);
      }
      c.stroke();
    }
    surfacePattern = off;
  }

  function drawWoodFrame(ctx, canvasW, canvasH) {
    if (!woodPattern) buildWoodPattern();
    ctx.fillStyle = ctx.createPattern(woodPattern, 'repeat');
    ctx.fillRect(0, 0, canvasW, canvasH);
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
    if (!surfacePattern) buildSurfacePattern();
    ctx.save();

    // Tábua clara em toda a mesa…
    ctx.fillStyle = ctx.createPattern(surfacePattern, 'repeat');
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    // …e o painel creme impresso no meio (onde ficam os anéis), com uma
    // sombra fina nas emendas pra ler como uma folha colada sobre a madeira.
    const panelH = BOARD.panelY1 - BOARD.panelY0;
    const panelGrad = ctx.createLinearGradient(0, BOARD.panelY0, 0, BOARD.panelY1);
    panelGrad.addColorStop(0, COLORS.panelCreamDark);
    panelGrad.addColorStop(0.5, COLORS.panelCream);
    panelGrad.addColorStop(1, COLORS.panelCreamDark);
    ctx.fillStyle = panelGrad;
    ctx.fillRect(0, BOARD.panelY0, BOARD.width, panelH);

    ctx.strokeStyle = 'rgba(90,70,40,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, BOARD.panelY0 + 0.5);
    ctx.lineTo(BOARD.width, BOARD.panelY0 + 0.5);
    ctx.moveTo(0, BOARD.panelY1 - 0.5);
    ctx.lineTo(BOARD.width, BOARD.panelY1 - 0.5);
    ctx.stroke();

    // Linhas vermelhas de lançamento, uma por ponta (as da foto).
    ctx.strokeStyle = COLORS.lineRed;
    ctx.lineWidth = 2.5;
    for (const key of Object.keys(SIDES)) {
      const y = SIDES[key].foulLineY;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BOARD.width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Anéis concêntricos no centro exato da mesa. Preenchimento progressivo
  // (mais quente e mais forte conforme se aproxima do centro) em tons
  // NEUTROS de propósito: nada de azul/vermelho saturado nos anéis, que
  // competiria com a leitura da cor dos discos.
  const RING_FILLS = [
    'rgba(107,66,38,0.10)',
    'rgba(45,54,82,0.12)',
    'rgba(156,122,31,0.20)',
    'rgba(212,175,55,0.42)'
  ];
  const RING_STROKES = [
    'rgba(45,54,82,0.45)',
    'rgba(45,54,82,0.6)',
    'rgba(156,122,31,0.75)',
    'rgba(124,90,12,0.9)'
  ];

  function drawTarget(ctx) {
    ctx.save();
    const rings = BOARD.targetRings; // do maior pro menor

    for (let i = 0; i < rings.length; i++) {
      ctx.beginPath();
      ctx.arc(BOARD.targetX, BOARD.targetY, rings[i].radius, 0, Math.PI * 2);
      ctx.fillStyle = RING_FILLS[i];
      ctx.fill();
      ctx.strokeStyle = RING_STROKES[i];
      ctx.lineWidth = i === rings.length - 1 ? 3 : 2;
      ctx.stroke();
    }

    // Cruz fina marcando o centro absoluto — referência de mira.
    ctx.strokeStyle = 'rgba(124,90,12,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(BOARD.targetX - 12, BOARD.targetY);
    ctx.lineTo(BOARD.targetX + 12, BOARD.targetY);
    ctx.moveTo(BOARD.targetX, BOARD.targetY - 12);
    ctx.lineTo(BOARD.targetX, BOARD.targetY + 12);
    ctx.stroke();

    // Rótulos de pontuação DUAS vezes: na metade de baixo em pé (pra quem
    // joga da ponta de baixo) e na de cima girados 180° — como na mesa real,
    // onde cada jogador lê os números da sua ponta.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 22px "Special Elite", "Courier New", monospace';
    ctx.fillStyle = 'rgba(45,54,82,0.75)';
    for (const ring of rings) {
      const label = String(ring.score);
      ctx.fillText(label, BOARD.targetX, BOARD.targetY + ring.radius - 17);
      ctx.save();
      ctx.translate(BOARD.targetX, BOARD.targetY - ring.radius + 17);
      ctx.rotate(Math.PI);
      ctx.fillText(label, 0, 0);
      ctx.restore();
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
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-BOARD.railThickness + 1, -BOARD.railThickness + 1, BOARD.railThickness - 2, BOARD.height + BOARD.railThickness * 2 - 2);
    ctx.restore();
  }

  // Disco de madeira com miolo colorido (vermelho ou azul), como na foto —
  // é o drawPiece do Curling de Mesa sem a esfera metálica central, que não
  // existe nos discos desta mesa.
  function drawPiece(ctx, x, y, player, highlighted) {
    const r = BOARD.pieceRadius;
    const inlay = player === PLAYERS.RED ? COLORS.red : COLORS.blue;
    const inlayDark = player === PLAYERS.RED ? COLORS.redDark : COLORS.blueDark;

    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.ellipse(2, 3.5, r * 0.96, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();
    ctx.restore();

    // aro de madeira
    const rimGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    rimGrad.addColorStop(0, highlighted ? '#f0cf9c' : COLORS.discWood);
    rimGrad.addColorStop(1, COLORS.discWoodDark);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.discWoodDark;
    ctx.stroke();

    // miolo colorido do jogador
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    const inlayGrad = ctx.createRadialGradient(-r * 0.18, -r * 0.2, r * 0.05, 0, 0, r * 0.62);
    inlayGrad.addColorStop(0, inlay);
    inlayGrad.addColorStop(1, inlayDark);
    ctx.fillStyle = inlayGrad;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.stroke();

    // ponto central + verniz diagonal (linear, não radial: mantém a leitura
    // de peça chapada de madeira, não de esfera — lição do Passe-Trappe)
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    const sheen = ctx.createLinearGradient(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7);
    sheen.addColorStop(0, 'rgba(255,255,255,0.26)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();

    ctx.restore();
  }

  function drawSling(ctx, anchorL, anchorR, pieceX, pieceY, color) {
    ctx.save();
    ctx.strokeStyle = color || COLORS.elasticCord;
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

  // Seta de prévia do tiro — mesma conta do disparo real (computeShot em
  // game.js), então nunca aponta pra um lugar diferente do que o disco vai
  // fazer. O comprimento cresce com a força.
  function drawThrowIndicator(ctx, x, y, dirX, dirY, ratio) {
    ctx.save();
    const len = 26 + ratio * 70;
    const tipX = x + dirX * len;
    const tipY = y + dirY * len;
    ctx.strokeStyle = 'rgba(212,175,55,0.92)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const headLen = 12;
    const angle = Math.atan2(dirY, dirX);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();
  }

  // Aro pontilhado pulsante — "este disco é o da vez" (jogador) ou "a
  // máquina está mirando este".
  function drawAimHint(ctx, x, y, t) {
    ctx.save();
    const pulse = (Math.sin(t * Math.PI * 1.6) + 1) / 2;
    const r = BOARD.pieceRadius + 9 + pulse * 5;
    ctx.strokeStyle = `rgba(32, 30, 28, ${(0.55 + pulse * 0.3).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Faixa de "vez de quem" desenhada NA PONTA de quem joga, e girada 180°
  // quando é a ponta de cima — quem está sentado daquele lado lê o texto na
  // orientação certa, como um letreiro impresso na mesa.
  //
  // Fica À FRENTE da âncora (do lado do campo), não atrás: atrás é a zona de
  // puxada, e o disco passaria por baixo da faixa durante o gesto. À frente
  // ela só é visível enquanto se mira — some no instante do arremesso, antes
  // do disco chegar ali.
  function drawTurnBanner(ctx, text, player, color) {
    const side = SIDES[player];
    const flipped = side.backwardSign === -1;
    const y = side.anchorY - side.backwardSign * 100;

    ctx.save();
    ctx.translate(BOARD.width / 2, y);
    if (flipped) ctx.rotate(Math.PI);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 19px "Elms Sans", "Helvetica Neue", Arial, sans-serif';

    const w = Math.max(150, ctx.measureText(text).width + 34);
    const h = 30;
    const plate = new Path2D();
    plate.roundRect(-w / 2, -h / 2, w, h, 15);
    ctx.fillStyle = 'rgba(20,13,7,0.72)';
    ctx.fill(plate);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke(plate);

    ctx.fillStyle = COLORS.cream;
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  function drawLogo(ctx, x, y, scale, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, 34, 0, Math.PI * 2);
    ctx.clip();

    [26, 19, 12].forEach((r) => {
      ctx.beginPath();
      ctx.arc(0, -2, r, Math.PI, 0);
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(0, -2, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 6, 0, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-20, 10);
    ctx.quadraticCurveTo(-26, 20, -18, 24);
    ctx.quadraticCurveTo(-10, 16, 0, 18);
    ctx.quadraticCurveTo(10, 16, 18, 24);
    ctx.quadraticCurveTo(26, 20, 20, 10);
    ctx.quadraticCurveTo(0, 16, -20, 10);
    ctx.closePath();
    ctx.fill();

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
    drawThrowIndicator,
    drawAimHint,
    drawTurnBanner,
    drawLogo
  };
})();
