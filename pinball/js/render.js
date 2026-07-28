// Desenho do tabuleiro — Pinball.
// A arte do campo é o PRÓPRIO vetor do playfield (fidelidade total ao SVG
// enviado como referência), desenhado via Path2D com o mesmo transform do
// arquivo original. Só a bola, os flippers, o sino cromado e a mola do
// lançador são desenhados à parte (não existem — ou não têm volume — no
// vetor 2D chapado).

const GameRender = (function () {
  // Playfield 4.svg tem 19 <path> de topo SEPARADOS (não mais um compound
  // path só) — um Path2D por elemento, cada um com seu fill() independente.
  // Ver a nota grande em playfield-path.js: concatenar tudo num Path2D único
  // quebra a paridade de enrolamento de cada furo redondo.
  let artPaths = null;
  let fieldRegion = null;
  let outlinePath = null;

  function ensurePaths() {
    if (artPaths) return;
    artPaths = PLAYFIELD_PATHS.map((d) => new Path2D(d));
    fieldRegion = buildFieldRegion().path;
    // Formato real do contorno externo (não a aproximação por faixas de Y
    // usada pro creme) — só essa forma é bem-comportada o bastante (sem
    // auto-interseção) pra ser TRAÇADA como moldura de madeira. É sempre
    // PLAYFIELD_PATHS[0] (path1, a estrutura principal).
    outlinePath = new Path2D(PLAYFIELD_PATHS[0]);
  }

  // Silhueta aproximada do playfield pra pintar o verde-menta só dentro da
  // moldura: para cada faixa de Y, o x mínimo/máximo do contorno da forma
  // principal do vetor (a que contém as paredes externas).
  function buildFieldRegion() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', String(PLAYFIELD_SVG_W));
    svg.setAttribute('height', String(PLAYFIELD_SVG_H));
    svg.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
    document.body.appendChild(svg);
    const el = document.createElementNS(NS, 'path');
    // A primeira forma do vetor (maior bbox) é a estrutura externa.
    el.setAttribute('d', PLAYFIELD_PATHS[0]);
    svg.appendChild(el);

    const total = el.getTotalLength();
    const N = 2400;
    const band = 16;
    const buckets = new Map();
    for (let i = 0; i <= N; i++) {
      const q = el.getPointAtLength((total * i) / N);
      const x = PLAYFIELD_PATH_SCALE * q.x;
      const y = PLAYFIELD_FLIP_Y
        ? PLAYFIELD_SVG_H - PLAYFIELD_PATH_SCALE * q.y
        : PLAYFIELD_PATH_SCALE * q.y;
      const k = Math.round(y / band);
      const cur = buckets.get(k);
      if (!cur) buckets.set(k, { y: k * band, min: x, max: x });
      else {
        if (x < cur.min) cur.min = x;
        if (x > cur.max) cur.max = x;
      }
    }
    svg.remove();

    const rows = [...buckets.values()].sort((a, b) => a.y - b.y);
    // Um pouco mais recuado que antes (2px) pra o creme não vazar por baixo
    // da linha azul do contorno desenhado no vetor.
    const inset = 6;
    const p = new Path2D();
    rows.forEach((r, i) => {
      const x = r.min + inset;
      if (i === 0) p.moveTo(x, r.y);
      else p.lineTo(x, r.y);
    });
    for (let i = rows.length - 1; i >= 0; i--) {
      p.lineTo(rows[i].max - inset, rows[i].y);
    }
    p.closePath();
    return { path: p, rows };
  }

  function drawBackground(ctx) {
    ensurePaths();
    ctx.fillStyle = COLORS.cabinet;
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);

    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, BOARD.height);
    grad.addColorStop(0, COLORS.field);
    grad.addColorStop(1, COLORS.fieldEdge);
    ctx.fillStyle = grad;
    ctx.fill(fieldRegion);
    ctx.restore();
  }

  function drawArt(ctx) {
    ensurePaths();
    ctx.save();
    if (PLAYFIELD_FLIP_Y) {
      ctx.translate(0, PLAYFIELD_SVG_H);
      ctx.scale(PLAYFIELD_PATH_SCALE, -PLAYFIELD_PATH_SCALE);
    } else {
      ctx.scale(PLAYFIELD_PATH_SCALE, PLAYFIELD_PATH_SCALE);
    }
    // Contorno dourado em CADA forma do vetor (arcos, aros dos furos, sino,
    // guias, rampa) — não só na silhueta externa (ver drawWoodBorder), e
    // MESMA técnica dela: traçado ANTES do preenchimento, não por cima. Todas
    // as bordas primeiro, depois todos os preenchimentos por cima — assim o
    // azul de uma forma nunca tampa o traço dourado de uma forma vizinha
    // desenhada antes dela na lista; o preenchimento de CADA forma cobre só
    // a metade interna do seu PRÓPRIO traço, sobrando uma franja dourada fina
    // bem na linha — antes, traçado por cima do preenchimento, a linha
    // inteira flutuava sobre a arte, grossa e "distante" das formas.
    ctx.strokeStyle = COLORS.woodLight;
    ctx.lineWidth = 5 / PLAYFIELD_PATH_SCALE;
    ctx.globalAlpha = 1;
    for (const p of artPaths) ctx.stroke(p);
    ctx.fillStyle = COLORS.art;
    for (const p of artPaths) ctx.fill(p);
    ctx.restore();

    drawDomeCapFix(ctx);
  }

  // O topo do vetor (playfield3.svg) chega perto de um semicírculo perfeito
  // mas fica uns pixels "achatado" bem no ápice — um leve corte que o
  // usuário pediu pra arredondar. Como é um detalhe mínimo (poucos px),
  // não vale reamostrar o contorno: só cobre o ápice com uma curva suave
  // que estende visualmente o mesmo arco até um ponto, por cima da arte.
  function drawDomeCapFix(ctx) {
    ctx.save();
    ctx.fillStyle = COLORS.art;
    ctx.beginPath();
    ctx.moveTo(411, 4);
    ctx.quadraticCurveTo(BOARD.width / 2, -8, 441, 4);
    ctx.lineTo(441, 10);
    ctx.quadraticCurveTo(BOARD.width / 2, -2, 411, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Portinhola do tubo do lançador: uma aba de metal com dois rebites, presa
  // por uma dobradiça do lado do campo (x1,y1 — o ponto mais à esquerda do
  // segmento, ver LAUNCHER_DOOR). `openness` já vem animada quadro a quadro
  // de GamePhysics.getDoorOpenness() — reage à posição real da bola, não só
  // a um estado binário distante (ver updateDoor em physics.js). Antes só
  // "afinava" a espessura no lugar (scale em Y) — não lia como abrir, só como
  // encolher. Agora gira de verdade em torno da dobradiça, pra fora do
  // caminho da bola (reportado: "a animação não funcionou no meu teste").
  function drawLauncherDoor(ctx, openness) {
    const d = LAUNCHER_DOOR;
    const restAngle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    const swing = openness * (100 * Math.PI / 180);
    const angle = restAngle - swing;
    ctx.save();
    ctx.translate(d.x1, d.y1);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, -d.thickness / 2, 0, d.thickness / 2);
    g.addColorStop(0, COLORS.woodLight);
    g.addColorStop(0.5, COLORS.brass);
    g.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(0, -d.thickness / 2, len, d.thickness, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,28,12,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#3a281a';
    ctx.beginPath();
    ctx.arc(len * 0.28, 0, 3, 0, Math.PI * 2);
    ctx.arc(len * 0.72, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Borda de madeira no contorno do playfield: a parede externa do próprio
  // vetor já é grossa (chega à borda do canvas em vários pontos), então uma
  // moldura desenhada por FORA dela ficaria fora da tela. Em vez disso, essa
  // borda é um traço sobre a MESMA linha onde o creme encontra o azul — mas
  // desenhada ANTES da arte (não por cima), pra a metade interna do traço
  // ficar coberta pelo próprio azul do vetor e só a faixa de fora apareça,
  // sem tampar a linha azul original.
  function drawWoodBorder(ctx) {
    ctx.save();
    if (PLAYFIELD_FLIP_Y) {
      ctx.translate(0, PLAYFIELD_SVG_H);
      ctx.scale(PLAYFIELD_PATH_SCALE, -PLAYFIELD_PATH_SCALE);
    } else {
      ctx.scale(PLAYFIELD_PATH_SCALE, PLAYFIELD_PATH_SCALE);
    }
    const g = ctx.createLinearGradient(0, 0, BOARD.width, 0);
    g.addColorStop(0, COLORS.woodDark);
    g.addColorStop(0.5, COLORS.woodLight);
    g.addColorStop(1, COLORS.woodDark);
    ctx.strokeStyle = g;
    ctx.lineWidth = 12 / PLAYFIELD_PATH_SCALE;
    ctx.lineJoin = 'round';
    ctx.stroke(outlinePath);
    // Um segundo traço mais fino e mais claro por cima, só pra reforçar o
    // brilho — o usuário gostou do resultado e pediu pra "reforçar levemente".
    ctx.strokeStyle = COLORS.woodLight;
    ctx.lineWidth = 4 / PLAYFIELD_PATH_SCALE;
    ctx.globalAlpha = 0.55;
    ctx.stroke(outlinePath);
    ctx.restore();
  }

  // Campainha de balcão VISTA DE CIMA (a referência anterior era de lado —
  // trocada): contorno preto, disco prateado (com um leve gradiente só pra
  // sugerir o metal, não um relevo 3D) e um pequeno sininho/botão no centro,
  // como se estivéssemos olhando de cima pro topo da cúpula.
  function drawBell(ctx, bell) {
    if (!bell) return;
    const { x, y, r } = bell;
    ctx.save();

    // contorno preto
    ctx.fillStyle = '#111214';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // disco prateado
    const silverR = r * 0.86;
    const g = ctx.createRadialGradient(
      x - silverR * 0.3, y - silverR * 0.3, silverR * 0.1,
      x, y, silverR
    );
    g.addColorStop(0, '#f4f6f7');
    g.addColorStop(0.55, '#c7ccd0');
    g.addColorStop(0.85, '#9aa1a6');
    g.addColorStop(1, '#7d848a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, silverR, 0, Math.PI * 2);
    ctx.fill();

    // reflexo de luz, sutil
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(x - silverR * 0.35, y - silverR * 0.4, silverR * 0.32, silverR * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // sininho/botão central
    const knobR = r * 0.22;
    ctx.fillStyle = '#111214';
    ctx.beginPath();
    ctx.arc(x, y, knobR + 2, 0, Math.PI * 2);
    ctx.fill();
    const knobG = ctx.createRadialGradient(
      x - knobR * 0.3, y - knobR * 0.3, knobR * 0.1,
      x, y, knobR
    );
    knobG.addColorStop(0, '#ffffff');
    knobG.addColorStop(1, '#9aa1a6');
    ctx.fillStyle = knobG;
    ctx.beginPath();
    ctx.arc(x, y, knobR, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Pulso branco no bumper de elástico que acabou de ser tocado (posição
  // real do corpo atingido, não uma posição fixa) — mesmo espírito do flash
  // dos elásticos laterais, só que pontual em vez de ao longo de um traço.
  // Brilho reforçado (pedido explícito) — raio maior, mais opaco no centro,
  // e um núcleo quase branco-sólido nos primeiros instantes do flash.
  function drawElasticFlash(ctx, pos, intensity) {
    if (!pos || intensity <= 0) return;
    ctx.save();
    const r = 78;
    const g = ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, r);
    g.addColorStop(0, `rgba(255,255,255,${0.95 * intensity})`);
    g.addColorStop(0.4, `rgba(255,235,180,${0.75 * intensity})`);
    g.addColorStop(1, 'rgba(255,235,180,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Aro cor de elástico (mesmo tom dos rebatedores laterais) em volta de
  // cada bumper que tem comportamento de elástico — sinaliza pra quem joga
  // QUAIS aros são interativos. Mesma técnica do contorno dourado (ver
  // drawArt): desenhado ANTES do preenchimento azul do vetor, exatamente no
  // raio real do furo — o azul entrando por cima cobre a metade interna do
  // traço, sobrando só uma franja fina bem ancorada na borda de verdade, em
  // vez de um aro inteiro flutuando por fora dela (inset -2 com traço largo,
  // do jeito antigo). O par logo abaixo do sino pede um contorno ainda mais
  // justo (não era bumper na ideia original, mas foi mantido) — traço mais
  // fino só pra esses dois.
  function drawElasticBumperBorders(ctx, bumpers) {
    if (!bumpers || !bumpers.length) return;
    ctx.save();
    for (const b of bumpers) {
      const tight = ELASTIC_BUMPER_TIGHT_POSITIONS.some(
        (p) => Math.hypot(p.x - b.x, p.y - b.y) < 12
      );
      const g = ctx.createLinearGradient(b.x - b.r, b.y, b.x + b.r, b.y);
      g.addColorStop(0, COLORS.slingDark);
      g.addColorStop(0.5, COLORS.slingLight);
      g.addColorStop(1, COLORS.slingDark);
      ctx.strokeStyle = g;
      ctx.lineWidth = tight ? 3 : 6;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBellGlow(ctx, intensity, bell) {
    if (intensity <= 0 || !bell) return;
    const b = bell;
    ctx.save();
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.4, b.x, b.y, b.r * 3.4);
    g.addColorStop(0, `rgba(255, 238, 170, ${0.8 * intensity})`);
    g.addColorStop(1, 'rgba(255, 238, 170, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Elástico dos rebatedores laterais: madeira clara amarelo-alaranjada.
  function drawSlings(ctx, flash) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const s of PINBALL_SLINGS) {
      const p = new Path2D();
      p.moveTo(s.x1, s.y1);
      p.lineTo(s.x2, s.y2);

      ctx.save();
      ctx.translate(0, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = PHYSICS.slingThickness;
      ctx.stroke(p);
      ctx.restore();

      const g = ctx.createLinearGradient(s.x1, s.y1, s.x2, s.y2);
      g.addColorStop(0, COLORS.slingLight);
      g.addColorStop(0.5, COLORS.slingMid);
      g.addColorStop(1, COLORS.slingDark);
      ctx.strokeStyle = g;
      ctx.lineWidth = PHYSICS.slingThickness;
      ctx.stroke(p);

      ctx.strokeStyle = flash > 0
        ? `rgba(255, 255, 255, ${0.5 * flash})`
        : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 3;
      ctx.stroke(p);
    }
    ctx.restore();
  }

  function drawFlipper(ctx, pivot, angle) {
    const len = BOARD.flipperLength;
    const th = BOARD.flipperThickness;
    const r = th / 2;
    ctx.save();
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.roundRect(-r, -r + 5, len + th, th, r);
    ctx.fill();

    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, COLORS.woodLight);
    g.addColorStop(0.5, COLORS.woodMid);
    g.addColorStop(1, COLORS.woodDark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(-r, -r, len + th, th, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,18,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#20160c';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBall(ctx, x, y) {
    const r = BOARD.ballRadius;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 4, r * 0.95, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#d3d9dc');
    g.addColorStop(1, '#5b6469');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Mola do lançador: a base fica PRESA no fundo do canal (ponto fixo); só a
  // ponta de cima (que encosta na bola) se move, comprimindo conforme a
  // carga — como uma mola de plunger de verdade.
  function drawLauncher(ctx, charge) {
    const s = SPRING_VISUAL_SCALE;
    const x = BOARD.launcherX + SPRING_VISUAL_OFFSET.x;
    const anchorY = Math.min(BOARD.height - 8, BOARD.launcherRestY + BOARD.ballRadius + BOARD.launcherTravel)
      + SPRING_VISUAL_OFFSET.y;
    const relaxedTopY = BOARD.launcherRestY + BOARD.ballRadius + 6 + SPRING_VISUAL_OFFSET.y;
    const topY = relaxedTopY + charge * (anchorY - relaxedTopY) * 0.55;
    const coils = 10;
    ctx.save();
    ctx.strokeStyle = charge > 0 ? '#f0b923' : '#8d979c';
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, anchorY);
    for (let i = 1; i <= coils; i++) {
      const t = i / coils;
      const yy = anchorY - (anchorY - topY) * t;
      ctx.lineTo(x + (i % 2 === 0 ? -13 : 13) * s, yy);
    }
    ctx.stroke();
    // base fixa, ancorada no fundo do gabinete
    ctx.strokeStyle = '#6f797e';
    ctx.lineWidth = 9 * s;
    ctx.beginPath();
    ctx.moveTo(x - 20 * s, anchorY + 4);
    ctx.lineTo(x + 20 * s, anchorY + 4);
    ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, params) {
    const {
      flippers, ball, charge, bellFlash, bell, slingFlash, doorOpenness,
      elasticFlash, elasticFlashPos, elasticBumpers,
    } = params;
    drawBackground(ctx);
    drawBellGlow(ctx, bellFlash, bell);
    drawWoodBorder(ctx);
    drawElasticBumperBorders(ctx, elasticBumpers);
    drawArt(ctx);
    drawBell(ctx, bell);
    drawSlings(ctx, slingFlash || 0);
    drawElasticFlash(ctx, elasticFlashPos, elasticFlash || 0);
    drawLauncherDoor(ctx, doorOpenness || 0);
    drawLauncher(ctx, charge);
    drawFlipper(ctx, flippers.left.pivot, flippers.left.angle);
    drawFlipper(ctx, flippers.right.pivot, flippers.right.angle);
    if (ball) drawBall(ctx, ball.x, ball.y);

    if (bellFlash > 0) {
      ctx.fillStyle = `rgba(255, 238, 170, ${bellFlash * 0.14})`;
      ctx.fillRect(0, 0, BOARD.width, BOARD.height);
    }
  }

  return { draw };
})();
