// Ponteiro (mouse + toque) do estilingue — base direta do Passe-Trappe
// (passe-trappe/js/input.js), incluindo as redes de segurança de soltura
// fora da janela, com uma diferença: aqui as âncoras trocam de ponta a cada
// turno, então o clamp do arrasto é POR LADO (ver setSide).
//
// Sem curva de resposta: o disco segue o cursor 1:1, como no Passe-Trappe —
// a "sensação de elástico" fica toda na força do tiro (computeShot em
// game.js), calculada na hora da soltura. A versão com curva foi testada no
// Curling e reprovada (parecia que o jogo reposicionava a peça sozinho).

const GameInput = (function () {
  let canvas;
  let dragging = false;
  let hooks = null;
  let side = SIDES[PLAYERS.RED];
  // Deslocamento entre o ponto tocado e o centro do disco no instante do
  // agarre. O arrasto é RELATIVO: o disco anda o mesmo tanto que o dedo, em
  // vez de pular pro ponto tocado. Isso é o que permite um alvo de toque
  // generoso (ver BOARD.grabRadius) sem que tocar de raspão teleporte o
  // disco — no celular o disco tem só ~28px de tela, mirar no centro dele
  // seria pedir demais do dedo.
  let grabOffset = { x: 0, y: 0 };

  function setSide(player) {
    side = SIDES[player];
  }

  // Coordenadas de cliente (CSS px) → coordenadas lógicas do tabuleiro
  // (origem no canto da superfície, sem a moldura dos trilhos).
  function clientToBoard(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const totalW = BOARD.width + BOARD.railThickness * 2;
    const totalH = BOARD.height + BOARD.railThickness * 2;
    return {
      x: (clientX - rect.left) * (totalW / rect.width) - BOARD.railThickness,
      y: (clientY - rect.top) * (totalH / rect.height) - BOARD.railThickness
    };
  }

  // Limites do arrasto: só ATRÁS da própria âncora (entre o elástico e o
  // trilho de trás daquele lado). Sem isso dava pra levar o disco na mão até
  // o centro da mesa e largá-lo em cima do alvo, sem nunca usar o elástico.
  // Posição do DISCO correspondente a um ponto do ponteiro (ponteiro +
  // deslocamento do agarre), já dentro dos limites do lado ativo.
  function discPosition(clientX, clientY) {
    const raw = clientToBoard(clientX, clientY);
    return clamp({ x: raw.x + grabOffset.x, y: raw.y + grabOffset.y });
  }

  function clamp(pos) {
    const minX = BOARD.pieceRadius;
    const maxX = BOARD.width - BOARD.pieceRadius;
    let minY, maxY;
    if (side.backwardSign === 1) {
      minY = side.anchorY;
      maxY = BOARD.height - BOARD.railThickness - BOARD.pieceRadius;
    } else {
      minY = BOARD.railThickness + BOARD.pieceRadius;
      maxY = side.anchorY;
    }
    return {
      x: Math.max(minX, Math.min(maxX, pos.x)),
      y: Math.max(minY, Math.min(maxY, pos.y))
    };
  }

  function onPointerDown(e) {
    GameAudio.ensureCtx();
    const raw = clientToBoard(e.clientX, e.clientY);
    const grab = hooks.tryGrab(raw.x, raw.y);
    if (!grab) return;
    grabOffset = { x: grab.x - raw.x, y: grab.y - raw.y };
    dragging = true;
    // Captura o ponteiro pra continuar recebendo o arrasto mesmo se ele sair
    // do canvas. Protegido: navegadores lançam quando o pointerId não está
    // mais ativo (ou em eventos sintéticos), e deixar estourar aqui abortaria
    // o resto do handler com o arrasto já iniciado.
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    // NÃO reposiciona o disco no ponto do toque aqui — ele só se move quando
    // o jogador de fato arrastar (próximo pointermove real).
  }

  function handleMove(e) {
    if (!dragging) return;
    // Soltura que aconteceu fora da janela (sem pointerup): o ponteiro volta
    // já sem botão pressionado. Tratar como soltura evita o arrasto travado
    // pra sempre (bug real do Passe-Trappe).
    if (e.buttons === 0) {
      dragging = false;
      const pos = discPosition(e.clientX, e.clientY);
      hooks.onRelease(pos.x, pos.y);
      return;
    }
    const pos = discPosition(e.clientX, e.clientY);
    hooks.onDrag(pos.x, pos.y);
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    const pos = discPosition(e.clientX, e.clientY);
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
    window.addEventListener('pointerup', (e) => {
      if (dragging) onPointerUp(e);
    });
    window.addEventListener('blur', () => {
      if (!dragging) return;
      dragging = false;
      hooks.onCancel && hooks.onCancel();
    });
  }

  return { attach, setSide, isDragging: () => dragging };
})();
