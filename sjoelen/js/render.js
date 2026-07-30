// Desenho em canvas: tabuleiro de madeira, compartimentos numerados, trilhos,
// disco, estilingue e logotipo. Moldura/madeira/estilingue/logo reaproveitados
// do Curling de Mesa; o alvo vira 4 compartimentos numerados e o disco perde
// a cor de jogador (só existe um conjunto de peças brancas, compartilhado).

const GameRender = (function () {
  let woodPattern = null;
  // CanvasPattern já resolvido pro contexto do jogo — criar um
  // ctx.createPattern novo a cada quadro (antes acontecia 2x por quadro,
  // em drawWoodFrame E drawRails) é desperdício: só existe um canvas/ctx
  // durante a partida inteira, então cacheia e reaproveita.
  let cachedPattern = null;
  let cachedPatternCtx = null;

  function getWoodPattern(ctx) {
    if (!woodPattern) buildWoodPattern();
    if (cachedPattern && cachedPatternCtx === ctx) return cachedPattern;
    cachedPattern = ctx.createPattern(woodPattern, 'repeat');
    cachedPatternCtx = ctx;
    return cachedPattern;
  }

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
    ctx.fillStyle = getWoodPattern(ctx);
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

    const split = BOARD.laneSplitY;
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

    // linhas tracejadas laterais (estilo shuffleboard) — mais contraste no
    // trecho sobre o fundo azul (mais escuro que o amarelo, a opacidade
    // original ficava fraca demais ali) a pedido explícito.
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 10]);
    for (let i = 1; i < 10; i++) {
      const y = BOARD.gateY + ((BOARD.height - BOARD.gateY) / 10) * i;
      ctx.strokeStyle = y >= split ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.22)';
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

    // A linha de lançamento (sólida) e a linha tracejada do limite de trás
    // da zona útil foram removidas a pedido — a própria área azul e a
    // ponte de madeira (ver drawLaneBridge) já marcam isso sem precisar de
    // linhas extra.

    ctx.restore();
  }

  // "Ponte de madeira" separando a área amarela (longe) da azul (útil de
  // lançamento) — baseada na foto do tabuleiro analógico de referência.
  // Mesma linguagem visual dos divisores dos compartimentos (ver
  // drawDividers): sombra por baixo pra sugerir que está erguida, e o
  // disco passa por baixo livremente — só visual, a física não bloqueia
  // nada aqui (ver BOARD.laneSplitY, compartilhado com clampPos).
  function drawLaneBridge(ctx) {
    ctx.save();
    const y = BOARD.laneSplitY;
    const thickness = 16;
    const top = y - thickness / 2;
    const bottom = y + thickness / 2;
    // Estende a ponte pra dentro dos trilhos laterais de propósito — o
    // pedido foi pra ela se sobrepor às laterais, como uma trave de
    // verdade cruzando de um lado ao outro, em vez de parar só dentro da
    // área de jogo.
    const railOverlap = BOARD.railThickness * 0.65;
    const left = -railOverlap;
    const right = BOARD.width + railOverlap;

    ctx.save();
    ctx.filter = 'blur(3px)';
    ctx.fillStyle = 'rgba(20,13,7,0.4)';
    ctx.fillRect(left + 6, bottom + 1, right - left - 12, 6);
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

    // veio de madeira em diagonais curtas repetidas ao longo da ponte
    ctx.strokeStyle = 'rgba(70,40,15,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = left + 16; gx < right - 16; gx += 42) {
      ctx.moveTo(gx, top + 4);
      ctx.lineTo(gx + 22, bottom - 4);
    }
    ctx.stroke();

    // friso de brilho na borda de cima (luz vindo de cima)
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left + 2, top + 1.8);
    ctx.lineTo(right - 2, top + 1.8);
    ctx.stroke();

    ctx.restore();
  }

  // Os 4 compartimentos numerados (2, 3, 4, 1 da esquerda pra direita) —
  // substitui o alvo circular do Curling.
  function drawSlots(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Mesma família da label "JOGADOR 1" no placar (--font-body em
    // theme.css) — antes usava "Special Elite", que nunca foi carregada
    // no projeto (sem @font-face/import em lugar nenhum) e sempre caiu
    // silenciosamente pro fallback "Courier New".
    ctx.font = '700 40px "Elms Sans", "Helvetica Neue", Arial, sans-serif';

    for (const slot of BOARD.slots) {
      // piso do compartimento — cor própria (laranja), separando bem cada
      // casa do resto da faixa amarela da pista.
      ctx.fillStyle = COLORS.compartmentFloor;
      ctx.fillRect(slot.xMin, BOARD.compartmentBackY, slot.xMax - slot.xMin, BOARD.gateY - BOARD.compartmentBackY);

      // número da casa no mesmo creme do logo — lê bem sobre o laranja.
      ctx.fillStyle = COLORS.cream;
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
    // Acabamento "torneado" (gradiente claro no centro, escuro nas bordas
    // — mesma linguagem visual da ponte/divisores dos compartimentos) em
    // vez da textura de veio corrida de antes — a pedido, pra as laterais
    // combinarem com a aparência da barra divisória.
    const rt = BOARD.railThickness;

    // trilho esquerdo — gradiente ao longo da espessura (horizontal)
    const leftGrad = ctx.createLinearGradient(-rt, 0, 0, 0);
    leftGrad.addColorStop(0, COLORS.woodDark);
    leftGrad.addColorStop(0.5, COLORS.woodLight);
    leftGrad.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = leftGrad;
    ctx.fillRect(-rt, -rt, rt, BOARD.height + rt * 2);

    // trilho direito
    const rightGrad = ctx.createLinearGradient(BOARD.width, 0, BOARD.width + rt, 0);
    rightGrad.addColorStop(0, COLORS.woodDark);
    rightGrad.addColorStop(0.5, COLORS.woodLight);
    rightGrad.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = rightGrad;
    ctx.fillRect(BOARD.width, -rt, rt, BOARD.height + rt * 2);

    // trilho de baixo — gradiente ao longo da espessura (vertical)
    const bottomGrad = ctx.createLinearGradient(0, BOARD.height, 0, BOARD.height + rt);
    bottomGrad.addColorStop(0, COLORS.woodDark);
    bottomGrad.addColorStop(0.5, COLORS.woodLight);
    bottomGrad.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(-rt, BOARD.height, BOARD.width + rt * 2, rt);

    // parede de fundo dos compartimentos
    const backGrad = ctx.createLinearGradient(0, BOARD.compartmentBackY - rt, 0, BOARD.compartmentBackY);
    backGrad.addColorStop(0, COLORS.woodDark);
    backGrad.addColorStop(0.5, COLORS.woodLight);
    backGrad.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = backGrad;
    ctx.fillRect(-rt, BOARD.compartmentBackY - rt, BOARD.width + rt * 2, rt);

    // friso de brilho
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-rt + 1, -rt + 1, rt - 2, BOARD.height + rt * 2 - 2);
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
  //
  // Desenhado uma vez só num canvas fora de tela (sprite) e depois só
  // "carimbado" com drawImage a cada disco/quadro — antes recriava 3
  // gradientes radiais POR DISCO, A CADA QUADRO (com até 12 discos no
  // fim do turno, 36+ gradientes/quadro); em celular mais fraco isso
  // pesa muito mais do que num desktop. O raio é sempre BOARD.pieceRadius
  // (constante), então um sprite só serve pra qualquer disco.
  let pieceSprite = null;
  const PIECE_SPRITE_SCALE = 3; // supersampling — mantém nítido em telas HiDPI (celular)

  function buildPieceSprite() {
    const r = BOARD.pieceRadius;
    const pad = 6; // folga pra sombra não cortar na borda
    const size = (r + pad) * 2;
    const off = document.createElement('canvas');
    off.width = size * PIECE_SPRITE_SCALE;
    off.height = size * PIECE_SPRITE_SCALE;
    const c = off.getContext('2d');
    c.scale(PIECE_SPRITE_SCALE, PIECE_SPRITE_SCALE);
    c.translate(size / 2, size / 2);

    c.beginPath();
    c.ellipse(2, 4, r * 0.98, r * 0.98, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fill();

    // disco de madeira clara (aro externo)
    const rimGrad = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    rimGrad.addColorStop(0, COLORS.woodLight);
    rimGrad.addColorStop(1, COLORS.woodDark);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = rimGrad;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = COLORS.woodDark;
    c.stroke();

    // topo branco/creme (em vez do anel colorido de jogador do Curling)
    c.beginPath();
    c.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    const ringGrad = c.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.05, 0, 0, r * 0.72);
    ringGrad.addColorStop(0, '#ffffff');
    ringGrad.addColorStop(1, COLORS.creamDark);
    c.fillStyle = ringGrad;
    c.fill();

    // esfera metálica central
    c.beginPath();
    c.arc(0, 0, r * 0.3, 0, Math.PI * 2);
    const metalGrad = c.createRadialGradient(-r * 0.1, -r * 0.12, r * 0.02, 0, 0, r * 0.3);
    metalGrad.addColorStop(0, '#f5f5f5');
    metalGrad.addColorStop(0.4, '#b8bcc4');
    metalGrad.addColorStop(1, '#5a5f68');
    c.fillStyle = metalGrad;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.stroke();

    c.beginPath();
    c.arc(-r * 0.12, -r * 0.14, r * 0.08, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fill();

    pieceSprite = { canvas: off, size };
  }

  function drawPiece(ctx, x, y) {
    if (!pieceSprite) buildPieceSprite();
    const { canvas, size } = pieceSprite;
    ctx.drawImage(canvas, x - size / 2, y - size / 2, size, size);
  }

  // Aro pontilhado pulsante ao redor do disco parado esperando o
  // arremesso — sinaliza "arraste isto". Aumentado e com mais contraste a
  // pedido (o disco ficou menor — pieceRadius 22, era 28 — e o aro
  // original passava despercebido, principalmente em telas maiores).
  function drawAimHint(ctx, x, y, t) {
    ctx.save();
    const pulse = (Math.sin(t * Math.PI * 1.6) + 1) / 2; // 0..1
    const r = BOARD.pieceRadius + 16 + pulse * 7;
    ctx.strokeStyle = `rgba(232, 185, 35, ${(0.6 + pulse * 0.35).toFixed(2)})`;
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 8]);
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

  // Pulso de confirmação quando um disco pontua — anel que expande e some,
  // no mesmo creme do logo/números. progress vai de 0 (acabou de pontuar)
  // a 1 (totalmente sumido); quem chama controla o tempo (ver
  // e.scoredAt em game.js).
  function drawScorePulse(ctx, x, y, progress) {
    ctx.save();
    // Aumentado (expande mais, começa mais opaco, anel mais grosso) — a
    // versão original (raio até 2.6x, alpha até 0.75) ficava fácil de
    // perder no meio de todo o resto acontecendo na tela.
    const r = BOARD.pieceRadius * (1 + progress * 2.4);
    const alpha = (1 - progress) * 0.95;
    ctx.strokeStyle = `rgba(240,230,210,${alpha.toFixed(2)})`;
    ctx.lineWidth = 4.5 * (1 - progress) + 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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

  // Rails + pista + casas + divisores nunca mudam durante uma partida (só
  // dependem de BOARD/COLORS, constantes) — mas antes eram redesenhados
  // por inteiro TODO quadro, incluindo 2 gradientes da pista, o texto dos
  // números, e o borrão (ctx.filter blur, caro em celular) da sombra de
  // cada um dos 3 divisores. Agora desenha tudo isso uma única vez num
  // canvas fora de tela e só "carimba" essa imagem a cada quadro.
  let staticBgCache = null;

  function buildStaticBackground() {
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    const scale = 2; // supersampling — nítido em telas HiDPI sem depender do dpr real
    const off = document.createElement('canvas');
    off.width = totalW * scale;
    off.height = totalH * scale;
    const c = off.getContext('2d');
    c.scale(scale, scale);
    c.translate(BOARD.railThickness, BOARD.railThickness);
    drawRails(c);
    drawPlaySurface(c);
    drawSlots(c);
    drawDividers(c);
    staticBgCache = { canvas: off, totalW, totalH };
  }

  function drawStaticBackground(ctx) {
    if (!staticBgCache) buildStaticBackground();
    const { canvas, totalW, totalH } = staticBgCache;
    ctx.drawImage(canvas, -BOARD.railThickness, -BOARD.railThickness, totalW, totalH);
  }

  return {
    buildWoodPattern,
    drawWoodFrame,
    drawStaticBackground,
    drawPlaySurface,
    drawLaneBridge,
    drawSlots,
    drawRails,
    drawDividers,
    drawPiece,
    drawScorePulse,
    drawAimHint,
    drawThrowIndicator,
    drawLogo
  };
})();
