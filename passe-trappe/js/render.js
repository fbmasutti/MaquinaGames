// Desenho em canvas: tabuleiro de madeira, trilhos, divisória com vãos,
// discos, estilingues (jogador e máquina) e logotipo. Moldura/trilhos/
// estilingue reaproveitados quase 1:1 do Curling de Mesa; a divisória é
// nova, no espírito de drawLaneBridge do Sjoelen (sombra + gradiente +
// veio de madeira), mas desenhando os segmentos SÓLIDOS reais (com vãos
// recortados) em vez de uma barra inteiriça.

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
    const vg = ctx.createRadialGradient(
      canvasW / 2, canvasH / 2, Math.min(canvasW, canvasH) * 0.3,
      canvasW / 2, canvasH / 2, Math.max(canvasW, canvasH) * 0.75
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Superfície azul pastel — diferencial visual deste jogo (referência do
  // Gallep), em vez do creme usado em Curling/Sjoelen.
  function drawPlaySurface(ctx) {
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, BOARD.height);
    grad.addColorStop(0, COLORS.surfaceBlue);
    grad.addColorStop(1, COLORS.surfaceBlueDark);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);
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

  // Divisória central — um plank de madeira por segmento SÓLIDO (ver
  // BOARD.computeDividerSegments em constants.js), deixando os vãos como
  // superfície azul visível (a "trappe" por onde os discos passam). Recebe
  // tanto os segmentos SÓLIDOS quanto os vãos (gaps) — os vãos servem só
  // pra desenhar os marcadores de passagem, a física deles já foi tratada
  // em physics.js a partir da MESMA lista.
  function drawDivider(ctx, segments, gaps) {
    ctx.save();
    const y = BOARD.dividerY;
    const thickness = BOARD.dividerThickness;
    const top = y - thickness / 2;
    const bottom = y + thickness / 2;

    // Marcador de passagem: um traço tracejado cor de latão atravessando
    // cada vão, por baixo da divisória — deixa inequívoco que ali é uma
    // abertura (pedido: "os buracos estão nas pontas, isso não ficou
    // claro"), sem depender só do olho notar onde a madeira "acaba".
    if (gaps) {
      ctx.save();
      ctx.strokeStyle = 'rgba(212,175,55,0.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 5]);
      for (const g of gaps) {
        if (g.x1 - g.x0 < 4) continue;
        ctx.beginPath();
        ctx.moveTo(g.x0 + 4, y);
        ctx.lineTo(g.x1 - 4, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    for (const seg of segments) {
      const left = seg.x0;
      const right = seg.x1;
      if (right - left < 1) continue;

      ctx.save();
      ctx.filter = 'blur(3px)';
      ctx.fillStyle = 'rgba(20,13,7,0.4)';
      ctx.fillRect(left + 2, bottom + 1, right - left - 4, 6);
      ctx.restore();

      const plankGrad = ctx.createLinearGradient(0, top, 0, bottom);
      plankGrad.addColorStop(0, COLORS.woodLight);
      plankGrad.addColorStop(0.5, COLORS.woodDark);
      plankGrad.addColorStop(1, COLORS.woodLight);
      const path = new Path2D();
      path.roundRect(left, top, right - left, thickness, 4);
      ctx.fillStyle = plankGrad;
      ctx.fill(path);
      ctx.strokeStyle = 'rgba(30,18,9,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke(path);

      ctx.strokeStyle = 'rgba(70,40,15,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = left + 10; gx < right - 10; gx += 42) {
        ctx.moveTo(gx, top + 4);
        ctx.lineTo(gx + 22, bottom - 4);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(left + 2, top + 1.8);
      ctx.lineTo(right - 2, top + 1.8);
      ctx.stroke();

      // Pinos de latão nas pontas que fazem fronteira com um vão (não nas
      // pontas que encostam no trilho) — marca claramente "a parede acaba
      // aqui, começa a abertura", no mesmo estilo dos pinos do estilingue.
      const caps = [];
      if (left > 0.5) caps.push(left);
      if (right < BOARD.width - 0.5) caps.push(right);
      for (const cx of caps) {
        ctx.beginPath();
        ctx.arc(cx, y, 5.5, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx - 2, y - 2, 1, cx, y, 5.5);
        g.addColorStop(0, '#f3dd8a');
        g.addColorStop(1, COLORS.brassDark);
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Disco simples: mesma madeira pra todos, sem distinção de cor — na
  // versão analógica os discos são anônimos de propósito, porque não há
  // posse fixa, só importa de que lado do tabuleiro cada um está agora.
  // Sem os adornos metálicos do Curling — mais fiel ao disco liso da foto
  // de referência.
  // Levemente tridimensional: sombra de contato deslocada e borrada (o
  // disco "flutua" um pouco sobre a mesa) + um verniz diagonal (gradiente
  // LINEAR, não radial) simulando luz vindo de cima-esquerda — lê como um
  // chanfro/borda arredondada de uma ficha de verdade. Gradiente RADIAL
  // foi testado antes e descartado (lia como bola/esfera, não como peça
  // chapada de madeira) — a diferença chave é que o linear não tem um
  // "pico" de brilho centralizado, só uma transição suave de canto a
  // canto, então mantém a leitura de disco chapado.
  // highlighted: disco agarrado pelo jogador agora (clicado) — em vez do
  // elástico ir visualmente até ele (ver drawSling), o próprio disco fica
  // num tom bem mais claro pra sinalizar "este é o que vai ser lançado".
  function drawPiece(ctx, x, y, highlighted) {
    const r = BOARD.pieceRadius;
    const base = highlighted ? COLORS.discWoodHighlight : COLORS.discWood;
    const dark = COLORS.discWoodDark;

    ctx.save();
    ctx.translate(x, y);

    ctx.save();
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.ellipse(2, 3.5, r * 0.95, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = base;
    ctx.fill();

    const sheen = ctx.createLinearGradient(-r * 0.7, -r * 0.7, r * 0.7, r * 0.7);
    sheen.addColorStop(0, 'rgba(255,255,255,0.28)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = sheen;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = dark;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.stroke();

    ctx.restore();
  }

  // Aro pontilhado pulsante ao redor do disco que a máquina está mirando —
  // mesmo visual do "arraste isto" do Sjoelen (ver drawAimHint em
  // sjoelen/js/render.js), reaproveitado aqui como sinal de "isto vai ser
  // lançado" no lugar do elástico ir visualmente até o disco. Cinza escuro
  // em vez do dourado original — mais contraste contra o azul claro da
  // superfície E contra a madeira do disco (o dourado se perdia perto do
  // latão do estilingue e dos tons quentes do tabuleiro).
  function drawAimHint(ctx, x, y, t) {
    ctx.save();
    const pulse = (Math.sin(t * Math.PI * 1.6) + 1) / 2;
    const r = BOARD.pieceRadius + 10 + pulse * 5;
    ctx.strokeStyle = `rgba(32, 30, 28, ${(0.78 + pulse * 0.2).toFixed(2)})`;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 8]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Seta de prévia durante o arrasto — mostra a direção e força REAIS do
  // tiro (mesma conta de computeShot em game.js, não a geometria "crua" do
  // elástico até o disco). Necessária porque a direção de disparo agora é
  // dominada pelo GESTO do puxão (não só pela posição das duas âncoras
  // fixas — ver comentário de resolveRelease em game.js), então o
  // triângulo do elástico (sempre esticado até a posição real do disco)
  // podia sugerir um ângulo bem diferente do que o disco de fato ia fazer
  // — a seta fecha essa lacuna, sempre honesta sobre o resultado real.
  function drawThrowIndicator(ctx, x, y, dirX, dirY, ratio) {
    ctx.save();
    const len = 24 + ratio * 55;
    const tipX = x + dirX * len;
    const tipY = y + dirY * len;
    ctx.strokeStyle = 'rgba(212,175,55,0.92)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const headLen = 11;
    const angle = Math.atan2(dirY, dirX);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - Math.PI / 6), tipY - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle + Math.PI / 6), tipY - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
    ctx.restore();
  }

  // Número grande da contagem regressiva, no centro do tabuleiro — um véu
  // escuro por baixo garante leitura mesmo com discos/superfície azul
  // clara atrás. progress vai de 0 (número acabou de trocar, "estoura"
  // maior) a 1 (prestes a trocar pro próximo) — dá um efeito de pulso a
  // cada segundo em vez de um número estático.
  function drawCountdown(ctx, boardW, boardH, label, progress) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,4,0.45)';
    ctx.fillRect(0, 0, boardW, boardH);

    const scale = 1.35 - progress * 0.35;
    ctx.translate(boardW / 2, boardH / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 150px "Bagel Fat One", cursive';
    ctx.fillStyle = COLORS.cream;
    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 16;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawSling(ctx, anchorL, anchorR, pieceX, pieceY, color) {
    ctx.save();
    ctx.strokeStyle = color || COLORS.navy;
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
    drawRails,
    drawDivider,
    drawPiece,
    drawAimHint,
    drawThrowIndicator,
    drawCountdown,
    drawSling,
    drawLogo
  };
})();
