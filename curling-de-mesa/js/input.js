// Estilingue: pointer events unificados (mouse + touch) para puxar e soltar a peça ativa.

const GameInput = (function () {
  const anchorL = { x: BOARD.anchorInset, y: BOARD.anchorY };
  const anchorR = { x: BOARD.width - BOARD.anchorInset, y: BOARD.anchorY };
  const anchorMid = { x: BOARD.width / 2, y: BOARD.anchorY };
  // Em repouso a peça fica exatamente na altura das âncoras, então o
  // estilingue começa esticado na horizontal (reto), não em triângulo —
  // o "V" só aparece quando o jogador puxa a peça para trás.
  const restPosition = { x: BOARD.width / 2, y: BOARD.anchorY };
  const MIN_PULL = 14;

  let canvas;
  let dragging = false;
  let hooks = null;

  // Mapeia coordenadas de cliente (CSS px) para coordenadas lógicas do board
  // (origem no canto da superfície de jogo, sem a moldura dos trilhos).
  // O canvas usa aspect-ratio para manter a proporção lógica, então basta
  // a razão entre o tamanho lógico total e o tamanho exibido em CSS — o
  // devicePixelRatio (resolução interna do canvas) não entra nessa conta.
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

  // Curva de resposta do elástico: quanto mais o dedo puxa, menos a peça
  // efetivamente se move por unidade de arrasto — simula o elástico ficando
  // mais rígido perto do limite, em vez de um clamp abrupto.
  const STIFFNESS = 3;

  function clamp(pos) {
    let dx = pos.x - anchorMid.x;
    let dy = pos.y - anchorMid.y;
    const rawDist = Math.hypot(dx, dy);
    const ratio = PHYSICS.maxPullDistance * (1 - 1 / (1 + STIFFNESS * rawDist / PHYSICS.maxPullDistance));
    if (rawDist > 0.0001) {
      const k = ratio / rawDist;
      dx *= k;
      dy *= k;
    }
    let x = anchorMid.x + dx;
    let y = anchorMid.y + dy;
    // não deixa puxar para além (na frente) das âncoras
    const minY = BOARD.anchorY + 16;
    const maxY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;
    y = Math.max(minY, Math.min(maxY, y));
    x = Math.max(BOARD.pieceRadius, Math.min(BOARD.width - BOARD.pieceRadius, x));
    return { x, y };
  }

  const GRAB_RADIUS = BOARD.pieceRadius * 1.8;

  function onPointerDown(e) {
    GameAudio.ensureCtx();
    if (!hooks.canDrag()) return;
    const raw = clientToBoard(e.clientX, e.clientY);
    const piecePos = hooks.getPiecePosition();
    if (Math.hypot(raw.x - piecePos.x, raw.y - piecePos.y) > GRAB_RADIUS) return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    hooks.onDragStart && hooks.onDragStart();
    handleMove(e);
  }

  function handleMove(e) {
    if (!dragging) return;
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clamp(raw);
    hooks.onDrag(pos.x, pos.y);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clamp(raw);
    const dx = anchorMid.x - pos.x;
    const dy = anchorMid.y - pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < MIN_PULL) {
      hooks.onCancel && hooks.onCancel();
      return;
    }
    const dirX = dx / dist;
    const dirY = dy / dist;
    hooks.onRelease(dirX, dirY, dist);
  }

  function attach(canvasEl, options) {
    canvas = canvasEl;
    hooks = options;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', handleMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  return {
    attach,
    anchorL,
    anchorR,
    anchorMid,
    restPosition,
    isDragging: () => dragging
  };
})();
