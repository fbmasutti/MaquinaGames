// Desenho em canvas: tabuleiro de madeira, compartimentos numerados, trilhos,
// disco, estilingue e logotipo. Moldura/madeira/estilingue/logo reaproveitados
// do Curling de Mesa; o alvo vira 4 compartimentos numerados e o disco perde
// a cor de jogador (só existe um conjunto de peças brancas, compartilhado).

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

  // Pista com duas faixas de cor (azul perto do jogador, amarelo perto dos
  // compartimentos) — inspirada no tabuleiro físico de referência.
  function drawPlaySurface(ctx) {
    ctx.save();

    const split = BOARD.gateY + (BOARD.height - BOARD.gateY) * 0.4;
    const gradFar = ctx.createLinearGradient(0, BOARD.compartmentBackY, 0, split);
    gradFar.addColorStop(0, COLORS.laneFar);
    gradFar.addColorStop(1, COLORS.laneFarDark);
    ctx.fillStyle = gradFar;
    ctx.fillRect(0, 0, BOARD.width, split);

    const gradNear = ctx.createLinearGradient(0, split, 0, BOARD.height);
    gradNear.addColorStop(0, COLORS.laneNear);
    gradNear.addColorStop(1, COLORS.laneNearDark);
    ctx.fillStyle = gradNear;
    ctx.fillRect(0, split, BOARD.width, BOARD.height - split);

    // linhas tracejadas laterais (estilo shuffleboard)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    for (let i = 1; i < 10; i++) {
      const y = BOARD.gateY + ((BOARD.height - BOARD.gateY) / 10) * i;
      ctx.beginPath();
      ctx.moveTo(14, y);
      ctx.lineTo(BOARD.width - 14, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // linha do gate (onde os corredores terminam) — bem visível, é a linha
    // que "conta ou não conta" do jogo real
    ctx.strokeStyle = 'rgba(45,54,82,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, BOARD.gateY);
    ctx.lineTo(BOARD.width - 6, BOARD.gateY);
    ctx.stroke();

    // linha de lançamento
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, BOARD.shootLineY);
    ctx.lineTo(BOARD.width - 20, BOARD.shootLineY);
    ctx.stroke();

    ctx.restore();
  }

  // Os 4 compartimentos numerados (2, 3, 4, 1 da esquerda pra direita) —
  // substitui o alvo circular do Curling.
  function drawSlots(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 40px "Special Elite", "Courier New", monospace';

    for (const slot of BOARD.slots) {
      // piso do compartimento — leve realce pra separar visualmente do resto da faixa amarela
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(slot.xMin, BOARD.compartmentBackY, slot.xMax - slot.xMin, BOARD.gateY - BOARD.compartmentBackY);

      ctx.fillStyle = 'rgba(45,54,82,0.75)';
      ctx.fillText(String(slot.value), slot.centerX, (BOARD.compartmentBackY + BOARD.gateY) / 2);
    }

    // Contorno preto marcando o limite de dentro de cada casa — mesma
    // linguagem visual dos "buracos" nos outros jogos da série (borda escura
    // = limite funcional). A linha do gate (embaixo) é mais grossa e escura
    // aqui de propósito: é sobre ela que o separador de madeira "flutua",
    // ver drawRails.
    ctx.strokeStyle = 'rgba(20,13,7,0.8)';
    ctx.lineWidth = 2.5;
    for (const slot of BOARD.slots) {
      ctx.beginPath();
      ctx.moveTo(slot.xMin, BOARD.compartmentBackY);
      ctx.lineTo(slot.xMin, BOARD.gateY);
      ctx.moveTo(slot.xMax, BOARD.compartmentBackY);
      ctx.lineTo(slot.xMax, BOARD.gateY);
      ctx.stroke();
    }
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(BOARD.slots[0].xMin, BOARD.gateY);
    ctx.lineTo(BOARD.slots[BOARD.slots.length - 1].xMax, BOARD.gateY);
    ctx.stroke();

    ctx.restore();
  }

  function drawRails(ctx) {
    ctx.save();
    ctx.fillStyle = COLORS.woodDark;
    // trilhos laterais (do topo do tabuleiro até o fim) e o de baixo
    ctx.fillRect(-BOARD.railThickness, -BOARD.railThickness, BOARD.railThickness, BOARD.height + BOARD.railThickness * 2);
    ctx.fillRect(BOARD.width, -BOARD.railThickness, BOARD.railThickness, BOARD.height + BOARD.railThickness * 2);
    ctx.fillRect(-BOARD.railThickness, BOARD.height, BOARD.width + BOARD.railThickness * 2, BOARD.railThickness);
    // parede de fundo dos compartimentos
    ctx.fillRect(
      -BOARD.railThickness,
      BOARD.compartmentBackY - BOARD.railThickness,
      BOARD.width + BOARD.railThickness * 2,
      BOARD.railThickness
    );
    // friso de brilho
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-BOARD.railThickness + 1, -BOARD.railThickness + 1, BOARD.railThickness - 2, BOARD.height + BOARD.railThickness * 2 - 2);
    ctx.restore();
  }

  // Divisores entre compartimentos — taco de madeira "flutuando" sobre a
  // linha preta do gate (ver drawSlots): o preenchimento de madeira para um
  // pouco ANTES de gateY (RAISED_GAP), deixando a linha preta e um vão
  // aparecerem por baixo — dá a impressão de que o disco passa por baixo do
  // taco, em vez de bater numa parede que desce até o chão. A física (ver
  // physics.js) continua usando a altura cheia até gateY — é só um efeito
  // visual, igual à referência do tabuleiro de madeira de verdade.
  //
  // IMPORTANTE: chamada DEPOIS de drawPlaySurface no game.js — a faixa
  // amarela da pista cobre a área inteira dos compartimentos, então
  // desenhar os tacos antes (dentro de drawRails, como estava) fazia o
  // preenchimento da pista apagar o taco por cima, sobrando só as linhas
  // pretas do contorno (ver drawSlots) por cima da faixa amarela lisa.
  function drawDividers(ctx) {
    ctx.save();
    const RAISED_GAP = 11;
    const dividerHeight = BOARD.gateY - BOARD.compartmentBackY - RAISED_GAP;
    for (const cx of BOARD.dividerCenters) {
      const left = cx - BOARD.dividerThickness / 2;
      const top = BOARD.compartmentBackY;
      const bottom = top + dividerHeight;

      // sombra projetada no chão do compartimento, logo abaixo da ponta do
      // taco — reforça a leitura de que ele está erguido, não encostado.
      ctx.save();
      ctx.filter = 'blur(2px)';
      ctx.fillStyle = 'rgba(20,13,7,0.45)';
      ctx.beginPath();
      ctx.ellipse(cx, bottom + 7, BOARD.dividerThickness * 0.8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // taco de madeira: gradiente claro→escuro pra sugerir a curvatura de
      // uma peça arredondada (não uma tábua chapada). Contraste reforçado
      // contra a pista amarela (cores base ficavam parecidas demais) com um
      // contorno escuro nas duas bordas.
      const plankGrad = ctx.createLinearGradient(left, 0, left + BOARD.dividerThickness, 0);
      plankGrad.addColorStop(0, COLORS.woodDark);
      plankGrad.addColorStop(0.5, COLORS.woodLight);
      plankGrad.addColorStop(1, COLORS.woodDark);
      const path = new Path2D();
      path.roundRect(
        left,
        top,
        BOARD.dividerThickness,
        dividerHeight,
        [0, 0, BOARD.dividerThickness / 2, BOARD.dividerThickness / 2]
      );
      ctx.fillStyle = plankGrad;
      ctx.fill(path);
      ctx.strokeStyle = 'rgba(30,18,9,0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke(path);

      // veio de madeira sutil ao longo do taco
      ctx.strokeStyle = 'rgba(70,40,15,0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 2, top + 4);
      ctx.lineTo(cx - 2, bottom - 6);
      ctx.moveTo(cx + 3, top + 8);
      ctx.lineTo(cx + 3, bottom - 10);
      ctx.stroke();

      // friso de brilho na borda esquerda (luz vinda de cima/esquerda)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(left + 1.8, top + 3);
      ctx.lineTo(left + 1.8, bottom - 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Disco branco único (sem cor de jogador — o conjunto de peças é
  // compartilhado, só um jogador por vez tem peças no tabuleiro).
  function drawPiece(ctx, x, y) {
    const r = BOARD.pieceRadius;

    ctx.save();
    ctx.translate(x, y);

    ctx.beginPath();
    ctx.ellipse(2, 4, r * 0.98, r * 0.98, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    // disco de madeira clara (aro externo)
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

    // topo branco/creme (em vez do anel colorido de jogador do Curling)
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    const ringGrad = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.05, 0, 0, r * 0.72);
    ringGrad.addColorStop(0, '#ffffff');
    ringGrad.addColorStop(1, COLORS.creamDark);
    ctx.fillStyle = ringGrad;
    ctx.fill();

    // esfera metálica central
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    const metalGrad = ctx.createRadialGradient(-r * 0.1, -r * 0.12, r * 0.02, 0, 0, r * 0.3);
    metalGrad.addColorStop(0, '#f5f5f5');
    metalGrad.addColorStop(0.4, '#b8bcc4');
    metalGrad.addColorStop(1, '#5a5f68');
    ctx.fillStyle = metalGrad;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.14, r * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();

    ctx.restore();
  }

  // Aro pontilhado pulsante ao redor do disco parado esperando o
  // arremesso — sinaliza "arraste isto", já que os discos ficaram menores
  // (pieceRadius 22, era 28) e um disco pequeno sozinho pode passar
  // despercebido, principalmente em telas maiores.
  function drawAimHint(ctx, x, y, t) {
    ctx.save();
    const pulse = (Math.sin(t * Math.PI * 1.6) + 1) / 2; // 0..1
    const r = BOARD.pieceRadius + 9 + pulse * 4;
    ctx.strokeStyle = `rgba(232, 185, 35, ${(0.45 + pulse * 0.35).toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 7]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Seta de prévia durante o arrasto — direção e força (comprimento) do
  // arremesso, lida direto da velocidade real do gesto até aquele
  // instante (mesmo cálculo usado de verdade na soltura, ver input.js).
  function drawThrowIndicator(ctx, x, y, dirX, dirY, strength) {
    ctx.save();
    const len = 30 + Math.min(1, strength) * 70;
    const tipX = x + dirX * len;
    const tipY = y + dirY * len;
    ctx.strokeStyle = 'rgba(232, 185, 35, 0.85)';
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
    drawSlots,
    drawRails,
    drawDividers,
    drawPiece,
    drawAimHint,
    drawThrowIndicator,
    drawLogo
  };
})();
