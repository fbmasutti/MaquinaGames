// Estilingue do jogador: pointer events unificados (mouse + touch) para
// pegar QUALQUER disco em repouso do jogador (não um único "ativo" fixo —
// ver hooks.tryGrab), puxar contra o elástico e soltar. Mesma curva de
// resposta do Curling de Mesa (ver curling-de-mesa/js/input.js), só com as
// âncoras na borda INFERIOR (BOARD.playerAnchorY). A máquina não usa este
// módulo — ela atira sozinha via ai.js, sem input de ponteiro.

const GameInput = (function () {
  const anchorL = { x: BOARD.anchorInset, y: BOARD.playerAnchorY };
  const anchorR = { x: BOARD.width - BOARD.anchorInset, y: BOARD.playerAnchorY };
  const anchorMid = { x: BOARD.width / 2, y: BOARD.playerAnchorY };

  let canvas;
  let dragging = false;
  let hooks = null;

  // Mapeia coordenadas de cliente (CSS px) para coordenadas lógicas do
  // board (origem no canto da superfície de jogo, sem a moldura dos
  // trilhos) — mesma conta do Curling de Mesa.
  function clientToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    const scaleX = totalW / rect.width;
    const scaleY = totalH / rect.height;
    return {
      x: (clientX - rect.left) * scaleX - BOARD.railThickness,
      y: (clientY - rect.top) * scaleY - BOARD.railThickness
    };
  }

  // SEM curva de resposta — o disco segue o cursor 1:1, sem nenhuma
  // transformação. A versão anterior calculava a posição a partir da
  // distância CRUA do cursor até a âncora (não do quanto o jogador de fato
  // arrastou), então qualquer movimento pequeno já recomputava uma posição
  // bem diferente — sentia como se o jogo reposicionasse a peça sozinho.
  // Só os limites físicos do tabuleiro entram aqui; a "sensação de
  // elástico" fica inteiramente na velocidade do tiro (ver
  // launchDraggingDisc em game.js), calculada a partir da distância real
  // até a âncora no momento da soltura, não durante o arrasto.
  function clamp(pos) {
    const minX = BOARD.pieceRadius;
    const maxX = BOARD.width - BOARD.pieceRadius;
    // Pra trás: não passa do trilho. Pra frente: não passa da divisória —
    // senão dava pra "carregar" o disco pro campo da máquina na mão, sem
    // nunca soltar o elástico.
    const minY = BOARD.dividerBottomY + BOARD.pieceRadius;
    const maxY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;
    return {
      x: Math.max(minX, Math.min(maxX, pos.x)),
      y: Math.max(minY, Math.min(maxY, pos.y))
    };
  }

  function onPointerDown(e) {
    GameAudio.ensureCtx();
    const raw = clientToBoard(e.clientX, e.clientY);
    // hooks.tryGrab acha (e reserva) o disco mais próximo do toque, dentro
    // de BOARD.grabRadius — qualquer disco do jogador ainda do seu lado
    // serve, parado ou em movimento (ver game.js: tryGrab não exige mais
    // que o disco esteja assentado).
    if (!hooks.tryGrab(raw.x, raw.y)) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    // NÃO chama handleMove aqui — reposicionar o disco already-parado pro
    // ponto (curvado) do toque é exatamente o "pulo automático pro centro
    // do elástico" que o jogador não quer. A peça só se move quando o
    // jogador de fato arrasta (próximo pointermove real).
  }

  function handleMove(e) {
    if (!dragging) return;
    // Se o botão/dedo já não está mais pressionado quando o evento chega
    // (o release aconteceu fora da janela — sem pointerup pra avisar a
    // página — e o ponteiro voltou a se mover ainda "preso" ao arrasto),
    // trata como soltura em vez de continuar arrastando pra sempre. Sem
    // isso o arrasto ficava travado precisando de um novo clique só pra
    // resetar o estado (nem sempre resolvia, já que tryGrab recusa pegar
    // outro disco enquanto ainda há um "sendo arrastado").
    if (e.buttons === 0) {
      dragging = false;
      const raw = clientToBoard(e.clientX, e.clientY);
      hooks.onRelease(clamp(raw).x, clamp(raw).y);
      return;
    }
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clamp(raw);
    hooks.onDrag(pos.x, pos.y);
  }

  // A decisão de disparo/cancelamento e o vetor de tiro NÃO são calculados
  // aqui — dependiam da distância até a âncora fixa (anchorMid), que fica
  // bem longe da fila de discos encostada na lateral (a fila nasce perto
  // da divisória, a âncora fica perto do trilho de trás). Um arrasto real e
  // generoso do disco raramente cruzava essa linha, então o disco sempre
  // cancelava e voltava pro ponto exato de onde foi pego — parecendo que o
  // drag and drop simplesmente não funcionava (bug real reportado). Quem
  // decide isso agora é o game.js, com base em ONDE o disco foi pego (ver
  // state.dragStartPos), não numa linha fixa do tabuleiro — assim funciona
  // igual pra qualquer disco, não importa a distância dele até a âncora.
  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clamp(raw);
    hooks.onRelease(pos.x, pos.y);
  }

  function attach(canvasEl, options) {
    canvas = canvasEl;
    hooks = options;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    // Redes de segurança pro caso do ponteiro sair da JANELA inteira (não
    // só do canvas) durante o arrasto: se o botão for solto lá fora, a
    // página não recebe NENHUM evento até o ponteiro voltar — sem isso o
    // disco ficava "preso" na mão pra sempre. pointerup em window ainda
    // pega a soltura se o ponteiro voltar a entrar na janela antes de
    // subir; blur cobre o caso de trocar de janela/aba com o botão ainda
    // apertado, onde nem isso chega a acontecer.
    window.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      onPointerUp(e);
    });
    window.addEventListener('blur', () => {
      if (!dragging) return;
      dragging = false;
      hooks.onCancel && hooks.onCancel();
    });
  }

  return {
    attach,
    anchorL,
    anchorR,
    anchorMid,
    isDragging: () => dragging
  };
})();
