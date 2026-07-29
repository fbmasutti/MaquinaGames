// Arremesso por gesto: sem estilingue — o jogador "pega" o disco e arrasta
// na direção da tacada; a velocidade real do gesto no instante da soltura
// (últimos PHYSICS.flickWindowMs de movimento) define força e direção,
// igual a um lançamento de mão de verdade. Funciona igual em mouse e touch,
// já que os dois dão posição+tempo do ponteiro.

const GameInput = (function () {
  const restPosition = { x: BOARD.width / 2, y: BOARD.restY };
  const GRAB_RADIUS = BOARD.pieceRadius * 1.8;
  // Janela onde o disco pode ser arrastado durante o "wind-up" do
  // arremesso — não é elástico, só evita que o disco saia da área de
  // lançamento enquanto o jogador prepara o gesto.
  const DRAG_MIN_Y = BOARD.restY - 260;
  const DRAG_MAX_Y = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;

  let canvas;
  let dragging = false;
  let hooks = null;
  let history = []; // {x, y, t} amostras recentes do ponteiro durante o arrasto

  // Mapeia coordenadas de cliente (CSS px) para coordenadas lógicas do board
  // (origem no canto da superfície de jogo, sem a moldura dos trilhos).
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

  function clampPos(pos) {
    const x = Math.max(BOARD.pieceRadius, Math.min(BOARD.width - BOARD.pieceRadius, pos.x));
    const y = Math.max(DRAG_MIN_Y, Math.min(DRAG_MAX_Y, pos.y));
    return { x, y };
  }

  function trimHistory(now) {
    while (history.length > 1 && now - history[0].t > PHYSICS.flickWindowMs) history.shift();
  }

  // Velocidade a partir da janela recente de movimento — usada tanto na
  // soltura de verdade quanto na prévia visual enquanto o jogador arrasta.
  function computeVelocity(now) {
    trimHistory(now);
    if (history.length < 2) return null;
    const first = history[0];
    const last = history[history.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return null;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.5) return null;
    const pxPerMs = dist / dt;
    const speed = Math.min(pxPerMs * PHYSICS.flickSpeedScale, PHYSICS.maxLaunchSpeed);
    return { dirX: dx / dist, dirY: dy / dist, speed };
  }

  function onPointerDown(e) {
    GameAudio.ensureCtx();
    if (!hooks.canDrag()) return;
    const raw = clientToBoard(e.clientX, e.clientY);
    const piecePos = hooks.getPiecePosition();
    if (Math.hypot(raw.x - piecePos.x, raw.y - piecePos.y) > GRAB_RADIUS) return;
    dragging = true;
    history = [{ x: raw.x, y: raw.y, t: performance.now() }];
    canvas.setPointerCapture(e.pointerId);
    hooks.onDragStart && hooks.onDragStart();
    handleMove(e);
  }

  function handleMove(e) {
    if (!dragging) return;
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clampPos(raw);
    const now = performance.now();
    history.push({ x: pos.x, y: pos.y, t: now });
    trimHistory(now);
    hooks.onDrag(pos.x, pos.y);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const raw = clientToBoard(e.clientX, e.clientY);
    const pos = clampPos(raw);
    const now = performance.now();
    history.push({ x: pos.x, y: pos.y, t: now });
    const v = computeVelocity(now);
    history = [];
    if (!v || v.speed < PHYSICS.minFlickSpeed) {
      hooks.onCancel && hooks.onCancel();
      return;
    }
    hooks.onRelease(v.dirX, v.dirY, v.speed);
  }

  // Prévia da tacada em andamento — mesma leitura usada na soltura de
  // verdade, só que consultada quadro a quadro pra desenhar a seta de
  // direção/força enquanto o jogador ainda está arrastando.
  function getPreviewVelocity() {
    if (!dragging) return null;
    return computeVelocity(performance.now());
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
    restPosition,
    getPreviewVelocity,
    isDragging: () => dragging
  };
})();
